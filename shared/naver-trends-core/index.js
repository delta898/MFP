const path = require('path');
const fs = require('fs');
const moment = require('moment-timezone');

const DEFAULT_TIMEZONE = 'Asia/Seoul';
const DEFAULT_SOURCE = 'naver_creator_advisor';
const NAVER_SESSION_EXPIRED_CODE = 'NAVER_SESSION_EXPIRED';
const NAVER_SESSION_EXPIRED_MESSAGE = '네이버 로그인 세션이 만료되었습니다. BlogGenius 설정에서 다시 로그인해 주세요.';

function createLoggerProxy(logger = console) {
    return {
        info: typeof logger.info === 'function' ? logger.info.bind(logger) : console.log.bind(console),
        warn: typeof logger.warn === 'function' ? logger.warn.bind(logger) : console.warn.bind(console),
        error: typeof logger.error === 'function' ? logger.error.bind(logger) : console.error.bind(console),
        debug: typeof logger.debug === 'function' ? logger.debug.bind(logger) : () => {}
    };
}

function normalizeIsoTimestamp(input) {
    if (!input) return new Date().toISOString();
    const parsed = new Date(input);
    if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
    return parsed.toISOString();
}

function toSignedVariation(changeType, changeAmount) {
    if (changeType === 'new') return 'new';
    if (changeType === 'steady') return '-';
    if (!Number.isInteger(changeAmount) || changeAmount < 0) {
        throw new Error(`invalid change amount: ${changeAmount}`);
    }
    return changeType === 'down'
        ? `-${changeAmount}`
        : `+${changeAmount}`;
}

function toRawChangeLabel(changeType, changeAmount) {
    if (changeType === 'new') return 'new';
    if (changeType === 'steady') return '-';
    if (!Number.isInteger(changeAmount) || changeAmount < 0) {
        throw new Error(`invalid change amount: ${changeAmount}`);
    }
    return changeType === 'down'
        ? `▼ ${changeAmount}`
        : `▲ ${changeAmount}`;
}

function normalizeTrendChange(input = {}) {
    const rawCandidate = String(input.changeRaw || input.change_raw || '').trim();
    const signedCandidate = String(input.variation || '').trim();
    const explicitType = String(input.changeType || input.change_type || '').trim().toLowerCase();
    const explicitAmountRaw = input.changeAmount ?? input.change_amount;
    const explicitAmount = explicitAmountRaw === null || explicitAmountRaw === undefined || explicitAmountRaw === ''
        ? null
        : Number(explicitAmountRaw);

    const normalizedText = rawCandidate || signedCandidate || '';
    const lowered = normalizedText.toLowerCase();
    if (lowered === 'new') {
        return { changeRaw: 'new', changeType: 'new', changeAmount: null, variation: 'new' };
    }
    if (normalizedText === '-') {
        return { changeRaw: '-', changeType: 'steady', changeAmount: null, variation: '-' };
    }

    let match = normalizedText.match(/^[▲+]\s*(\d+)(?:\D.*)?$/);
    if (match) {
        const amount = Number(match[1]);
        return {
            changeRaw: `▲ ${amount}`,
            changeType: 'up',
            changeAmount: amount,
            variation: `+${amount}`
        };
    }

    match = normalizedText.match(/^[▼-]\s*(\d+)(?:\D.*)?$/);
    if (match) {
        const amount = Number(match[1]);
        return {
            changeRaw: `▼ ${amount}`,
            changeType: 'down',
            changeAmount: amount,
            variation: `-${amount}`
        };
    }

    if (explicitType) {
        if (!['up', 'down', 'new', 'steady'].includes(explicitType)) {
            throw new Error(`invalid change type: ${explicitType}`);
        }
        if ((explicitType === 'new' || explicitType === 'steady') && explicitAmount !== null) {
            throw new Error(`change amount must be null for ${explicitType}`);
        }
        if ((explicitType === 'up' || explicitType === 'down') && (!Number.isInteger(explicitAmount) || explicitAmount < 0)) {
            throw new Error(`invalid change amount for ${explicitType}: ${explicitAmountRaw}`);
        }
        return {
            changeRaw: toRawChangeLabel(explicitType, explicitAmount),
            changeType: explicitType,
            changeAmount: explicitAmount,
            variation: toSignedVariation(explicitType, explicitAmount)
        };
    }

    if (!normalizedText) {
        return { changeRaw: '-', changeType: 'steady', changeAmount: null, variation: '-' };
    }

    throw new Error(`unsupported trend change literal: ${normalizedText}`);
}

