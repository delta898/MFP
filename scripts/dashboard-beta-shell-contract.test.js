const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('the productized Dashboard stays isolated while the legacy Dashboard is hidden', () => {
    const index = read('ui/index.html');
    const legacyView = read('ui/partials/views/dashboard.html');
    const betaView = read('ui/partials/views/dashboard-beta.html');
    const betaScript = read('ui/scripts/features/shell/dashboard-beta.js');

    assert.match(index, /data-view="dashboard" hidden aria-hidden="true" tabindex="-1"/);
    assert.match(index, /class="nav-btn active" data-view="dashboard-beta"/);
    assert.match(index, /data-view="dashboard-beta"[\s\S]*?<span class="nav-label">대시보드<sup class="nav-new-badge" aria-label="새 메뉴">new<\/sup><\/span>/);
    assert.doesNotMatch(index, /대시보드 Beta/);
    assert.match(legacyView, /class="view" id="view-dashboard"/);
    assert.match(betaView, /class="view active" id="view-dashboard-beta"/);
    assert.doesNotMatch(betaView, /\bid="dashboard-(?!beta)/);
    assert.doesNotMatch(betaScript, /getElementById\('dashboard-(?!beta)/);
    assert.doesNotMatch(betaScript, /dashboard\/summary|dashboard\/external-content|\/api\/v1\/auto\/status/);
    assert.doesNotMatch(betaView, /dashboard-beta-badge">Beta/);
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

test('Dashboard guides incomplete setup inline and routes the next action to the exact setting', () => {
    const betaView = read('ui/partials/views/dashboard-beta.html');
    const betaScript = read('ui/scripts/features/shell/dashboard-beta.js');
    const betaStyle = read('ui/styles/features/dashboard-beta.css');
    const generalSettings = read('ui/partials/views/settings/general.html');

    assert.match(betaView, /id="dashboard-beta-onboarding"[^>]*hidden/);
    assert.match(betaView, /AI 글쓰기 모델/);
    assert.match(betaView, /Google Spreadsheet/);
    assert.match(betaView, /네이버 또는 WordPress 중 하나를 준비합니다/);
    assert.doesNotMatch(betaView, /온보딩[^<]*닫기|data-dashboard-beta-onboarding-dismiss/);
    assert.match(betaScript, /function renderDashboardBetaOnboarding/);
    assert.match(betaScript, /section\.hidden = complete/);
    assert.match(betaScript, /setup\?\.publishing_channel\?\.configured === true/);
    assert.match(betaScript, /navigateToSettingsTarget\(settingsTarget\.dataset\.settingsTab, settingsTarget\.dataset\.settingsTarget\)/);
    assert.match(generalSettings, /id="settings-google-auth-section"/);
    assert.match(betaStyle, /\.dashboard-beta-onboarding\[hidden\]\s*\{\s*display:\s*none/);
    assert.match(betaStyle, /\.dashboard-beta-onboarding-steps\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
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
    assert.match(betaScript, /period\?\.recent_results/);
    assert.match(betaScript, /period\?\.daily_series/);
    assert.match(betaScript, /navigation_kind === 'result' \? '글 보기' : '블로그 열기'/);
});

test('Dashboard Beta exposes direct paths to queue and automation without legacy controls', () => {
    const betaView = read('ui/partials/views/dashboard-beta.html');
    const betaScript = read('ui/scripts/features/shell/dashboard-beta.js');
    const betaStyle = read('ui/styles/features/dashboard-beta.css');

    assert.match(betaView, /data-dashboard-beta-tab="queue">글감 관리/);
    assert.match(betaView, /data-dashboard-beta-tab="automation">연속 발행 설정/);
    assert.match(betaView, /data-dashboard-beta-tab="queue">전체 대기열 보기/);
    assert.equal((betaView.match(/data-dashboard-beta-tab="automation"/g) || []).length, 1);
    assert.match(betaView, /id="dashboard-beta-automation-action"/);
    assert.match(betaView, /<p>실제 공개된 글<\/p>/);
    assert.match(betaScript, /발행 대기 \$\{readyCount\}건이 있습니다/);
    assert.match(betaScript, /automationState === 'on'[\s\S]*'설정 보기'[\s\S]*'설정 확인'/);
    assert.match(betaStyle, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(betaStyle, /\.dashboard-beta-flow-actions\s*\{[^}]*justify-content:\s*flex-end/);
    assert.match(betaStyle, /@media \(max-width: 720px\)[\s\S]*\.dashboard-beta-flow-actions\s*\{[^}]*justify-content:\s*flex-start/);
    assert.doesNotMatch(betaView, /쇼핑 자동발행|최신 콘텐츠|뜻밖의 발견|최근 활동 이력/);
});

test('Dashboard strengthens its visual hierarchy and the native File menu opens quick create', () => {
    const betaView = read('ui/partials/views/dashboard-beta.html');
    const betaStyle = read('ui/styles/features/dashboard-beta.css');
    const navigation = read('ui/scripts/foundation/navigation.js');
    const electronMain = read('src/gui/electron-main.js');

    assert.match(betaView, /class="view-title-block dashboard-beta-hero"/);
    assert.doesNotMatch(betaView, /dashboard-beta-quick-create|data-dashboard-beta-action="quick-create"/);
    assert.match(navigation, /async function navigateToBlogQuickCreate\(\)[\s\S]*navigateTo\('blog-next', 'quick'\)[\s\S]*activateBlogNextInputMode\('ai'\)[\s\S]*blog-next-subject/);
    assert.match(electronMain, /function openBlogQuickCreate\(\)[\s\S]*navigateToBlogQuickCreate/);
    assert.match(electronMain, /label: '새 글 작성', click: openBlogQuickCreate/);
    assert.doesNotMatch(electronMain, /label: '새 글 작성'[^\n]*accelerator/);
    assert.match(betaStyle, /\.dashboard-beta-hero\s*\{[\s\S]*radial-gradient/);
    assert.match(betaStyle, /\.dashboard-beta-stat-card:nth-child\(2\)/);
});

test('Dashboard Beta restores the shared new discovery center without blocking operations', () => {
    const betaView = read('ui/partials/views/dashboard-beta.html');
    const legacyView = read('ui/partials/views/dashboard.html');
    const betaScript = read('ui/scripts/features/shell/dashboard-beta.js');
    const centerScript = read('ui/scripts/features/recommendations/center.js');

    assert.match(betaView, /id="dashboard-beta-discovery"[^>]*data-recommendation-center/);
    assert.match(betaView, /dashboard-beta-eyebrow">글감<\/span>\s*<div class="recommendation-center-title-row">\s*<h2 id="dashboard-beta-discovery-title">새로운 발견/);
    assert.match(betaView, /id="dashboard-beta-discovery-title">새로운 발견/);
    assert.match(betaView, /id="dashboard-beta-discovery-list"[^>]*data-recommendation-list/);
    assert.match(betaView, /data-idle-label="새 소재 찾기"/);
    assert.match(legacyView, /id="recommendation-center"[^>]*data-recommendation-center/);
    assert.match(betaScript, /void loadRecommendationCenterForDashboard\(\)/);
    assert.match(centerScript, /function activeRecommendationCenterMount\(\)/);
    assert.match(centerScript, /'dashboard\.recommendations': \['dashboard-beta', ''\]/);
    assert.match(centerScript, /await navigateTo\('dashboard-beta'\)/);
    assert.match(centerScript, /'blog\.quick': \['blog-next', 'quick'\]/);
    assert.match(centerScript, /getElementById\('blog-next-subject'\)/);
    assert.doesNotMatch(centerScript, /surface === 'blog\.quick'[\s\S]{0,300}getElementById\('quick-subject'\)/);
});

test('productized navigation hides legacy Blog and uses the new Blog on mobile', () => {
    const index = read('ui/index.html');
    const navigation = read('ui/scripts/foundation/navigation.js');
    const responsive = read('ui/styles/layout/responsive.css');

    assert.match(index, /data-view="blog" hidden aria-hidden="true" tabindex="-1"/);
    assert.match(index, /data-view="blog-next"[\s\S]*?<span class="nav-label">블로그<sup class="nav-new-badge"/);
    assert.match(navigation, /viewName = 'blog-next';[\s\S]*subTab = 'quick';/);
    assert.match(navigation, /void navigateTo\('blog-next', 'quick'\)/);
    assert.match(responsive, /mobile-quick-mode \.nav-btn\[data-view="blog"\]/);
    assert.doesNotMatch(responsive, /mobile-quick-mode \.nav-btn\[data-view="blog-next"\]/);
});

test('the productized Dashboard shows one remote BlogGenius tip and hides an empty region', () => {
    const betaView = read('ui/partials/views/dashboard-beta.html');
    const betaScript = read('ui/scripts/features/shell/dashboard-beta.js');
    const supportingScript = read('ui/scripts/features/shell/supporting-surfaces.js');

    assert.match(betaView, /id="dashboard-beta-tips-section"[^>]*hidden/);
    assert.match(betaView, /id="dashboard-beta-tips-title">BlogGenius 활용 팁/);
    assert.match(betaView, /id="dashboard-beta-tips-region"/);
    assert.match(betaView, /data-dashboard-beta-nav="help">전체 가이드 보기/);
    assert.equal((betaView.match(/data-dashboard-beta-nav="help"/g) || []).length, 1);
    assert.match(betaScript, /initDashboardBetaDynamicContent\(\)/);
    assert.match(supportingScript, /function initDashboardBetaDynamicContent\(\)/);
    assert.match(betaView, /30분마다 새롭게/);
    assert.match(supportingScript, /function selectHalfHourCycleSurfaceBlock/);
    assert.match(supportingScript, /region: 'recommendations'[\s\S]*selection: 'half_hour_cycle'/);
    assert.match(supportingScript, /30 \* 60 \* 1000/);
    assert.match(supportingScript, /visibilityTarget\.hidden = !selected/);
});

test('Dashboard Beta shows the remote support teaser rarely and suppresses it during priority work', () => {
    const betaView = read('ui/partials/views/dashboard-beta.html');
    const betaScript = read('ui/scripts/features/shell/dashboard-beta.js');
    const supportingScript = read('ui/scripts/features/shell/supporting-surfaces.js');

    assert.match(betaView, /id="dashboard-beta-support-teaser"[^>]*[\s\S]*?hidden>/);
    assert.match(betaView, /가끔 만나는 이야기/);
    assert.doesNotMatch(betaView, /오늘은 그만 보기|data-dashboard-beta-support-dismiss/);
    assert.match(betaScript, /function dashboardBetaCanShowSupportTeaser/);
    assert.match(betaScript, /flow\.busy !== true/);
    assert.match(betaScript, /void initDashboardBetaSupportTeaser/);
    assert.match(supportingScript, /DASHBOARD_SUPPORT_TEASER_INTERVAL_MS = 3 \* 24 \* 60 \* 60 \* 1000/);
    assert.match(supportingScript, /kinds: \['support'\]/);
    assert.doesNotMatch(supportingScript, /dismissDashboardSupportTeaser/);
});
