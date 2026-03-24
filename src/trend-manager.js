const path = require('path');
const fs = require('fs');
const moment = require('moment-timezone');
const { launchBrowser } = require('./browser-launcher');
const { persistAuthSessionState } = require('./auth-session');
const CONFIG = require('./config-loader');
const Logger = require('./logger');

function resolveTrendDateInput(rawInput) {
    if (!rawInput) return null;
    const input = String(rawInput).trim();
    const lowered = input.toLowerCase();

    const relativeMatch = lowered.match(/^-(\d+)d$/);
    if (relativeMatch) {
        const days = Number(relativeMatch[1]);
        if (Number.isInteger(days) && days >= 1) {
            return moment().tz('Asia/Seoul').subtract(days, 'day').format('YYYY-MM-DD');
        }
    }

    if (lowered === 'yesterday' || lowered === '어제') {
        return moment().tz('Asia/Seoul').subtract(1, 'day').format('YYYY-MM-DD');
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
        const parsed = moment.tz(input, 'YYYY-MM-DD', true, 'Asia/Seoul');
        if (parsed.isValid()) {
            return parsed.format('YYYY-MM-DD');
        }
    }
    if (/^\d{8}$/.test(input)) {
        const parsed = moment.tz(input, 'YYYYMMDD', true, 'Asia/Seoul');
        if (parsed.isValid()) {
            return parsed.format('YYYY-MM-DD');
        }
    }
    throw new Error(`잘못된 날짜 형식입니다: ${rawInput} (예: 2026-02-14, 20260214, yesterday 또는 -1d)`);
}

function toNaverDisplayDate(ymd) {
    const [year, month, day] = ymd.split('-');
    return `${year}. ${month}. ${day}.`;
}

