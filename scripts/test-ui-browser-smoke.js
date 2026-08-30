#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const { createHtmlCompositionRuntime } = require('../src/ui-runtime/html-composition-runtime');
const { createCssCompositionRuntime } = require('../src/ui-runtime/css-composition-runtime');
const { createJsCompositionRuntime } = require('../src/ui-runtime/js-composition-runtime');

const repoRoot = path.resolve(__dirname, '..');
const uiRoot = path.join(repoRoot, 'ui');

function getContentType(filePath) {
    const extension = path.extname(filePath).toLowerCase();
    return {
        '.css': 'text/css; charset=utf-8',
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.png': 'image/png',
        '.svg': 'image/svg+xml'
    }[extension] || 'application/octet-stream';
}

function createAccountOverviewFixture() {
    return {
        identity: { email: 'ui-smoke@example.com', email_verified: true },
        subscription: { plan_code: 'free', plan_name: 'Free', status: 'active' },
        usage: { used: 0, limit: 10, remaining: 10 },
        connections: {
            naver: { status: 'connected', message: 'fixture' },
            google_sheets: { status: 'connected', message: 'fixture' },
            wordpress: { status: 'not_configured', message: 'fixture' },
            buffer: { status: 'not_configured', message: 'fixture' }
        },
        actions: [],
        smart_usage: {
            cycle: 'monthly',
            items: [{
                capability: 'content_idea',
                label: '글감 추천',
                limit: 20,
                used: 0,
                remaining: 20,
                requestLimit: 2,
                requestsRemaining: null
            }]
        }
    };
}

