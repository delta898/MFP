const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('Dashboard Beta is isolated from the legacy Dashboard shell', () => {
    const index = read('ui/index.html');
    const legacyView = read('ui/partials/views/dashboard.html');
    const betaView = read('ui/partials/views/dashboard-beta.html');
    const betaScript = read('ui/scripts/features/shell/dashboard-beta.js');

    assert.match(index, /data-view="dashboard"/);
    assert.match(index, /class="nav-btn active" data-view="dashboard-beta"/);
    assert.match(legacyView, /class="view" id="view-dashboard"/);
    assert.match(betaView, /class="view active" id="view-dashboard-beta"/);
    assert.doesNotMatch(betaView, /\bid="dashboard-(?!beta)/);
    assert.doesNotMatch(betaScript, /getElementById\('dashboard-(?!beta)/);
    assert.doesNotMatch(betaScript, /dashboard\/summary|dashboard\/external-content|\/api\/v1\/auto\/status/);
});

test('Dashboard Beta loads independent readiness, operations, and result stats read models', () => {
    const betaScript = read('ui/scripts/features/shell/dashboard-beta.js');
    const navigation = read('ui/scripts/foundation/navigation.js');
    const lifecycle = read('ui/scripts/foundation/lifecycle.js');

    assert.match(betaScript, /\/api\/v1\/account\/overview\?quiet=1/);
    assert.match(betaScript, /\/api\/v1\/continuous-publishing\/dashboard-overview/);
    assert.match(betaScript, /\/api\/v1\/continuous-publishing\/dashboard-result-stats/);
    assert.match(betaScript, /Array\.isArray\(items\) \? items\.slice\(0, 3\)/);
    assert.match(navigation, /viewName === 'dashboard-beta'[\s\S]*loadDashboardBeta\(\)/);
    assert.match(lifecycle, /Initial Dashboard Beta load attempted/);
    assert.match(lifecycle, /view-dashboard-beta[\s\S]*loadDashboardBeta\(\{ force: true \}\)/);
});

test('Dashboard Beta distinguishes processed and public results across today and week', () => {
    const betaView = read('ui/partials/views/dashboard-beta.html');
    const betaScript = read('ui/scripts/features/shell/dashboard-beta.js');

    assert.match(betaView, /data-dashboard-beta-period="today"[^>]*>오늘/);
    assert.match(betaView, /data-dashboard-beta-period="week"[^>]*>이번 주/);
    assert.match(betaView, /data-dashboard-beta-period="month"[^>]*>최근 30일/);
    assert.match(betaView, /id="dashboard-beta-processed-count"/);
    assert.match(betaView, /id="dashboard-beta-published-count"/);
    assert.match(betaView, /id="dashboard-beta-recent-results-list"/);
    assert.match(betaView, /id="dashboard-beta-trend-bars"/);
    assert.match(betaScript, /Array\.isArray\(items\) \? items\.slice\(0, 5\)/);
});

test('Dashboard Beta exposes direct paths to queue and automation without legacy controls', () => {
    const betaView = read('ui/partials/views/dashboard-beta.html');

    assert.match(betaView, /data-dashboard-beta-tab="queue">글감 관리/);
    assert.match(betaView, /data-dashboard-beta-tab="automation">연속 발행 설정/);
    assert.match(betaView, /data-dashboard-beta-tab="queue">전체 대기열 보기/);
    assert.doesNotMatch(betaView, /쇼핑 자동발행|최신 콘텐츠|뜻밖의 발견|최근 활동 이력/);
});