function normalizeCollectedTrendItem(item = {}, index = 0) {
    const category = String(item.category || '').trim();
    const keyword = String(item.keyword || '').trim();
    if (!category || !keyword) return null;
    const normalizedChange = normalizeTrendChange(item);
    const displayOrderRaw = item.displayOrder ?? item.display_order ?? item.rank ?? item.position ?? (index + 1);
    const displayOrder = Number(displayOrderRaw);
    return {
        category,
        keyword,
        variation: normalizedChange.variation,
        changeRaw: normalizedChange.changeRaw,
        changeType: normalizedChange.changeType,
        changeAmount: normalizedChange.changeAmount,
        displayOrder: Number.isInteger(displayOrder) && displayOrder > 0 ? displayOrder : (index + 1)
    };
}

function buildCollectedTrendPayload(result = {}, options = {}) {
    const source = String(options.source || result.source || DEFAULT_SOURCE).trim() || DEFAULT_SOURCE;
    const trendDate = String(options.trendDate || result.date || '').trim();
    const collectedAt = normalizeIsoTimestamp(options.collectedAt || result.collectedAt);
    const rawItems = Array.isArray(result.keywords)
        ? result.keywords
        : (Array.isArray(result.items) ? result.items : []);
    const items = rawItems
        .map((item, index) => normalizeCollectedTrendItem(item, index))
        .filter(Boolean);

    return {
        source,
        trendDate,
        collectedAt,
        itemCount: items.length,
        items
    };
}

