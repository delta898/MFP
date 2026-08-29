const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
    NAVER_SESSION_EXPIRED_CODE,
    buildCollectedTrendPayload,
    createNaverTrendsCollector,
    isNaverLoginRequired,
    isNaverLoginUrl,
    normalizeCollectedTrendItem,
    resolveTrendDateInput
} = require('./index');

test('buildCollectedTrendPayload normalizes source, timestamps, and valid items only', () => {
    const payload = buildCollectedTrendPayload({
        date: '2026-04-01',
        keywords: [
            { category: '맛집', keyword: '성수 맛집', changeRaw: '▲ 48', displayOrder: 3 },
            { category: ' ', keyword: '무효', changeRaw: '▲ 1' },
            { category: '여행', keyword: '제주 여행', changeRaw: '-' }
        ]
    }, {
        source: 'naver_trends',
        collectedAt: '2026-04-02T01:02:03+09:00'
    });

    assert.equal(payload.source, 'naver_trends');
    assert.equal(payload.trendDate, '2026-04-01');
    assert.equal(payload.collectedAt, '2026-04-01T16:02:03.000Z');
    assert.equal(payload.itemCount, 2);
    assert.deepEqual(payload.items, [
        {
            category: '맛집',
            keyword: '성수 맛집',
            variation: '+48',
            changeRaw: '▲ 48',
            changeType: 'up',
            changeAmount: 48,
            displayOrder: 3
        },
        {
            category: '여행',
            keyword: '제주 여행',
            variation: '-',
            changeRaw: '-',
            changeType: 'steady',
            changeAmount: null,
            displayOrder: 3
        }
    ]);
});

test('resolveTrendDateInput accepts explicit ymd and compact ymd forms', () => {
    assert.equal(resolveTrendDateInput('2026-04-02'), '2026-04-02');
    assert.equal(resolveTrendDateInput('20260402'), '2026-04-02');
});

test('normalizeCollectedTrendItem preserves signed variation for app consumers and raw change fields for API consumers', () => {
    const up = normalizeCollectedTrendItem({ category: '맛집', keyword: '버거킹 와퍼', changeRaw: '▲ 48' }, 0);
    const down = normalizeCollectedTrendItem({ category: '맛집', keyword: '맘스터치 후떡죽', variation: '-3' }, 1);
    const latest = normalizeCollectedTrendItem({ category: '맛집', keyword: '마산 통술집', changeRaw: 'new' }, 2);

    assert.deepEqual(up, {
        category: '맛집',
        keyword: '버거킹 와퍼',
        variation: '+48',
        changeRaw: '▲ 48',
        changeType: 'up',
        changeAmount: 48,
        displayOrder: 1
    });
    assert.equal(down.changeRaw, '▼ 3');
    assert.equal(down.variation, '-3');
    assert.equal(latest.changeType, 'new');
    assert.equal(latest.changeAmount, null);
});

test('isNaverLoginUrl recognizes Naver authentication redirects only', () => {
    assert.equal(isNaverLoginUrl('https://nid.naver.com/nidlogin.login'), true);
    assert.equal(isNaverLoginUrl('https://creator-advisor.naver.com/naver_blog/test/trends'), false);
});

test('isNaverLoginRequired recognizes the Creator Advisor login landing page', async () => {
    const page = {
        url: () => 'https://creator-advisor.naver.com/',
        locator: (selector) => ({
            first() { return this; },
            count: async () => selector.includes('로그인하고 서비스 이용하기') ? 1 : 0,
            isVisible: async () => true
        })
    };

    assert.equal(await isNaverLoginRequired(page), true);
});

test('collector fails immediately for an expired session and does not persist the login landing state', async (t) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'naver-trends-auth-'));
    const authPath = path.join(tempDir, 'naver_auth.json');
    fs.writeFileSync(authPath, JSON.stringify({ cookies: [], origins: [] }));
    t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

    let persisted = 0;
    let browserClosed = 0;
    const page = {
        url: () => 'https://creator-advisor.naver.com/',
        goto: async () => {},
        locator: (selector) => ({
            first() { return this; },
            count: async () => selector.includes('로그인하고 서비스 이용하기') ? 1 : 0,
            isVisible: async () => true
        })
    };
    const context = {
        newPage: async () => page
    };
    const browser = {
        newContext: async () => context,
        close: async () => { browserClosed += 1; }
    };
    const collector = createNaverTrendsCollector({
        launchBrowser: async () => browser,
        persistAuthSessionState: async () => { persisted += 1; },
        logger: { info() {}, warn() {}, error() {}, debug() {} },
        config: {
            NAVER_ID: 'test-user',
            AUTH_FILE_PATH: authPath,
            ROOT_DIR: tempDir,
            HEADLESS: true
        }
    });

    await assert.rejects(
        collector.fetchTrends(),
        (error) => error.code === NAVER_SESSION_EXPIRED_CODE && /다시 로그인/.test(error.message)
    );
    assert.equal(persisted, 0);
    assert.equal(browserClosed, 1);
});
