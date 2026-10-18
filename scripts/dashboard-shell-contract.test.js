const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('Dashboard uses its own current view and controller', () => {
    const index = read('ui/index.html');
    const dashboardView = read('ui/partials/views/dashboard.html');
    const dashboardScript = read('ui/scripts/features/dashboard/dashboard.js');

    assert.match(index, /class="nav-btn active" data-view="dashboard"/);
    assert.match(index, /data-view="dashboard"[\s\S]*?<span class="nav-label">대시보드<\/span>/);
    assert.doesNotMatch(index, /dashboard-beta|Dashboard Beta/);
    assert.match(dashboardView, /class="view active" id="view-dashboard"/);
    assert.doesNotMatch(dashboardView, /data-style-scope=/);
    assert.doesNotMatch(dashboardView, /dashboard-beta|Dashboard Beta/);
    assert.doesNotMatch(dashboardScript, /dashboard-beta|Dashboard Beta|DashboardBeta|dashboardBeta/);
    assert.doesNotMatch(dashboardScript, /dashboard\/summary|dashboard\/external-content|\/api\/v1\/auto\/status/);
    assert.doesNotMatch(dashboardView, /dashboard-badge">Beta/);
});

test('Dashboard loads independent readiness, operations, and result stats read models', () => {
    const dashboardScript = read('ui/scripts/features/dashboard/dashboard.js');
    const navigation = read('ui/scripts/shell/navigation.js');
    const lifecycle = read('ui/scripts/shell/lifecycle.js');

    assert.match(dashboardScript, /\/api\/v1\/account\/overview\?quiet=1/);
    assert.match(dashboardScript, /\/api\/v1\/continuous-publishing\/dashboard-overview/);
    assert.match(dashboardScript, /\/api\/v1\/continuous-publishing\/dashboard-result-stats/);
    assert.match(dashboardScript, /Array\.isArray\(items\) \? items\.slice\(0, 3\)/);
    assert.match(navigation, /viewName === 'dashboard'[\s\S]*loadDashboard\(\)/);
    assert.match(lifecycle, /Initial Dashboard load attempted/);
    assert.match(lifecycle, /view-dashboard[\s\S]*loadDashboard\(\{ force: true \}\)/);
});

test('Dashboard guides incomplete setup inline and routes the next action to the exact setting', () => {
    const dashboardView = read('ui/partials/views/dashboard.html');
    const dashboardScript = read('ui/scripts/features/dashboard/dashboard.js');
    const dashboardStyle = read('ui/styles/features/dashboard.css');

    assert.match(dashboardView, /id="dashboard-onboarding"[^>]*hidden/);
    assert.match(dashboardView, /AI 글쓰기 모델/);
    assert.match(dashboardView, /Google Spreadsheet/);
    assert.match(dashboardView, /콘텐츠를 저장할 Spreadsheet를 연결합니다\./);
    assert.match(dashboardView, /dashboard-onboarding-step-badge" hidden>전환 필요/);
    assert.match(dashboardView, /네이버 또는 WordPress 중 하나를 준비합니다/);
    assert.doesNotMatch(dashboardView, /온보딩[^<]*닫기|data-dashboard-onboarding-dismiss/);
    assert.match(dashboardScript, /function renderDashboardOnboarding/);
    assert.match(dashboardScript, /section\.hidden = complete/);
    assert.match(dashboardScript, /setup\?\.publishing_channel\?\.configured === true/);
    assert.match(dashboardScript, /setup\?\.google\?\.transition_required === true/);
    assert.match(dashboardScript, /step\.id === 'google'\s*\? \(transitionRequired \? 'transition' : 'pending'\)/);
    assert.match(dashboardScript, /step\.id === 'google' \|\| !ready \? String\(index \+ 1\) : '✓'/);
    assert.match(dashboardScript, /badge\.hidden = !transitionRequired/);
    assert.match(dashboardScript, /기존 Spreadsheet 연결을 전환해 주세요\./);
    assert.match(dashboardScript, /action\.textContent = transitionRequired \? '전환하기'/);
    assert.match(dashboardStyle, /data-state="transition"/);
    assert.match(dashboardStyle, /\.dashboard-onboarding-step-badge\[hidden\]\s*\{\s*display:\s*none/);
    assert.match(dashboardStyle, /\.dashboard-onboarding-step\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*30px minmax\(0, 1fr\)/);
    assert.match(dashboardStyle, /\.dashboard-onboarding-step > div\s*\{\s*min-width:\s*0;\s*width:\s*100%/);
    assert.match(dashboardScript, /navigateToSettingsNextTarget\(\s*settingsTarget\.dataset\.settingsTab,\s*settingsTarget\.dataset\.settingsTarget,\s*settingsTarget\.dataset\.settingsLocalTab \|\| ''\s*\)/);
    assert.match(dashboardView, /data-dashboard-setup-step="ai"[^>]*data-settings-tab="ai"[^>]*data-settings-target="settings-next-ai-text-form"/);
    assert.match(dashboardView, /data-dashboard-setup-step="google"[^>]*data-settings-tab="core"[^>]*data-settings-target="settings-next-content-form"/);
    assert.match(dashboardView, /data-dashboard-setup-step="channel"[^>]*data-settings-tab="core"[^>]*data-settings-target="settings-next-naver-form"[^>]*data-settings-local-tab="publishing"/);
    assert.match(dashboardStyle, /\.dashboard-onboarding\[hidden\]\s*\{\s*display:\s*none/);
    assert.match(dashboardStyle, /\.dashboard-onboarding-steps\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
    assert.match(dashboardStyle, /\.dashboard-onboarding\s*\{[^}]*border-width:\s*2px/);
    assert.match(dashboardStyle, /\.dashboard-onboarding\s*\{[^}]*var\(--ui-action-primary\)/);
    assert.match(dashboardStyle, /\.dashboard-onboarding-step:hover\s*\{[^}]*transform:\s*var\(--ui-card-hover-transform\)/);
});

test('Dashboard channel chips expose brand icons, states, and publish-channel deep links', () => {
    const dashboardScript = read('ui/scripts/features/dashboard/dashboard.js');
    const dashboardView = read('ui/partials/views/dashboard.html');
    const dashboardStyle = read('ui/styles/features/dashboard.css');

    assert.match(dashboardScript, /const DASHBOARD_CHANNELS = Object\.freeze\(\[/);
    assert.match(dashboardScript, /id: 'naver'[\s\S]*?form: 'settings-next-naver-form'/);
    assert.match(dashboardScript, /id: 'wordpress'[\s\S]*?form: 'settings-next-wordpress-form'/);
    assert.match(dashboardScript, /function createDashboardChannelButton\(channel, state, label, reason = '', checkedAt = ''\)/);
    assert.doesNotMatch(dashboardScript, /shortLabel|statusCopy/);
    assert.match(dashboardScript, /button\.dataset\.dashboardChannel = channel\.id/);
    assert.match(dashboardScript, /button\.style\.setProperty\('--channel-brand', channel\.brand\)/);
    assert.match(dashboardScript, /button\.dataset\.dashboardTarget = channel\.form/);
    assert.match(dashboardScript, /aria-label.*channel\.name/);
    assert.match(dashboardScript, /button\.dataset\.dashboardTooltip = detail/);
    assert.match(dashboardScript, /const includeDiagnostics = state === 'ready' \|\| state === 'muted'/);
    assert.match(dashboardScript, /includeDiagnostics \? normalizedReason : ''/);
    assert.match(dashboardScript, /includeDiagnostics && normalizedCheckedAt/);
    assert.match(dashboardScript, /status === 'not_connected'/);
    assert.match(dashboardScript, /state: 'failed', label: labels\.failed/);
    assert.doesNotMatch(dashboardScript, /\['connected', 'configured'\]\.includes\(status\)/);
    assert.match(dashboardScript, /failed: 'WordPress 연결 실패'/);
    assert.match(dashboardScript, /status === 'failed'/);
    assert.match(dashboardScript, /navigateToSettingsNextTarget\(targetTab \|\| 'core', targetId, targetLocalTab\)/);
    assert.match(dashboardView, /data-dashboard-channel="naver"[^>]*data-dashboard-nav="settings-next"[^>]*data-dashboard-target="settings-next-naver-form"[^>]*disabled/);
    assert.match(dashboardView, /data-dashboard-channel="wordpress"[^>]*data-dashboard-nav="settings-next"[^>]*data-dashboard-target="settings-next-wordpress-form"[^>]*disabled/);
    assert.match(dashboardView, /class="dashboard-channel-name">네이버 블로그/);
    assert.match(dashboardView, /class="dashboard-channel-name">WordPress/);
    assert.match(dashboardView, /data-dashboard-channel="site-hosting"[^>]*data-dashboard-nav="site-hosting"[^>]*disabled/);
    assert.match(dashboardView, /class="dashboard-channel-name">웹사이트/);
    assert.match(dashboardScript, /\/api\/v1\/site-hosting\/cloudflare\/status/);
    assert.match(dashboardScript, /id: 'site-hosting'[\s\S]*?nav: 'site-hosting'/);
    assert.match(dashboardScript, /channel\.id === 'site-hosting' && state !== 'ready'[\s\S]*?nav: 'settings-next'[\s\S]*?localTab: 'hosting'/);
    assert.doesNotMatch(dashboardView, /data-dashboard-nav="settings"/);
    assert.match(dashboardView, /dashboard-channel-icon/);
    assert.match(dashboardStyle, /button\[data-dashboard-channel="wordpress"\] \.dashboard-channel-icon\s*\{[^}]*transform:\s*scale\(1\.12\)/);
    assert.match(dashboardStyle, /\.dashboard-channel-status\[data-state="ready"\] \.dashboard-state-dot/);
    assert.match(dashboardStyle, /\.dashboard-channel-status\[data-state="failed"\] \.dashboard-state-dot/);
    assert.match(dashboardStyle, /#view-dashboard\s*\{[^}]*--dashboard-status-ready:\s*var\(--ui-status-success\);[^}]*--dashboard-status-attention:\s*var\(--ui-status-warning\);[^}]*--dashboard-status-failed:\s*var\(--ui-status-danger\);/);
    assert.match(dashboardStyle, /\.dashboard-state-dot\s*\{[^}]*width:\s*14px;[^}]*height:\s*14px;[^}]*border:\s*2px solid var\(--ui-surface\)/);
    assert.match(dashboardStyle, /background:\s*var\(--dashboard-status-ready\)/);
    assert.match(dashboardStyle, /background:\s*var\(--dashboard-status-attention\)/);
    assert.match(dashboardStyle, /button\[data-dashboard-channel\]:focus::after/);
    assert.match(dashboardStyle, /\.dashboard-readiness-items \[data-dashboard-nav="account"\]/);
    assert.match(dashboardStyle, /\.dashboard-readiness-items button:disabled/);
    ['warm-editorial'].forEach((theme) => {
      const tokens = read(`ui/styles/styles/${theme}.css`);
      assert.match(tokens, /--ui-channel-naver:\s*#03C75A;/);
      assert.match(tokens, /--ui-channel-wordpress:\s*#21759B;/);
    });
});

test('Dashboard distinguishes processed and public results across today and week', () => {
    const dashboardView = read('ui/partials/views/dashboard.html');
    const dashboardScript = read('ui/scripts/features/dashboard/dashboard.js');

    assert.match(dashboardView, /data-dashboard-period="today"[^>]*>오늘/);
    assert.match(dashboardView, /data-dashboard-period="week"[^>]*>이번 주/);
    assert.match(dashboardView, /data-dashboard-period="month"[^>]*>최근 30일/);
    assert.match(dashboardView, /id="dashboard-processed-count"/);
    assert.match(dashboardView, /id="dashboard-published-count"/);
    assert.match(dashboardView, /id="dashboard-stat-summary-title" class="ui-overview-subheading">요약/);
    assert.match(dashboardView, /id="dashboard-recent-results-title" class="ui-overview-subheading">발행 내역/);
    assert.match(dashboardView, /id="dashboard-recent-results-list"/);
    assert.match(dashboardView, /id="dashboard-trend-bars"/);
    assert.match(dashboardScript, /Array\.isArray\(items\) \? items\.slice\(0, 5\)/);
    assert.match(dashboardScript, /period\?\.recent_results/);
    assert.match(dashboardScript, /period\?\.trend_series/);
    assert.match(dashboardScript, /period\?\.trend_unit/);
    assert.match(dashboardScript, /today: '오늘 시간대별 추이'/);
    assert.match(dashboardScript, /function dashboardTrendAxisLabel/);
    assert.match(dashboardScript, /index === 0 \|\| index === length - 1 \|\| \(index % 7 === 0 && index < length - 2\)/);
    assert.doesNotMatch(dashboardScript, /dashboard-recent-results-title/);
    assert.match(dashboardScript, /navigation_kind === 'result' \? '글 보기' : '블로그 열기'/);
});

test('Dashboard presents flow state once through the shared status badge', () => {
    const dashboardView = read('ui/partials/views/dashboard.html');
    const dashboardScript = read('ui/scripts/features/dashboard/dashboard.js');
    const dashboardStyle = read('ui/styles/features/dashboard.css');

    assert.match(dashboardView, /id="dashboard-flow-badge" class="dashboard-flow-badge ui-status-badge"/);
    assert.doesNotMatch(dashboardView, /dashboard-flow-indicator/);
    assert.doesNotMatch(dashboardScript, /flowIndicator|dashboard-flow-indicator/);
    assert.doesNotMatch(dashboardStyle, /dashboard-flow-indicator|dashboard-spin/);
});

test('Dashboard exposes direct paths to queue and automation without legacy controls', () => {
    const dashboardView = read('ui/partials/views/dashboard.html');
    const dashboardScript = read('ui/scripts/features/dashboard/dashboard.js');
    const dashboardStyle = read('ui/styles/features/dashboard.css');
    const dashboardResponsiveStyle = read('ui/styles/features/dashboard-responsive.css');

    assert.match(dashboardView, /data-dashboard-tab="queue">글감 관리/);
    assert.match(dashboardView, /class="primary"[^>]*data-dashboard-nav="blog-next"[^>]*data-dashboard-tab="queue">글감 관리/);
    assert.match(dashboardView, /data-dashboard-tab="automation">연속 발행 설정/);
    assert.match(dashboardView, /id="dashboard-automation-action" class="secondary"/);
    assert.match(dashboardView, /class="ui-text-action"[^>]*data-dashboard-tab="queue">전체 대기열 보기/);
    assert.match(dashboardView, /id="dashboard-discovery-refresh" class="secondary compact ui-loading-action"/);
    assert.match(dashboardView, /class="ui-text-action"[^>]*data-dashboard-nav="help">전체 가이드 보기/);
    assert.equal((dashboardView.match(/data-dashboard-tab="automation"/g) || []).length, 1);
    assert.match(dashboardView, /id="dashboard-automation-action"/);
    assert.match(dashboardView, /<p>실제 공개된 글<\/p>/);
    assert.match(dashboardScript, /발행 대기 \$\{readyCount\}건이 있습니다/);
    assert.match(dashboardScript, /automationState === 'on'[\s\S]*'설정 보기'[\s\S]*'설정 확인'/);
    assert.match(dashboardStyle, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(dashboardStyle, /\.dashboard-flow-actions\s*\{[^}]*justify-content:\s*flex-end/);
    assert.match(dashboardResponsiveStyle, /@media \(max-width: 768px\)[\s\S]*\.dashboard-flow-actions\s*\{[^}]*justify-content:\s*flex-start/);
    assert.doesNotMatch(dashboardView, /쇼핑 자동발행|최신 콘텐츠|뜻밖의 발견|최근 활동 이력/);
});

test('Dashboard strengthens its visual hierarchy and the native File menu opens quick create', () => {
    const dashboardView = read('ui/partials/views/dashboard.html');
    const dashboardStyle = read('ui/styles/features/dashboard.css');
    const navigation = read('ui/scripts/shell/navigation.js');
    const electronMain = read('src/host/electron/electron-main.js');

    assert.match(dashboardView, /class="view-title-block dashboard-hero"/);
    assert.doesNotMatch(dashboardView, /dashboard-quick-create|data-dashboard-action="quick-create"/);
    assert.match(navigation, /async function navigateToBlogQuickCreate\(options = \{\}\)[\s\S]*applyBlogNextWritingIntent\(\{\s*values: options\.values \|\| \{\}[\s\S]*prepareDestination:[\s\S]*navigateTo\('blog-next', 'quick'\)[\s\S]*focusAfterFrame: true/);
    assert.match(navigation, /prepareDestination: async \(\) => \{\s*await navigateTo\('blog-next', 'quick'\);\s*const quickTabActive = document\.querySelector\('\[data-blog-next-tab="quick"\]'\)\?\.getAttribute\('aria-selected'\) === 'true';\s*return Boolean\([\s\S]*?&& quickTabActive\s*\);/);
    assert.match(navigation, /현재 원고를 닫고 다음 글을 작성할까요\?[\s\S]*작성 중인 내용과 원고 미리보기를 지우고 새 글을 작성할까요/);
    assert.match(navigation, /function hasOpenBlockingDialog\(\)[\s\S]*dialog\[open\][\s\S]*\[role="dialog"\]\[aria-modal="true"\]/);
    assert.match(navigation, /async function navigateToBlogQuickCreate\(options = \{\}\)\s*\{\s*if \(hasOpenBlockingDialog\(\)\) return false;/);
    assert.match(electronMain, /function openBlogQuickCreate\(\)[\s\S]*navigateToBlogQuickCreate/);
    assert.match(electronMain, /label: '새 글 작성', accelerator: 'CmdOrCtrl\+N', click: openBlogQuickCreate/);
    assert.doesNotMatch(dashboardStyle, /\.dashboard-hero\s*\{[\s\S]*?radial-gradient/);
    assert.match(dashboardStyle, /\.dashboard-hero\s*\{[^}]*overflow:\s*visible/);
    assert.doesNotMatch(dashboardStyle, /\.dashboard-stat-card:nth-child\(2\)/);
});

test('Dashboard restores the shared new discovery center without blocking operations', () => {
    const dashboardView = read('ui/partials/views/dashboard.html');
    const dashboardScript = read('ui/scripts/features/dashboard/dashboard.js');
    const centerScript = read('ui/scripts/features/dashboard/recommendations.js');

    assert.match(dashboardView, /id="dashboard-discovery"[^>]*data-recommendation-center/);
    assert.match(dashboardView, /dashboard-eyebrow ui-overview-eyebrow">글감<\/span>\s*<div class="recommendation-center-title-row">\s*<h2 id="dashboard-discovery-title">새로운 발견/);
    assert.match(dashboardView, /id="dashboard-discovery-title">새로운 발견/);
    assert.match(dashboardView, /id="dashboard-discovery-list"[^>]*data-recommendation-list/);
    assert.match(dashboardView, /data-idle-label="새 소재 찾기"/);
    assert.match(dashboardView, /class="recommendation-center-count ui-count-badge"/);
    assert.match(dashboardScript, /void loadRecommendationCenterForDashboard\(\)/);
    assert.match(centerScript, /function activeRecommendationCenterMount\(\)/);
    assert.match(centerScript, /'dashboard\.recommendations': \['dashboard', ''\]/);
    assert.match(centerScript, /await navigateTo\('dashboard'\)/);
    assert.match(centerScript, /'blog\.quick': \['blog-next', 'quick'\]/);
    assert.match(centerScript, /navigateToBlogQuickCreate\(\{\s*values: query \? \{ 'blog-next-subject': query \} : \{\}/);
    assert.doesNotMatch(centerScript, /surface === 'blog\.quick'[\s\S]{0,500}getElementById\('blog-next-subject'\)/);
});

test('Blog Beta is the productized Blog destination on desktop and mobile', () => {
    const index = read('ui/index.html');
    const navigation = read('ui/scripts/shell/navigation.js');

    assert.match(index, /data-view="blog-next"[\s\S]*?<span class="nav-label">블로그<\/span>/);
    assert.match(navigation, /viewName = 'blog-next';[\s\S]*subTab = 'quick';/);
    assert.match(navigation, /void navigateTo\('blog-next', 'quick'\)/);
});

test('the productized Dashboard shows one remote BlogGenius tip and hides an empty region', () => {
    const dashboardView = read('ui/partials/views/dashboard.html');
    const dashboardScript = read('ui/scripts/features/dashboard/dashboard.js');
    const supportingScript = read('ui/scripts/shell/supporting-surfaces.js');

    assert.match(dashboardView, /id="dashboard-tips-section"[^>]*hidden/);
    assert.match(dashboardView, /id="dashboard-tips-title">BlogGenius 활용 팁/);
    assert.match(dashboardView, /id="dashboard-tips-region"/);
    assert.match(dashboardView, /data-dashboard-nav="help">전체 가이드 보기/);
    assert.equal((dashboardView.match(/data-dashboard-nav="help"/g) || []).length, 1);
    assert.match(dashboardScript, /initDashboardDynamicContent\(\)/);
    assert.match(supportingScript, /function initDashboardDynamicContent\(\)/);
    assert.match(dashboardView, /30분마다 새롭게/);
    assert.match(supportingScript, /function selectHalfHourCycleSurfaceBlock/);
    assert.match(supportingScript, /region: 'recommendations'[\s\S]*selection: 'half_hour_cycle'/);
    assert.match(supportingScript, /30 \* 60 \* 1000/);
    assert.match(supportingScript, /visibilityTarget\.hidden = !selected/);
});

test('Dashboard shows the remote support teaser rarely and suppresses it during priority work', () => {
    const dashboardView = read('ui/partials/views/dashboard.html');
    const dashboardScript = read('ui/scripts/features/dashboard/dashboard.js');
    const supportingScript = read('ui/scripts/shell/supporting-surfaces.js');

    assert.match(dashboardView, /id="dashboard-support-teaser"[^>]*[\s\S]*?hidden>/);
    assert.match(dashboardView, /가끔 만나는 이야기/);
    assert.doesNotMatch(dashboardView, /오늘은 그만 보기|data-dashboard-support-dismiss/);
    assert.match(dashboardScript, /function dashboardCanShowSupportTeaser/);
    assert.match(dashboardScript, /flow\.busy !== true/);
    assert.match(dashboardScript, /void initDashboardSupportTeaser/);
    assert.match(supportingScript, /DASHBOARD_SUPPORT_TEASER_INTERVAL_MS = 3 \* 24 \* 60 \* 60 \* 1000/);
    assert.match(supportingScript, /kinds: \['support'\]/);
    assert.doesNotMatch(supportingScript, /dismissDashboardSupportTeaser/);
});