function resolveTrendDateInput(rawInput, timezone = DEFAULT_TIMEZONE) {
    if (!rawInput) return null;
    const input = String(rawInput).trim();
    const lowered = input.toLowerCase();

    const relativeMatch = lowered.match(/^-(\d+)d$/);
    if (relativeMatch) {
        const days = Number(relativeMatch[1]);
        if (Number.isInteger(days) && days >= 1) {
            return moment().tz(timezone).subtract(days, 'day').format('YYYY-MM-DD');
        }
    }

    if (lowered === 'yesterday' || lowered === '어제') {
        return moment().tz(timezone).subtract(1, 'day').format('YYYY-MM-DD');
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
        const parsed = moment.tz(input, 'YYYY-MM-DD', true, timezone);
        if (parsed.isValid()) {
            return parsed.format('YYYY-MM-DD');
        }
    }
    if (/^\d{8}$/.test(input)) {
        const parsed = moment.tz(input, 'YYYYMMDD', true, timezone);
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

function normalizeTrendDateTextToYmd(rawText, timezone = DEFAULT_TIMEZONE) {
    const text = String(rawText || '').trim();
    if (!text) return null;

    const dotted = text.match(/(\d{4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})/);
    if (dotted) {
        const y = Number(dotted[1]);
        const m = Number(dotted[2]);
        const d = Number(dotted[3]);
        const parsed = moment.tz(
            `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
            'YYYY-MM-DD',
            true,
            timezone
        );
        if (parsed.isValid()) return parsed.format('YYYY-MM-DD');
    }

    return null;
}

async function resolveTrendDateFromPage(page, fallbackDate = null, timezone = DEFAULT_TIMEZONE) {
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
                const parsed = normalizeTrendDateTextToYmd(text, timezone);
                if (parsed) return parsed;
            }
        } catch (_error) {}
    }

    if (fallbackDate) return fallbackDate;
    return moment().tz(timezone).format('YYYY-MM-DD');
}

function extractFirstNumber(input) {
    const match = String(input || '').match(/\d+/);
    return match ? Number(match[0]) : null;
}

async function readSelectOptions(selectLocator) {
    const options = [];
    const optionLoc = selectLocator.locator('option');
    const count = await optionLoc.count();
    for (let i = 0; i < count; i += 1) {
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

    const direct = options.find((opt) => extractFirstNumber(opt.label) === targetYear)
        || options.find((opt) => extractFirstNumber(opt.value) === targetYear);
    if (!direct) return false;

    await selectLocator.selectOption(direct.value);
    return true;
}

async function selectMonthOption(selectLocator, targetMonth) {
    const options = await readSelectOptions(selectLocator);
    if (options.length === 0) return false;

    let pick = options.find((opt) => extractFirstNumber(opt.label) === targetMonth);
    if (!pick) {
        pick = options.find((opt) => Number(opt.value) === targetMonth);
    }
    if (!pick) {
        pick = options.find((opt) => Number(opt.value) === (targetMonth - 1));
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
        } catch (_error) {}

        try {
            const byAria = page.locator(`button.rdp-day_button[aria-label^="${ariaPrefix}"]`).first();
            if (await byAria.count() > 0 && await byAria.isVisible()) {
                return { mode: 'aria', locator: byAria };
            }
        } catch (_error) {}

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
        } catch (_error) {}
    }

    if (!opened) {
        throw new Error('날짜 선택 버튼을 찾을 수 없습니다.');
    }

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
    for (let i = 0; i < 20; i += 1) {
        try {
            if (await dateLabel.count() > 0) {
                const text = (await dateLabel.innerText()).trim();
                if (text.includes(expected)) {
                    updated = true;
                    break;
                }
            }
        } catch (_error) {}
        await page.waitForTimeout(100);
    }

    try {
        const overlay = page.locator('div.rdp, .rdp, [class*="DayPicker"]').first();
        if (await overlay.count() > 0 && await overlay.isVisible()) {
            await page.keyboard.press('Escape');
            await page.waitForTimeout(120);
        }
    } catch (_error) {}

    if (!updated) {
        throw new Error(`날짜 변경 확인 실패: ${targetDate}`);
    }
}

function isNaverLoginUrl(urlLike) {
    const value = String(urlLike || '').trim();
    return /nid\.naver\.com/i.test(value) || /nidlogin\.login/i.test(value);
}

async function isNaverLoginRequired(page) {
    if (!page) return false;

    try {
        if (isNaverLoginUrl(page.url?.())) return true;
    } catch (_error) {}

    const candidates = [
        'a:has-text("로그인하고 서비스 이용하기")',
        'button:has-text("로그인하고 서비스 이용하기")',
        'a[href*="nidlogin.login"]:has-text("로그인")',
        'a[href*="nid.naver.com"]:has-text("로그인")'
    ];

    for (const selector of candidates) {
        try {
            const node = page.locator(selector).first();
            if (await node.count() > 0 && await node.isVisible()) return true;
        } catch (_error) {}
    }

    return false;
}

function createNaverSessionExpiredError() {
    const error = new Error(NAVER_SESSION_EXPIRED_MESSAGE);
    error.code = NAVER_SESSION_EXPIRED_CODE;
    return error;
}

async function assertNaverSessionActive(page) {
    if (await isNaverLoginRequired(page)) {
        throw createNaverSessionExpiredError();
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
        await assertNaverSessionActive(page);

        try {
            if (await listLocator.count() > 0 && await listLocator.first().isVisible()) {
                return { state: 'ready' };
            }
        } catch (_error) {}

        for (const selector of emptyStateCandidates) {
            try {
                const node = page.locator(selector).first();
                if (await node.count() > 0 && await node.isVisible()) {
                    return { state: 'empty' };
                }
            } catch (_error) {}
        }

        await page.waitForTimeout(200);
    }

    return { state: 'timeout' };
}

function createNaverTrendsCollector(options = {}) {
    const launchBrowser = options.launchBrowser;
    if (typeof launchBrowser !== 'function') {
        throw new Error('createNaverTrendsCollector requires launchBrowser');
    }

    const logger = createLoggerProxy(options.logger);
    const timezone = String(options.timezone || DEFAULT_TIMEZONE).trim() || DEFAULT_TIMEZONE;
    const config = options.config || {};
    const persistAuthSessionState = typeof options.persistAuthSessionState === 'function'
        ? options.persistAuthSessionState
        : async (context, persistOptions = {}) => {
            const authPath = String(persistOptions.authPath || '').trim();
            if (!context || !authPath) return false;
            fs.mkdirSync(path.dirname(authPath), { recursive: true });
            await context.storageState({ path: authPath });
            return true;
        };

    return {
        async fetchTrends(fetchOptions = {}) {
            logger.info('📈 네이버 크리에이터 어드바이저 트렌드 수집을 시작합니다...');

            const naverId = String(fetchOptions.naverId || config.NAVER_ID || '').trim();
            if (!naverId) {
                throw new Error('설정에 NAVER_ID가 없습니다.');
            }

            const targetDate = resolveTrendDateInput(fetchOptions.date, timezone);
            if (targetDate) {
                logger.info(`📅 트렌드 수집 기준일 지정: ${targetDate}`);
            }

            const headless = typeof fetchOptions.headless === 'boolean'
                ? fetchOptions.headless
                : (typeof config.HEADLESS === 'boolean' ? config.HEADLESS : true);
            const rootDir = String(fetchOptions.rootDir || config.ROOT_DIR || process.cwd()).trim() || process.cwd();
            const authPath = String(
                fetchOptions.authPath
                || config.AUTH_FILE_PATH
                || path.join(rootDir, 'config', 'naver_auth.json')
            ).trim();

            const browser = await launchBrowser({
                headless,
                channel: fetchOptions.channel,
                args: fetchOptions.args,
                windowSize: fetchOptions.windowSize
            });

            let context;
            if (authPath && fs.existsSync(authPath)) {
                try {
                    context = await browser.newContext({ storageState: authPath });
                    logger.info('✅ 로그인 정보(naver_auth.json)를 로드했습니다.');
                } catch (error) {
                    logger.error(`❌ naver_auth.json 로드 실패: ${error.message}`);
                    context = await browser.newContext();
                }
            } else {
                logger.warn('⚠️ 로그인 정보(naver_auth.json)가 없습니다. 비로그인 상태로 진행합니다.');
                context = await browser.newContext();
            }

            const page = await context.newPage();

            try {
                const targetUrl = `https://creator-advisor.naver.com/naver_blog/${naverId}/trends`;
                logger.info(`🔗 접속 중: ${targetUrl}`);
                await page.goto(targetUrl, { waitUntil: 'networkidle' });
                await assertNaverSessionActive(page);

                if (targetDate) {
                    await selectTrendDate(page, targetDate);
                }

                let resolvedTrendDate = await resolveTrendDateFromPage(page, targetDate || null, timezone);

                let dataState = await waitForTrendDataReady(page, 15000);
                resolvedTrendDate = await resolveTrendDateFromPage(page, targetDate || null, timezone);
                let fallbackAttempt = 0;
                const maxFallbacks = 3;

                if (!targetDate && (dataState.state === 'empty' || dataState.state === 'timeout')) {
                    while (fallbackAttempt < maxFallbacks) {
                        fallbackAttempt += 1;
                        const fallbackDate = moment(resolvedTrendDate).tz(timezone).subtract(1, 'day').format('YYYY-MM-DD');
                        logger.info(`🔄 [Fallback] ${resolvedTrendDate} 데이터가 없어 ${fallbackDate}로 재시도합니다... (${fallbackAttempt}/${maxFallbacks})`);

                        try {
                            await selectTrendDate(page, fallbackDate);
                            dataState = await waitForTrendDataReady(page, 10000);
                            resolvedTrendDate = await resolveTrendDateFromPage(page, fallbackDate, timezone);

                            if (dataState.state === 'ready') {
                                logger.info(`✅ [Fallback] ${fallbackDate} 데이터를 찾았습니다.`);
                                break;
                            }
                        } catch (error) {
                            logger.warn(`⚠️ [Fallback] ${fallbackDate} 이동 중 오류: ${error.message}`);
                        }
                    }
                }

                if (dataState.state === 'empty') {
                    logger.warn(`⚠️ 지정한 날짜(${resolvedTrendDate})의 트렌드 데이터가 아직 없습니다. (0건)`);
                    return {
                        keywords: [],
                        date: resolvedTrendDate
                    };
                }

                if (dataState.state !== 'ready') {
                    logger.warn('⚠️ 트렌드 리스트를 찾지 못했습니다. 로그인을 확인하거나 페이지 구조가 변경되었을 수 있습니다.');
                    try {
                        const debugPath = path.join(rootDir, 'logs', `debug_trend_fail_${Date.now()}.png`);
                        fs.mkdirSync(path.dirname(debugPath), { recursive: true });
                        await page.screenshot({ path: debugPath });
                        logger.info(`📸 디버그 스크린샷 저장됨: ${debugPath}`);
                    } catch (_error) {}
                    throw new Error('트렌드 데이터 로딩 시간 초과');
                }

                const collectedCategories = new Set();
                let allKeywords = [];

                const maxSwipes = 50;
                const swipeDragSteps = 4;
                const swipeSettleMs = 400;
                const swipeStartRatio = 0.90;
                const swipeEndRatio = 0.05;
                let swipeCount = 0;
                let noNewCategoryCount = 0;

                logger.info('🔄 카테고리 순회 및 키워드 추출 시작 (스와이프 동작 포함)...');

                const swiperSelector = '.u_ni_search_swiper';
                const swiperBox = await page.$(swiperSelector);
                if (!swiperBox) {
                    logger.warn('⚠️ 스와이프 컨테이너(.u_ni_search_swiper)를 찾을 수 없습니다.');
                    return {
                        keywords: [],
                        date: resolvedTrendDate
                    };
                }

                while (swipeCount < maxSwipes) {
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
      let changeRaw = '-';
      const dataEl = item.querySelector('.u_ni_data');
      if (dataEl) {
        const text = (dataEl.innerText || '').trim();
        const className = dataEl.className || '';
        if (className.includes('up')) {
          variation = '+' + text;
          changeRaw = '▲ ' + text;
        } else if (className.includes('down')) {
          variation = '-' + text;
          changeRaw = '▼ ' + text;
        } else if (className.includes('new')) {
          variation = 'new';
          changeRaw = 'new';
        } else {
          variation = text || '-';
          changeRaw = text || '-';
        }
      }

      items.push({ keyword, variation, changeRaw, displayOrder: items.length + 1 });
    }

    if (items.length > 0) results.push({ title, items });
  }

  return results;
})()
`;

                    const pageData = await page.evaluate(extractTrendsScript);
                    let newCategoryFound = false;

                    for (const data of pageData) {
                        const { title, items } = data;
                        if (collectedCategories.has(title)) continue;

                        if (title.match(/\d+대|남자|여자|남성|여성/)) {
                            logger.info(`   🚫 [Skip] 인구통계 카테고리 제외: ${title}`);
                            collectedCategories.add(title);
                            continue;
                        }

                        logger.info(`   ✅ [Collect] 카테고리 발견: ${title} (${items.length}개)`);
                        const newItems = items.map((item) => ({
                            category: title,
                            keyword: item.keyword,
                            variation: item.variation,
                            changeRaw: item.changeRaw,
                            displayOrder: item.displayOrder
                        }));
                        allKeywords = allKeywords.concat(newItems);

                        collectedCategories.add(title);
                        newCategoryFound = true;
                    }

                    if (!newCategoryFound) {
                        noNewCategoryCount += 1;
                    } else {
                        noNewCategoryCount = 0;
                    }

                    if (noNewCategoryCount >= 3) {
                        logger.info('✨ 더 이상 새로운 카테고리가 없습니다. 수집을 종료합니다.');
                        break;
                    }

                    const boundingBox = await swiperBox.boundingBox();
                    if (!boundingBox) {
                        logger.warn('⚠️ 스와이프 영역을 찾을 수 없습니다 (BoundingBox Fail).');
                        break;
                    }

                    const startX = boundingBox.x + boundingBox.width * swipeStartRatio;
                    const endX = boundingBox.x + boundingBox.width * swipeEndRatio;
                    const y = boundingBox.y + boundingBox.height / 2;

                    await page.mouse.move(startX, y);
                    await page.mouse.down();
                    await page.mouse.move(endX, y, { steps: swipeDragSteps });
                    await page.mouse.up();

                    swipeCount += 1;
                    await page.waitForTimeout(swipeSettleMs);
                }

                logger.info(`🎉 총 ${allKeywords.length}개의 트렌드 키워드 데이터를 수집했습니다.`);
                return {
                    keywords: allKeywords,
                    date: resolvedTrendDate
                };
            } catch (error) {
                logger.error(`❌ 트렌드 수집 중 오류 발생: ${error.message}`);
                throw error;
            } finally {
                const currentUrl = String(page?.url?.() || '');
                const loginRequired = await isNaverLoginRequired(page);
                if (context && authPath && fs.existsSync(authPath) && currentUrl && !loginRequired) {
                    await persistAuthSessionState(context, { authPath });
                }
                if (browser) await browser.close();
            }
        }
    };
}

module.exports = {
    DEFAULT_SOURCE,
    NAVER_SESSION_EXPIRED_CODE,
    NAVER_SESSION_EXPIRED_MESSAGE,
    assertNaverSessionActive,
    buildCollectedTrendPayload,
    createNaverSessionExpiredError,
    createNaverTrendsCollector,
    isNaverLoginRequired,
    isNaverLoginUrl,
    normalizeCollectedTrendItem,
    normalizeIsoTimestamp,
    resolveTrendDateInput
};
