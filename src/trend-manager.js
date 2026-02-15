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
            const SWIPE_DRAG_STEPS = 3;
            const SWIPE_SETTLE_MS = 50;
            const SWIPE_START_RATIO = 0.90;
            const SWIPE_END_RATIO = 0.05; // 85% 이동(90% -> 5%)
            let swipeCount = 0;
            let noNewCategoryCount = 0; // 새로운 카테고리가 안 나오는 횟수 연속 체크

            Logger.info('🔄 카테고리 순회 및 키워드 추출 시작 (스와이프 동작 포함)...');

            // 스와이프 컨테이너는 루프 밖에서 1회 캐싱
            const swiperSelector = '.u_ni_search_swiper';
            const swiperBox = await page.$(swiperSelector);
            if (!swiperBox) {
                Logger.warn('⚠️ 스와이프 컨테이너(.u_ni_search_swiper)를 찾을 수 없습니다.');
                return allKeywords;
            }

            while (swipeCount < MAX_SWIPES) {
                // 현재 화면에 보이는 슬라이드들 찾기
                // .swiper-slide-active 와 그 주변 슬라이드들이 보일 것임.
                // 하지만 안전하게 DOM에 있는 모든 visible한 .u_ni_trend_list_box를 대상으로 함.

                // 4-1. 현재 페이지 데이터 추출
                // NOTE:
                // pkg 환경의 function 직렬화 이슈를 피하기 위해 "문자열 evaluate"를 사용한다.
                // (브라우저 컨텍스트 일괄 파싱으로 성능도 기존 수준에 가깝게 회복)
                const extractTrendsScript = `
(() => {
  const isVisible = (el) => {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (!style || style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const allBoxes = Array.from(document.querySelectorAll('.u_ni_trend_list_box'));
  const visibleBoxes = allBoxes.filter(isVisible);
  const boxes = visibleBoxes.length > 0 ? visibleBoxes : allBoxes;
  const results = [];

  for (const box of boxes) {
    const titleEl = box.querySelector('.u_ni_trend_title');
    if (!titleEl) continue;
    const title = (titleEl.innerText || '').trim();
    if (!title) continue;

    const items = [];
    const itemEls = box.querySelectorAll('.u_ni_trend_item');

    for (const item of itemEls) {
      const keywordEl = item.querySelector('.u_ni_trend_text');
      if (!keywordEl) continue;
      const keyword = (keywordEl.innerText || '').trim();
      if (!keyword) continue;

      let variation = '-';
      const dataEl = item.querySelector('.u_ni_data');
      if (dataEl) {
        const text = (dataEl.innerText || '').trim();
        const className = dataEl.className || '';
        if (className.includes('up')) variation = '+' + text;
        else if (className.includes('down')) variation = '-' + text;
        else if (className.includes('new')) variation = 'new';
        else variation = text || '-';
      }

      items.push({ keyword, variation });
    }

    if (items.length > 0) results.push({ title, items });
  }

  return results;
})()
`;

                const pageData = await page.evaluate(extractTrendsScript);

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
                if (swiperBox) {
                    const boundingBox = await swiperBox.boundingBox();
                    if (boundingBox) {
                        const startX = boundingBox.x + boundingBox.width * SWIPE_START_RATIO;
                        const endX = boundingBox.x + boundingBox.width * SWIPE_END_RATIO;
                        const y = boundingBox.y + boundingBox.height / 2;       // 중간 높이

                        // 마우스 이동 및 드래그
                        await page.mouse.move(startX, y);
                        await page.mouse.down();
                        await page.mouse.move(endX, y, { steps: SWIPE_DRAG_STEPS });
                        await page.mouse.up();

                        swipeCount++;
                        // 빠르게 다음 슬라이드로 진행 (속도 우선)
                        await page.waitForTimeout(SWIPE_SETTLE_MS);
                    } else {
                        Logger.warn('⚠️ 스와이프 영역을 찾을 수 없습니다 (BoundingBox Fail).');
                        break;
                    }
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