function getApiFixture(pathname) {
    // Keep health versionless so config/status must initialize every version display.
    // This guards the startup race where health can be temporarily unavailable.
    if (pathname === '/api/v1/health') return { status: 'ok' };
    if (pathname === '/api/v1/config/status') {
        return {
            ready: true,
            isEssentialSet: true,
            isNaverSet: true,
            isWpSet: true,
            version: '0.2.0',
            message: ''
        };
    }
    if (pathname.startsWith('/api/v1/account/overview')) return createAccountOverviewFixture();
    if (pathname === '/api/v1/dashboard/summary') return {};
    if (pathname === '/api/v1/dashboard/logs') return { logs: [] };
    if (pathname === '/api/v1/dashboard/activities') return { activities: [] };
    if (pathname === '/api/v1/dashboard/external-content') return {};
    if (pathname === '/api/v1/recommendations') {
        return {
            schema_version: 1,
            generated_at: new Date().toISOString(),
            count: 1,
            store: { mode: 'persistent', reason: '' },
            items: [{
                schema_version: 1,
                recommendation_id: 'recommendation:ui-smoke:1',
                kind: 'content_opportunity',
                lane: 'serendipity',
                hint: '지금 떠오르는 키워드',
                title: 'WordPress 설정을 확인해보세요',
                summary: '발행 채널 설정을 마치면 다음 작업으로 이어갈 수 있습니다.',
                explanation: '현재 설정 상태를 근거로 한 안내입니다.',
                evidence: [{
                    evidence_id: 'evidence:ui-smoke:1',
                    kind: 'system_state',
                    stage: 'observed',
                    strength: 'strong',
                    summary: 'WordPress 연결 정보가 확인되지 않았습니다.',
                    observed_at: new Date().toISOString(),
                    source: { label: '앱 설정 상태', url: '', timestamp: new Date().toISOString() }
                }],
                status: 'available',
                available_at: new Date().toISOString(),
                snoozed_until: null,
                expires_at: new Date(Date.now() + 86400000).toISOString(),
                action: {
                    type: 'presentation', label: 'WordPress 설정 보기',
                    target: { surface: 'settings.wordpress', view: 'settings', tab: 'naver-blog' },
                    payload: { section: 'wordpress' }
                }
            }]
        };
    }
    if (pathname === '/api/v1/recommendations/interaction') {
        return {
            ok: true,
            status: 'presentation',
            recommendation_id: 'recommendation:ui-smoke:1',
            action: {
                type: 'presentation', label: 'WordPress 설정 보기',
                target: { surface: 'settings.wordpress', view: 'settings', tab: 'naver-blog' },
                payload: { section: 'wordpress' }
            }
        };
    }
    if (pathname === '/api/v1/recommendations/discover') {
        const now = new Date().toISOString();
        return {
            schema_version: 1,
            generated_at: now,
            count: 1,
            rotated_count: 1,
            items: [{
                schema_version: 1,
                recommendation_id: 'recommendation:ui-smoke:discovery',
                kind: 'content_opportunity',
                lane: 'serendipity',
                hint: '지금 떠오르는 키워드',
                title: '로컬 여행',
                summary: '새로운 소재나 관점을 발견할 수 있습니다.',
                explanation: '외부 Trends에서 관찰된 주제에 근거한 제안입니다.',
                evidence: [{
                    evidence_id: 'evidence:ui-smoke:discovery',
                    kind: 'trends',
                    stage: 'observed',
                    strength: 'weak',
                    summary: '최근 트렌드에서 관찰된 여행 주제입니다.',
                    observed_at: now,
                    source: { label: '네이버 트렌드', url: '', timestamp: now }
                }],
                status: 'available',
                available_at: now,
                snoozed_until: null,
                expires_at: new Date(Date.now() + 86400000).toISOString(),
                action: {
                    type: 'presentation', label: 'WordPress 설정 보기',
                    target: { surface: 'settings.wordpress', view: 'settings', tab: 'naver-blog' },
                    payload: { section: 'wordpress' }
                }
            }]
        };
    }
    if (pathname.startsWith('/api/v1/surface-content/')) return { regions: {} };
    if (pathname === '/api/v1/auto/status') return { enabled: false };
    if (pathname === '/api/v1/system/update/check') return { available: false };
    if (pathname === '/api/v1/sheets/ensure') return { ready: true };
    if (pathname === '/api/v1/social/manual/config') {
        return { configured: false, local_media_available: false, channels: [], ai: { available: false, model_name: '' } };
    }
    if (pathname === '/api/v1/settings/major') {
        return {
            configPath: 'fixture/config.json',
            fields: {},
            aiPresets: { text: [], image: [], chat: [] },
            aiProviderProfiles: { text: {}, image: {}, chat: {} },
            shoppingImageDefaults: {},
            shoppingImageSlots: {}
        };
    }
    if (pathname === '/api/v1/google-oauth/status') return { configured: false, connected: false };
    if (pathname === '/api/v1/session/naver') return { status: 'not_logged_in', valid: false };
    if (pathname === '/api/v1/logs/files') return { files: [] };
    if (pathname === '/api/v1/trends/items') return { items: [], total: 0, limit: 50, offset: 0 };
    if (pathname === '/api/v1/blog/topics') return { items: [], total: 0, limit: 50, offset: 0 };
    if (pathname === '/api/v1/shopping/items') return { items: [], total: 0, limit: 50, offset: 0 };
    if (pathname === '/api/v1/blog/auto/categories') return { categories: [] };
    if (pathname === '/api/v1/trend-posting/meta') return { categories: [] };
    if (pathname === '/api/v1/trend-posting/recent-topics') return { items: [] };
    return {};
}

function startFixtureServer(requests) {
    const composedUiShell = createHtmlCompositionRuntime({ fs, path })
        .composeHtmlFile({ uiRoot }).html;
    const composedUiStyles = createCssCompositionRuntime({ fs, path })
        .composeCssFile({ uiRoot }).css;
    const composedUiScript = createJsCompositionRuntime({ fs, path })
        .composeJsFile({ uiRoot }).js;
    let topicRecommendationCalls = 0;
    const server = http.createServer((req, res) => {
        const url = new URL(req.url || '/', 'http://127.0.0.1');
        requests.push({ method: req.method || 'GET', pathname: url.pathname });

        if (url.pathname.startsWith('/api/v1/')) {
            let data = getApiFixture(url.pathname);
            if (url.pathname === '/api/v1/blog/topic-recommendations') {
                topicRecommendationCalls += 1;
                data = {
                    ideas: [{
                        id: `topic-${topicRecommendationCalls}`,
                        title: `추천 글감 ${topicRecommendationCalls}`,
                        keywords: ['테스트'],
                        summary: '추천 흐름 테스트',
                        reason: '테스트 근거'
                    }],
                    smart_usage_session_id: url.searchParams.get('session_id') || '',
                    smart_usage: {
                        capability: 'content_idea',
                        limit: 20,
                        used: 1,
                        remaining: 19,
                        request_limit: 2,
                        requests_remaining: Math.max(0, 2 - topicRecommendationCalls)
                    }
                };
            }
            const body = JSON.stringify({ success: true, data });
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
            res.end(body);
            return;
        }

        const requestedPath = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');
        const fullPath = path.resolve(uiRoot, requestedPath);
        const rootPrefix = `${uiRoot}${path.sep}`;
        if (!fullPath.startsWith(rootPrefix) || !fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Not found');
            return;
        }

        res.writeHead(200, { 'Content-Type': getContentType(fullPath), 'Cache-Control': 'no-store' });
        const body = requestedPath === 'index.html'
            ? composedUiShell
            : (requestedPath === 'styles.css'
                ? composedUiStyles
                : (requestedPath === 'app.js' ? composedUiScript : fs.readFileSync(fullPath)));
        res.end(body);
    });

    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            resolve({ server, baseUrl: `http://127.0.0.1:${address.port}` });
        });
    });
}

