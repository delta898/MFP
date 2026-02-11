const path = require('path');
const fs = require('fs');
const { launchBrowser } = require('./browser-launcher');
const CONFIG = require('./config-loader');
const Logger = require('./logger');

const TrendManager = {
    /**
     * 트렌드 키워드 수집 메인 함수
     */
    fetchTrends: async function () {
        Logger.info('📈 네이버 크리에이터 어드바이저 트렌드 수집을 시작합니다...');

        const NAVER_ID = CONFIG.NAVER_ID;
        if (!NAVER_ID) {
            throw new Error('설정 파일에 NAVER_ID가 없습니다.');
        }

        const browser = await launchBrowser();

        // 1. 로그인 정보(Storage State) 로드
        const authPath = path.join(process.cwd(), 'config', 'auth.json');
        let context;

        if (fs.existsSync(authPath)) {
            try {
                // Playwright의 storageState 기능을 사용하여 쿠키/로컬스토리지 자동 로드
                context = await browser.newContext({ storageState: authPath });
                Logger.info('✅ 로그인 정보(auth.json)를 로드했습니다.');
            } catch (e) {
                Logger.error(`❌ auth.json 로드 실패: ${e.message}`);
                // 파일이 깨졌을 경우를 대비해 기본 컨텍스트 생성
                context = await browser.newContext();
            }
        } else {
            Logger.warn('⚠️ 로그인 정보(auth.json)가 없습니다. 비로그인 상태로 진행합니다.');
            context = await browser.newContext();
        }

        const page = await context.newPage();

        try {
            // 2. 트렌드 페이지 이동
            const targetUrl = `https://creator-advisor.naver.com/naver_blog/${NAVER_ID}/trends`;
            Logger.info(`🔗 접속 중: ${targetUrl}`);
            await page.goto(targetUrl, { waitUntil: 'networkidle' });

            // 3. 데이터 로딩 대기
            try {
                // 트렌드 리스트 박스가 뜰 때까지 대기 (최대 10초)
                await page.waitForSelector('.u_ni_trend_list_box', { timeout: 10000 });
            } catch (e) {
                Logger.warn('⚠️ 트렌드 리스트를 찾지 못했습니다. 로그인을 확인하거나 페이지 구조가 변경되었을 수 있습니다.');
                // 스크린샷 저장 (디버깅용)
                await page.screenshot({ path: 'logs/debug_trend_fail.png' });
                throw e;
            }

            // 4. 카테고리 순회 및 키워드 수집
            // 이미 수집한 카테고리 제목을 저장하여 중복 방지
            const collectedCategories = new Set();
            let allKeywords = [];

            // 최대 스와이프 횟수 제한 (무한 루프 방지) - 카테고리가 많으므로 충분히 늘림
            const MAX_SWIPES = 50;
            let swipeCount = 0;
            let noNewCategoryCount = 0; // 새로운 카테고리가 안 나오는 횟수 연속 체크

            Logger.info('🔄 카테고리 순회 및 키워드 추출 시작 (스와이프 동작 포함)...');

            while (swipeCount < MAX_SWIPES) {
                // 현재 화면에 보이는 슬라이드들 찾기
                // .swiper-slide-active 와 그 주변 슬라이드들이 보일 것임.
                // 하지만 안전하게 DOM에 있는 모든 visible한 .u_ni_trend_list_box를 대상으로 함.

                // 4-1. 현재 페이지 데이터 추출 (브라우저 컨텍스트 실행)
                const pageData = await page.evaluate(() => {
                    const results = [];
                    // 모든 트렌드 리스트 박스 순회
                    const boxes = document.querySelectorAll('.u_ni_trend_list_box');

                    boxes.forEach(box => {
                        // 제목 추출 (예: 맛집, 20대 여성 등)
                        const titleEl = box.querySelector('.u_ni_trend_title');
                        if (!titleEl) return;

                        const title = titleEl.innerText.trim();

                        // 아이템들 추출 (키워드 + 증감 데이터)
                        const itemEls = box.querySelectorAll('.u_ni_trend_item');
                        const items = [];

                        itemEls.forEach(item => {
                            const keywordEl = item.querySelector('.u_ni_trend_text');
                            const dataEl = item.querySelector('.u_ni_data');

                            if (keywordEl) {
                                const keyword = keywordEl.innerText.trim();
                                let variation = '-';

                                if (dataEl) {
                                    const text = dataEl.innerText.trim();
                                    if (dataEl.classList.contains('up')) {
                                        variation = `+${text}`;
                                    } else if (dataEl.classList.contains('down')) {
                                        variation = `-${text}`;
                                    } else if (dataEl.classList.contains('new')) {
                                        variation = 'new';
                                    } else {
                                        variation = text; // '-', '0' or others
                                    }
                                }
                                items.push({ keyword, variation });
                            }
                        });


                        if (items.length > 0) {
                            results.push({ title, items });
                        }
                    });
                    return results;
                });

                // 4-2. 데이터 필터링 및 저장
                let newCategoryFound = false;

                for (const data of pageData) {
                    const { title, items } = data;

                    // 이미 수집한 카테고리는 패스
                    if (collectedCategories.has(title)) continue;

                    // ✋ [Filter] 연령/성별 카테고리 제외
                    // 예: "20대 여성", "30대 남자", "10대", "남자", "여자" 등이 포함된 경우
                    if (title.match(/\d+대|남자|여자|남성|여성/)) {
                        Logger.info(`   🚫 [Skip] 인구통계 카테고리 제외: ${title}`);
                        collectedCategories.add(title); // 다시 보지 않도록 추가
                        continue;
                    }

                    // 유효한 주제 카테고리
                    Logger.info(`   ✅ [Collect] 카테고리 발견: ${title} (${items.length}개)`);

                    // [{ category: title, keyword: k, variation: v }, ...]
                    const newItems = items.map(item => ({
                        category: title,
                        keyword: item.keyword,
                        variation: item.variation
                    }));
                    allKeywords = [...allKeywords, ...newItems];

                    collectedCategories.add(title);
                    newCategoryFound = true;
                }

                if (!newCategoryFound) {
                    noNewCategoryCount++;
                } else {
                    noNewCategoryCount = 0; // 새로운 걸 찾았으니 리셋
                }

                // 연속으로 새로운 카테고리가 안 나오면 종료 (더 이상 볼 게 없음)
                if (noNewCategoryCount >= 3) {
                    Logger.info('✨ 더 이상 새로운 카테고리가 없습니다. 수집을 종료합니다.');
                    break;
                }

                // 4-3. 스와이프 액션 (오른쪽 -> 왼쪽) 3시 -> 9시
                // .u_ni_search_swiper 요소 위에서 드래그 수행
                const swiperSelector = '.u_ni_search_swiper';
                const swiperBox = await page.$(swiperSelector);

                if (swiperBox) {
                    const boundingBox = await swiperBox.boundingBox();
                    if (boundingBox) {
                        const startX = boundingBox.x + boundingBox.width * 0.8; // 오른쪽 80% 지점
                        const endX = boundingBox.x + boundingBox.width * 0.2;   // 왼쪽 20% 지점
                        const y = boundingBox.y + boundingBox.height / 2;       // 중간 높이

                        // 마우스 이동 및 드래그
                        await page.mouse.move(startX, y);
                        await page.mouse.down();
                        await page.mouse.move(endX, y, { steps: 10 }); // 부드럽게 이동
                        await page.mouse.up();

                        swipeCount++;
                        // 애니메이션 및 로딩 대기 (충분한 시간 부여)
                        await page.waitForTimeout(1500);
                    } else {
                        Logger.warn('⚠️ 스와이프 영역을 찾을 수 없습니다 (BoundingBox Fail).');
                        break;
                    }
                } else {
                    Logger.warn('⚠️ 스와이프 컨테이너(.u_ni_search_swiper)를 찾을 수 없습니다.');
                    break;
                }
            }

            // 5. 중복 제거 (키워드 기준)
            // 카테고리가 다르더라도 키워드가 같으면 중복으로 간주할지, 아니면 카테고리별로 살릴지?
            // 트렌드 분석이므로 카테고리별로 살리는게 좋겠지만, 구글 시트에 쌓일 때 중복 방지가 필요할 수도 있음.
            // 일단 단순하게 (Category + Keyword) 조합으로 유니크하게 가져가거나, 그냥 다 가져감.
            // 여기서는 모든 수집된 데이터를 반환함.

            // allKeywords 구조: [{ category: '맛집', keyword: '투썸' }, ...] 로 변경 필요
            // 위 로직에서 allKeywords = [...allKeywords, ...keywords] 했었는데 구조 변경

            Logger.info(`🎉 총 ${allKeywords.length}개의 트렌드 키워드 데이터를 수집했습니다.`);

            return allKeywords;

        } catch (error) {
            Logger.error(`❌ 트렌드 수집 중 오류 발생: ${error.message}`);
            throw error;
        } finally {
            if (browser) await browser.close();
        }
    }
};

module.exports = TrendManager;