function normalizeTrendDateTextToYmd(rawText) {
    const text = String(rawText || '').trim();
    if (!text) return null;

    // 예: "2026. 02. 18." / "2026.02.18." / "2026-02-18" / "2026/02/18"
    const dotted = text.match(/(\d{4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})/);
    if (dotted) {
        const y = Number(dotted[1]);
        const m = Number(dotted[2]);
        const d = Number(dotted[3]);
        const parsed = moment.tz(`${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, 'YYYY-MM-DD', true, 'Asia/Seoul');
        if (parsed.isValid()) return parsed.format('YYYY-MM-DD');
    }

    return null;
}

async function resolveTrendDateFromPage(page, fallbackDate = null) {
    const candidates = [
        'span.u_ni_range.cursor_pointer',
        '.u_ni_range.cursor_pointer',
        '.u_ni_range_component .u_ni_range'
    ];

    for (const selector of candidates) {
        try {
            const label = page.locator(selector).first();
            if (await label.count() > 0 && await label.isVisible()) {
                const text = (await label.innerText() || '').trim();
                const parsed = normalizeTrendDateTextToYmd(text);
                if (parsed) return parsed;
            }
        } catch (e) { }
    }

    if (fallbackDate) return fallbackDate;
    return moment().tz('Asia/Seoul').format('YYYY-MM-DD');
}

function extractFirstNumber(input) {
    const m = String(input || '').match(/\d+/);
    return m ? Number(m[0]) : null;
}

async function readSelectOptions(selectLocator) {
    const options = [];
    const optionLoc = selectLocator.locator('option');
    const count = await optionLoc.count();
    for (let i = 0; i < count; i++) {
        const opt = optionLoc.nth(i);
        const value = String(await opt.getAttribute('value') || '').trim();
        const label = String(await opt.innerText() || '').trim();
        options.push({ value, label });
    }
    return options;
}

async function selectYearOption(selectLocator, targetYear) {
    const options = await readSelectOptions(selectLocator);
    if (options.length === 0) return false;

    const direct = options.find(opt => extractFirstNumber(opt.label) === targetYear)
        || options.find(opt => extractFirstNumber(opt.value) === targetYear);
    if (!direct) return false;

    await selectLocator.selectOption(direct.value);
    return true;
}

async function selectMonthOption(selectLocator, targetMonth) {
    const options = await readSelectOptions(selectLocator);
    if (options.length === 0) return false;

    // label 우선 매칭 (예: "1월")
    let pick = options.find(opt => extractFirstNumber(opt.label) === targetMonth);

    // value 매칭 (one-based / zero-based 모두 시도)
    if (!pick) {
        pick = options.find(opt => Number(opt.value) === targetMonth);
    }
    if (!pick) {
        pick = options.find(opt => Number(opt.value) === (targetMonth - 1));
    }
    if (!pick) return false;

    await selectLocator.selectOption(pick.value);
    return true;
}

async function waitForDateCellVisible(page, targetDate, timeoutMs = 5000) {
    const startedAt = Date.now();
    const [yearStr, monthStr, dayStr] = targetDate.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const day = Number(dayStr);
    const ariaPrefix = `${year}년 ${month}월 ${day}일`;

    while ((Date.now() - startedAt) < timeoutMs) {
        try {
            const byDataDay = page.locator(`td[data-day="${targetDate}"]`).first();
            if (await byDataDay.count() > 0 && await byDataDay.isVisible()) {
                return { mode: 'data-day', locator: byDataDay };
            }
        } catch (e) { }

        try {
            const byAria = page.locator(`button.rdp-day_button[aria-label^="${ariaPrefix}"]`).first();
            if (await byAria.count() > 0 && await byAria.isVisible()) {
                return { mode: 'aria', locator: byAria };
            }
        } catch (e) { }

        await page.waitForTimeout(120);
    }

    return null;
}

async function selectTrendDate(page, targetDate) {
    if (!targetDate) return;
    const [targetYear, targetMonth] = targetDate.split('-').map(Number);

    const calendarButtonCandidates = [
        page.locator('button.u_ni_btn_calendar').first(),
        page.locator('.u_ni_btn_calendar').first(),
        page.locator('span.u_ni_range.cursor_pointer').first(),
        page.locator('.u_ni_range.cursor_pointer').first()
    ];

    let opened = false;
    for (const candidate of calendarButtonCandidates) {
        try {
            if (await candidate.count() > 0 && await candidate.isVisible()) {
                await candidate.click({ force: true });
                opened = true;
                break;
            }
        } catch (e) { }
    }

    if (!opened) {
        throw new Error('날짜 선택 버튼을 찾을 수 없습니다.');
    }

    // 월이 다른 날짜도 선택 가능하도록 year/month 드롭다운을 우선 맞춘다.
    const yearSelect = page.locator('select.ui-datepicker-year, select[name="year"]').first();
    if (await yearSelect.count() > 0) {
        const yearSelected = await selectYearOption(yearSelect, targetYear);
        if (!yearSelected) {
            throw new Error(`달력 연도 선택 실패: ${targetYear}년`);
        }
        await page.waitForTimeout(120);
    }

    const monthSelect = page.locator('select.ui-datepicker-month, select[name="month"]').first();
    if (await monthSelect.count() > 0) {
        const monthSelected = await selectMonthOption(monthSelect, targetMonth);
        if (!monthSelected) {
            throw new Error(`달력 월 선택 실패: ${targetMonth}월`);
        }
        await page.waitForTimeout(150);
    }

    const targetCell = await waitForDateCellVisible(page, targetDate, 5000);
    if (!targetCell) {
        throw new Error(`달력에서 지정 날짜를 찾지 못했습니다: ${targetDate}`);
    }

    if (targetCell.mode === 'aria') {
        await targetCell.locator.click({ force: true });
    } else {
        const dayButton = targetCell.locator.locator('button.rdp-day_button, button').first();
        if (await dayButton.count() > 0) {
            await dayButton.click({ force: true });
        } else {
            await targetCell.locator.click({ force: true });
        }
    }

    const expected = toNaverDisplayDate(targetDate);
    const dateLabel = page.locator('span.u_ni_range.cursor_pointer, .u_ni_range.cursor_pointer').first();
    let updated = false;
    for (let i = 0; i < 20; i++) {
        try {
            if (await dateLabel.count() > 0) {
                const text = (await dateLabel.innerText()).trim();
                if (text.includes(expected)) {
                    updated = true;
                    break;
                }
            }
        } catch (e) { }
        await page.waitForTimeout(100);
    }

    // 달력 레이어가 남아있으면 닫아준다.
    try {
        const overlay = page.locator('div.rdp, .rdp, [class*="DayPicker"]').first();
        if (await overlay.count() > 0 && await overlay.isVisible()) {
            await page.keyboard.press('Escape');
            await page.waitForTimeout(120);
        }
    } catch (e) { }

    if (!updated) {
        throw new Error(`날짜 변경 확인 실패: ${targetDate}`);
    }
}

async function waitForTrendDataReady(page, timeoutMs = 12000) {
    const startedAt = Date.now();
    const listLocator = page.locator('.u_ni_trend_list_box');
    const emptyStateCandidates = [
        '.u_ni_no_data',
        '.u_ni_empty',
        '.u_ni_no_result',
        '.u_ni_contents:has-text("데이터가 없습니다")',
        '.u_ni_contents:has-text("조회된 데이터가 없습니다")',
        '.u_ni_contents:has-text("표시할 데이터가 없습니다")',
        '.u_ni_contents:has-text("조회한 기간의 데이터가 없습니다")',
        'div:has-text("데이터가 없습니다")',
        'p:has-text("데이터가 없습니다")'
    ];

    while ((Date.now() - startedAt) < timeoutMs) {
        try {
            if (await listLocator.count() > 0 && await listLocator.first().isVisible()) {
                return { state: 'ready' };
            }
        } catch (e) { }

        for (const selector of emptyStateCandidates) {
            try {
                const node = page.locator(selector).first();
                if (await node.count() > 0 && await node.isVisible()) {
                    return { state: 'empty' };
                }
            } catch (e) { }
        }

        await page.waitForTimeout(200);
    }

    return { state: 'timeout' };
}

const TrendManager = {
    /**
     * 트렌드 키워드 수집 메인 함수
     */
    fetchTrends: async function (options = {}) {
        Logger.info('📈 네이버 크리에이터 어드바이저 트렌드 수집을 시작합니다...');

        const NAVER_ID = CONFIG.NAVER_ID;
        if (!NAVER_ID) {
            throw new Error('설정 파일에 NAVER_ID가 없습니다.');
        }
        const targetDate = resolveTrendDateInput(options.date);
        if (targetDate) {
            Logger.info(`📅 트렌드 수집 기준일 지정: ${targetDate}`);
        }

        const browser = await launchBrowser({ headless: options.headless });

        // 1. 로그인 정보(Storage State) 로드
        const authPath = CONFIG.AUTH_FILE_PATH || path.join(CONFIG.ROOT_DIR, 'config', 'naver_auth.json');
        let context;

        if (fs.existsSync(authPath)) {
            try {
                // Playwright의 storageState 기능을 사용하여 쿠키/로컬스토리지 자동 로드
                context = await browser.newContext({ storageState: authPath });
                Logger.info('✅ 로그인 정보(naver_auth.json)를 로드했습니다.');
            } catch (e) {
                Logger.error(`❌ naver_auth.json 로드 실패: ${e.message}`);
                // 파일이 깨졌을 경우를 대비해 기본 컨텍스트 생성
                context = await browser.newContext();
            }
        } else {
            Logger.warn('⚠️ 로그인 정보(naver_auth.json)가 없습니다. 비로그인 상태로 진행합니다.');
            context = await browser.newContext();
        }

        const page = await context.newPage();

        try {
            // 2. 트렌드 페이지 이동
            const targetUrl = `https://creator-advisor.naver.com/naver_blog/${NAVER_ID}/trends`;
            Logger.info(`🔗 접속 중: ${targetUrl}`);
            await page.goto(targetUrl, { waitUntil: 'networkidle' });

            if (targetDate) {
                await selectTrendDate(page, targetDate);
            }

            let resolvedTrendDate = await resolveTrendDateFromPage(page, targetDate || null);

            // 3. 데이터 로딩 대기 및 자동 날짜 폴백 (데이터가 없을 때 어제/그제 데이터 확인)
            let dataState = await waitForTrendDataReady(page, 15000);
            resolvedTrendDate = await resolveTrendDateFromPage(page, targetDate || null);
            let fallbackAttempt = 0;
            const MAX_FALLBACKS = 3; // 최대 3일 전까지 거슬러 올라감 (새벽 시간대 대응)

            // 만약 날짜가 명시되지 않은 '자동 수집'인 경우, 데이터가 나올 때까지 이전 날짜로 자동 이동
            if (!targetDate && (dataState.state === 'empty' || dataState.state === 'timeout')) {
                while (fallbackAttempt < MAX_FALLBACKS) {
                    fallbackAttempt++;
                    const fallbackDate = moment(resolvedTrendDate).subtract(1, 'day').format('YYYY-MM-DD');
                    Logger.info(`🔄 [Fallback] ${resolvedTrendDate} 데이터가 없어 ${fallbackDate}로 재시도합니다... (${fallbackAttempt}/${MAX_FALLBACKS})`);

                    try {
                        await selectTrendDate(page, fallbackDate);
                        dataState = await waitForTrendDataReady(page, 10000);
                        resolvedTrendDate = await resolveTrendDateFromPage(page, fallbackDate);

                        if (dataState.state === 'ready') {
                            Logger.info(`✅ [Fallback] ${fallbackDate} 데이터를 찾았습니다.`);
                            break;
                        }
                    } catch (err) {
                        Logger.warn(`⚠️ [Fallback] ${fallbackDate} 이동 중 오류: ${err.message}`);
                    }
                }
            }

            if (dataState.state === 'empty') {
                Logger.warn(`⚠️ 지정한 날짜(${resolvedTrendDate})의 트렌드 데이터가 아직 없습니다. (0건)`);
                return {
                    keywords: [],
                    date: resolvedTrendDate
                };
            }

            if (dataState.state !== 'ready') {
                Logger.warn('⚠️ 트렌드 리스트를 찾지 못했습니다. 로그인을 확인하거나 페이지 구조가 변경되었을 수 있습니다.');
                try {
                    const debugPath = path.join(CONFIG.ROOT_DIR, 'logs', `debug_trend_fail_${Date.now()}.png`);
                    await page.screenshot({ path: debugPath });
                    Logger.info(`📸 디버그 스크린샷 저장됨: ${debugPath}`);
                } catch (e) { }
                throw new Error('트렌드 데이터 로딩 시간 초과');
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

            return {
                keywords: allKeywords,
                date: resolvedTrendDate
            };

	        } catch (error) {
	            Logger.error(`❌ 트렌드 수집 중 오류 발생: ${error.message}`);
	            throw error;
	        } finally {
	            const currentUrl = String(page?.url?.() || '');
	            if (context && authPath && fs.existsSync(authPath) && currentUrl && !/nid\.naver\.com/i.test(currentUrl) && !/nidlogin\.login/i.test(currentUrl)) {
	                await persistAuthSessionState(context, { authPath });
	            }
	            if (browser) await browser.close();
	        }
	    }
};

module.exports = TrendManager;