function resolveBrowserLaunchOptions() {
    const configuredPath = String(process.env.BLOGGENIUS_TEST_BROWSER || '').trim();
    const bundledPath = chromium.executablePath();
    const knownPaths = [
        configuredPath,
        bundledPath,
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser'
    ].filter(Boolean);
    const executablePath = knownPaths.find((candidate) => fs.existsSync(candidate));
    if (!executablePath) {
        throw new Error('UI smoke test browser not found. Set BLOGGENIUS_TEST_BROWSER or install Playwright Chromium.');
    }
    return { executablePath, headless: true };
}

async function closeServer(server) {
    await new Promise((resolve) => server.close(resolve));
}

async function run() {
    const requests = [];
    const consoleErrors = [];
    const pageErrors = [];
    const failedResponses = [];
    const { server, baseUrl } = await startFixtureServer(requests);
    let browser;

    try {
        browser = await chromium.launch(resolveBrowserLaunchOptions());
        const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
        const page = await context.newPage();
        page.setDefaultTimeout(5000);
        page.on('console', (message) => {
            if (message.type() === 'error') consoleErrors.push(message.text());
        });
        page.on('pageerror', (error) => pageErrors.push(error.stack || error.message));
        page.on('response', (response) => {
            if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`);
        });

        await page.goto(baseUrl, { waitUntil: 'networkidle' });
        await page.waitForFunction(() => typeof window.navigateTo === 'function');
        assert.equal(await page.evaluate(() => recommendationCenterToastMessage([
            { title: '경찰 계급도' }, { title: '두 번째 소재' }, { title: '세 번째 소재' }
        ])), '경찰 계급도 외 2건');

        await page.evaluate(async () => {
            await openRecommendationPresentation({
                target: { surface: 'blog.quick' },
                payload: { query: '첫 번째 뜻밖의 소재' }
            });
            await openRecommendationPresentation({
                target: { surface: 'blog.quick' },
                payload: { query: '"산림재난 정책 성공위한 \'재난에 강한 마을\' 설계해야 한다"' }
            });
        });
        assert.equal(
            await page.locator('#quick-subject').inputValue(),
            '산림재난 정책 성공위한 \'재난에 강한 마을\' 설계해야 한다'
        );
        assert.equal(await page.evaluate(() => recommendationPresentationQuery('“겹따옴표 소재”')), '겹따옴표 소재');
        assert.equal(await page.evaluate(() => recommendationActionLabel({
            lane: 'serendipity', action: { type: 'presentation', label: '소재 살펴보기' }
        })), '소재 적용하기');
        await page.evaluate(() => navigateTo('dashboard'));
        await page.waitForFunction(() => document.getElementById('view-dashboard')?.classList.contains('active'));

        assert.equal(await page.locator('#view-dashboard').count(), 1);
        assert.equal(await page.locator('#view-dashboard').evaluate((element) => element.classList.contains('active')), true);
        assert.notEqual(await page.locator('#view-dashboard').evaluate((element) => getComputedStyle(element).display), 'none');
        assert.equal(await page.locator('#view-settings').evaluate((element) => getComputedStyle(element).display), 'none');
        assert.equal(await page.locator('.sidebar').evaluate((element) => getComputedStyle(element).display), 'flex');
        assert.equal(await page.locator('#badge-version').textContent(), 'v0.2.0');
        assert.equal(await page.locator('#settings-current-version-display').textContent(), 'v0.2.0');
        assert.equal(await page.locator('#footer-version-display').textContent(), 'v0.2.0');
        await page.waitForFunction(() => (
            document.querySelectorAll('.recommendation-card').length === 1
            && document.querySelector('.recommendation-card h3')?.textContent?.trim() === '로컬 여행'
        ));
        assert.equal((await page.locator('.recommendation-card h3').textContent())?.trim(), '로컬 여행');
        assert.equal((await page.locator('#recommendation-nav-badge').textContent())?.trim(), '1');
        assert.equal(await page.locator('#recommendation-nav-badge').isHidden(), false);
        assert.equal(await page.locator('.recommendation-evidence-list').isHidden(), true);
        assert.equal(
            await page.locator('.recommendation-evidence-toggle').evaluate((element) => getComputedStyle(element).alignSelf),
            'flex-start'
        );
        await page.locator('.recommendation-evidence-toggle').click();
        assert.equal(await page.locator('.recommendation-evidence-list').isHidden(), false);
        assert.equal((await page.locator('.recommendation-card').textContent()).includes('capability_id'), false);
        assert.equal(await page.locator('.recommendation-kind').count(), 0);
        assert.equal((await page.locator('.recommendation-card-hint').textContent())?.trim(), '트렌드 키워드');
        assert.equal(await page.locator('.recommendation-card-top .recommendation-card-hint').count(), 1);
        assert.equal(await page.locator('.recommendation-card-title-row .recommendation-card-hint').count(), 0);
        assert.equal(await page.locator('.recommendation-card').evaluate((element) => getComputedStyle(element).display), 'flex');
        assert.equal(await page.locator('#recommendation-center-list').evaluate((element) => getComputedStyle(element).alignItems), 'stretch');
        assert.equal(await page.locator('[data-recommendation-action="snooze"]').count(), 0);
        assert.equal(await page.locator('[data-recommendation-action="dismiss"]').isDisabled(), false);
        assert.equal(
            await page.locator('#recommendation-center-list').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length),
            3
        );
        assert.equal((await page.locator('#recommendation-center-title').textContent())?.trim(), '뜻밖의 발견');
        await page.locator('.recommendation-card-actions .primary').click();
        await page.waitForFunction(() => document.getElementById('view-settings')?.classList.contains('active'));
        assert.equal(
            await page.locator('.settings-tab-btn[data-settings-tab="naver-blog"]').evaluate((element) => element.classList.contains('active')),
            true
        );
        await page.locator('.nav-btn[data-view="dashboard"]').click();
        await page.locator('#recommendation-center-refresh').click();
        await page.waitForFunction(() => document.querySelector('#recommendation-center-list .recommendation-card h3')?.textContent.includes('로컬 여행'));

        for (const viewName of ['account', 'social', 'settings', 'logs', 'shopping', 'dashboard', 'blog', 'blog-next']) {
            await page.locator(`.nav-btn[data-view="${viewName}"]`).click();
            await page.waitForFunction((name) => document.getElementById(`view-${name}`)?.classList.contains('active'), viewName);
        }

        assert.equal((await page.locator('.nav-btn[data-view="blog-next"] .nav-label').textContent())?.trim(), '블로그 Beta');
        assert.equal(await page.locator('#blog-next-panel-quick').evaluate((element) => element.hidden), false);
        await page.locator('[data-blog-next-input-mode="folder"]').click();
        assert.equal(await page.locator('[data-blog-next-mode-panel="folder"]').evaluate((element) => element.hidden), false);
        await page.locator('[data-blog-next-tab="queue"]').click();
        assert.equal(await page.locator('#blog-next-panel-queue').evaluate((element) => element.hidden), false);
        await page.locator('[data-blog-next-tab="automation"]').click();
        assert.equal(await page.locator('#blog-next-panel-automation').evaluate((element) => element.hidden), false);

        await page.locator('.nav-btn[data-view="social"]').click();
        await page.locator('#manual-sns-text').fill('테스트 문구');
        await page.waitForFunction(() => document.getElementById('manual-sns-character-count')?.textContent === '6자');
        assert.equal(await page.locator('#manual-sns-publish-btn').isDisabled(), true);
        await page.locator('#manual-sns-text').fill('');

        await page.locator('.nav-btn[data-view="account"]').click();
        await page.waitForFunction(() => !document.getElementById('account-overview-content')?.classList.contains('hidden'));
        assert.equal((await page.locator('#account-plan-name').textContent())?.trim(), 'Free');
        assert.equal(
            await page.locator('#view-account [data-clock-display]').evaluate((element) => element.children.length > 0),
            true
        );

        await page.locator('.nav-btn[data-view="logs"]').click();
        await page.locator('.logs-tab-btn[data-logs-tab="system"]').click();
        await page.waitForFunction(() => getComputedStyle(document.getElementById('logs-tab-system')).display !== 'none');
        assert.equal(
            await page.locator('.logs-tab-btn[data-logs-tab="system"]').evaluate((element) => element.classList.contains('active')),
            true
        );

        await page.locator('.nav-btn[data-view="dashboard"]').click();
        assert.equal(await page.locator('#update-banner').evaluate((element) => element.classList.contains('hidden')), true);
        await page.locator('.nav-btn[data-view="blog"]').click();

        await page.locator('.blog-tab-btn[data-blog-tab="topics"]').click();
        await page.waitForFunction(() => document.getElementById('blog-tab-topics')?.classList.contains('active'));
        assert.equal(await page.locator('#blog-table').count(), 1);

        await page.locator('.blog-tab-btn[data-blog-tab="trend-posting"]').click();
        await page.waitForFunction(() => document.getElementById('blog-tab-trend-posting')?.classList.contains('active'));

        await page.locator('.blog-tab-btn[data-blog-tab="collect"]').click();
        await page.waitForFunction(() => document.getElementById('blog-tab-collect')?.classList.contains('active'));
        await page.waitForFunction(() => document.getElementById('blog-collect-trends-result')?.textContent?.includes('불러오기 완료'));
        await page.evaluate(() => setBlogCollectResultText('수집 설정 테스트'));
        assert.equal((await page.locator('#blog-collect-trends-result').textContent())?.trim(), '수집 설정 테스트');

        await page.locator('.nav-btn[data-view="shopping"]').click();
        await page.locator('.shopping-tab-btn[data-shopping-tab="batch"]').click();
        await page.waitForFunction(() => document.getElementById('shopping-tab-batch')?.classList.contains('active'));
        assert.equal(await page.locator('#shopping-table').count(), 1);

        await page.locator('.nav-btn[data-view="blog"]').click();
        await page.locator('.blog-tab-btn[data-blog-tab="quick"]').click();
        await page.waitForFunction(() => document.getElementById('blog-tab-quick')?.classList.contains('active'));

        await page.locator('#quick-keywords').fill('블로그 자동화, 글쓰기 도구');
        await page.locator('#quick-keyword-discovery-open-btn').click();
        await page.waitForFunction(() => !document.getElementById('quick-discovery-modal')?.classList.contains('hidden'));
        assert.equal(await page.locator('[data-quick-discovery-tab="keyword"]').getAttribute('aria-selected'), 'true');
        assert.equal(await page.locator('#quick-discovery-keyword-panel').evaluate((element) => element.hidden), false);
        assert.equal(await page.locator('#quick-keyword-discovery-query').inputValue(), '블로그 자동화, 글쓰기 도구');
        await page.locator('#quick-discovery-modal-close').click();
        await page.waitForFunction(() => document.getElementById('quick-discovery-modal')?.classList.contains('hidden'));

        await page.evaluate(async () => {
            const originalConfirm = showUiConfirm;
            showUiConfirm = async () => true;
            try {
                document.getElementById('quick-subject').value = '사용자가 작성한 주제';
                await applyQuickKeywordDiscovery([{ keyword: '선택 키워드' }]);
            } finally {
                showUiConfirm = originalConfirm;
            }
        });
        assert.equal(await page.locator('#quick-subject').inputValue(), '사용자가 작성한 주제');
        assert.equal(await page.locator('#quick-keywords').inputValue(), '선택 키워드');

        await page.evaluate(async () => {
            const originalConfirm = showUiConfirm;
            showUiConfirm = async () => true;
            try {
                document.getElementById('quick-subject').value = '   ';
                await applyQuickKeywordDiscovery([{ keyword: '빈 주제 자동 입력' }]);
            } finally {
                showUiConfirm = originalConfirm;
            }
        });
        assert.equal(await page.locator('#quick-subject').inputValue(), '빈 주제 자동 입력');
        assert.equal(await page.locator('#quick-keywords').inputValue(), '빈 주제 자동 입력');

        await page.locator('#quick-discovery-open-btn').click();
        await page.waitForFunction(() => !document.getElementById('quick-discovery-modal')?.classList.contains('hidden'));
        assert.equal(await page.locator('[data-quick-discovery-tab="topic"]').getAttribute('aria-selected'), 'true');
        await page.locator('#quick-topic-recommendations-refresh').click();
        await page.waitForFunction(() => document.querySelectorAll('.quick-topic-recommendation-row').length === 1);
        assert.match((await page.locator('#quick-topic-smart-usage').textContent()) || '', /한 번 더 새로운 글감을/);
        await page.evaluate(() => {
            const staleOverview = JSON.parse(JSON.stringify(lastAccountOverview));
            staleOverview.smart_usage.items[0].remaining = 20;
            renderAccountOverview(staleOverview, { smartUsageRevisionAtRequest: 0 });
        });
        assert.match((await page.locator('#quick-topic-smart-usage').textContent()) || '', /^19 \/ 20회 남음/);
        await page.locator('#quick-discovery-modal-close').click();
        await page.waitForFunction(() => document.getElementById('quick-discovery-modal')?.classList.contains('hidden'));
        await page.locator('#quick-discovery-open-btn').click();
        await page.waitForFunction(() => !document.getElementById('quick-discovery-modal')?.classList.contains('hidden'));
        assert.equal(await page.locator('.quick-topic-recommendation-row').count(), 1);
        await page.locator('#quick-topic-recommendations-refresh').click();
        await page.waitForFunction(() => document.getElementById('quick-topic-recommendations-refresh')?.textContent?.includes('계속 추천받기'));
        await page.locator('#quick-topic-recommendations-refresh').click();
        await page.waitForFunction(() => !document.getElementById('ui-dialog-backdrop')?.classList.contains('hidden'));
        assert.equal((await page.locator('#ui-dialog-title').textContent())?.trim(), '계속 추천받을까요?');
        assert.doesNotMatch((await page.locator('#ui-dialog-message').textContent()) || '', /세션|provider|request/i);
        await page.locator('#ui-dialog-cancel').click();
        await page.locator('#quick-discovery-modal-close').click();
        await page.waitForFunction(() => document.getElementById('quick-discovery-modal')?.classList.contains('hidden'));

        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForFunction(() => document.body.classList.contains('mobile-quick-mode'));
        assert.equal(await page.locator('.mobile-topbar').evaluate((element) => getComputedStyle(element).display), 'flex');
        await page.evaluate(() => navigateTo('dashboard'));
        await page.waitForFunction(() => document.getElementById('view-dashboard')?.classList.contains('active'));
        const centerBox = await page.locator('#recommendation-center').boundingBox();
        assert.equal(Boolean(centerBox && centerBox.width <= 390), true);
        assert.equal(
            await page.locator('#recommendation-center-list').evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length),
            1
        );
        await page.locator('#mobile-menu-btn').click();
        await page.waitForFunction(() => document.querySelector('.sidebar')?.classList.contains('open'));
        assert.equal(await page.locator('#sidebar-overlay').evaluate((element) => element.classList.contains('active')), true);
        await page.locator('#sidebar-overlay').click({ position: { x: 380, y: 420 } });
        await page.waitForFunction(() => !document.querySelector('.sidebar')?.classList.contains('open'));

        const expectedPosts = requests.filter((request) => request.method !== 'GET');
        assert.deepEqual(expectedPosts, [
            { method: 'POST', pathname: '/api/v1/recommendations/discover' },
            { method: 'POST', pathname: '/api/v1/recommendations/interaction' },
            { method: 'POST', pathname: '/api/v1/recommendations/discover' }
        ]);
        assert.equal(requests.some((request) => request.pathname === '/app.js'), true);
        assert.equal(requests.some((request) => request.pathname === '/styles.css'), true);
        assert.deepEqual(failedResponses, []);
        assert.deepEqual(pageErrors, []);
        assert.deepEqual(consoleErrors, []);

        await context.close();
        console.log(`✅ browser UI smoke test passed (${requests.length} fixture requests)`);
    } finally {
        if (browser) await browser.close();
        await closeServer(server);
    }
}

run().catch((error) => {
    console.error('❌ browser UI smoke test failed');
    console.error(error?.stack || error);
    process.exitCode = 1;
});
