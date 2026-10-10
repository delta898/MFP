const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('Dashboard Beta uses its own current view and controller', () => {
    const index = read('ui/index.html');
    const betaView = read('ui/partials/views/dashboard-beta.html');
    const betaScript = read('ui/scripts/features/shell/dashboard-beta.js');

    assert.match(index, /class="nav-btn active" data-view="dashboard-beta"/);
    assert.match(index, /data-view="dashboard-beta"[\s\S]*?<span class="nav-label">대시보드<\/span>/);
    assert.doesNotMatch(index, /대시보드 Beta/);
    assert.match(betaView, /class="view active" id="view-dashboard-beta"/);
    assert.doesNotMatch(betaView, /data-style-scope=/);
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

    assert.match(betaView, /id="dashboard-beta-onboarding"[^>]*hidden/);
    assert.match(betaView, /AI 글쓰기 모델/);
    assert.match(betaView, /Google Spreadsheet/);
    assert.match(betaView, /콘텐츠를 저장할 Spreadsheet를 연결합니다\./);
    assert.match(betaView, /dashboard-beta-onboarding-step-badge" hidden>전환 필요/);
    assert.match(betaView, /네이버 또는 WordPress 중 하나를 준비합니다/);
    assert.doesNotMatch(betaView, /온보딩[^<]*닫기|data-dashboard-beta-onboarding-dismiss/);
    assert.match(betaScript, /function renderDashboardBetaOnboarding/);
    assert.match(betaScript, /section\.hidden = complete/);
    assert.match(betaScript, /setup\?\.publishing_channel\?\.configured === true/);
    assert.match(betaScript, /setup\?\.google\?\.transition_required === true/);
    assert.match(betaScript, /step\.id === 'google'\s*\? \(transitionRequired \? 'transition' : 'pending'\)/);
    assert.match(betaScript, /step\.id === 'google' \|\| !ready \? String\(index \+ 1\) : '✓'/);
    assert.match(betaScript, /badge\.hidden = !transitionRequired/);
    assert.match(betaScript, /기존 Spreadsheet 연결을 전환해 주세요\./);
    assert.match(betaScript, /action\.textContent = transitionRequired \? '전환하기'/);
    assert.match(betaStyle, /data-state="transition"/);
    assert.match(betaStyle, /\.dashboard-beta-onboarding-step-badge\[hidden\]\s*\{\s*display:\s*none/);
    assert.match(betaStyle, /\.dashboard-beta-onboarding-step\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*30px minmax\(0, 1fr\)/);
    assert.match(betaStyle, /\.dashboard-beta-onboarding-step > div\s*\{\s*min-width:\s*0;\s*width:\s*100%/);
    assert.match(betaScript, /navigateToSettingsNextTarget\(\s*settingsTarget\.dataset\.settingsTab,\s*settingsTarget\.dataset\.settingsTarget,\s*settingsTarget\.dataset\.settingsLocalTab \|\| ''\s*\)/);
    assert.match(betaView, /data-dashboard-beta-setup-step="ai"[^>]*data-settings-tab="ai"[^>]*data-settings-target="settings-next-ai-text-form"/);
    assert.match(betaView, /data-dashboard-beta-setup-step="google"[^>]*data-settings-tab="core"[^>]*data-settings-target="settings-next-content-form"/);
    assert.match(betaView, /data-dashboard-beta-setup-step="channel"[^>]*data-settings-tab="core"[^>]*data-settings-target="settings-next-naver-form"[^>]*data-settings-local-tab="publishing"/);
    assert.match(betaStyle, /\.dashboard-beta-onboarding\[hidden\]\s*\{\s*display:\s*none/);
    assert.match(betaStyle, /\.dashboard-beta-onboarding-steps\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
    assert.match(betaStyle, /\.dashboard-beta-onboarding\s*\{[^}]*border-width:\s*2px/);
    assert.match(betaStyle, /\.dashboard-beta-onboarding\s*\{[^}]*var\(--ui-action-primary\)/);
    assert.match(betaStyle, /\.dashboard-beta-onboarding-step:hover\s*\{[^}]*transform:\s*var\(--ui-card-hover-transform\)/);
});

test('Dashboard Beta channel chips expose brand icons, states, and publish-channel deep links', () => {
    const betaScript = read('ui/scripts/features/shell/dashboard-beta.js');
    const betaView = read('ui/partials/views/dashboard-beta.html');
    const betaStyle = read('ui/styles/features/dashboard-beta.css');

    assert.match(betaScript, /const DASHBOARD_BETA_CHANNELS = Object\.freeze\(\[/);
    assert.match(betaScript, /id: 'naver'[\s\S]*?form: 'settings-next-naver-form'/);
    assert.match(betaScript, /id: 'wordpress'[\s\S]*?form: 'settings-next-wordpress-form'/);
    assert.match(betaScript, /function createDashboardBetaChannelButton\(channel, state, label, reason = '', checkedAt = ''\)/);
    assert.doesNotMatch(betaScript, /shortLabel|statusCopy/);
    assert.match(betaScript, /button\.dataset\.dashboardBetaChannel = channel\.id/);
    assert.match(betaScript, /button\.style\.setProperty\('--channel-brand', channel\.brand\)/);
    assert.match(betaScript, /button\.dataset\.dashboardBetaTarget = channel\.form/);
    assert.match(betaScript, /aria-label.*channel\.name/);
    assert.match(betaScript, /button\.dataset\.dashboardBetaTooltip = detail/);
    assert.match(betaScript, /const includeDiagnostics = state === 'ready' \|\| state === 'muted'/);
    assert.match(betaScript, /includeDiagnostics \? normalizedReason : ''/);
    assert.match(betaScript, /includeDiagnostics && normalizedCheckedAt/);
    assert.match(betaScript, /status === 'not_connected'/);
    assert.match(betaScript, /state: 'failed', label: labels\.failed/);
    assert.doesNotMatch(betaScript, /\['connected', 'configured'\]\.includes\(status\)/);
    assert.match(betaScript, /failed: 'WordPress 연결 실패'/);
    assert.match(betaScript, /status === 'failed'/);
    assert.match(betaScript, /navigateToSettingsNextTarget\(betaTab \|\| 'core', betaTarget, betaLocalTab\)/);
    assert.match(betaView, /data-dashboard-beta-channel="naver"[^>]*data-dashboard-beta-nav="settings-next"[^>]*data-dashboard-beta-target="settings-next-naver-form"[^>]*disabled/);
    assert.match(betaView, /data-dashboard-beta-channel="wordpress"[^>]*data-dashboard-beta-nav="settings-next"[^>]*data-dashboard-beta-target="settings-next-wordpress-form"[^>]*disabled/);
    assert.match(betaView, /class="dashboard-beta-channel-name">네이버 블로그/);
    assert.match(betaView, /class="dashboard-beta-channel-name">WordPress/);
    assert.match(betaView, /data-dashboard-beta-channel="site-hosting"[^>]*data-dashboard-beta-nav="site-hosting"[^>]*disabled/);
    assert.match(betaView, /class="dashboard-beta-channel-name">웹사이트/);
    assert.match(betaScript, /\/api\/v1\/site-hosting\/cloudflare\/status/);
    assert.match(betaScript, /id: 'site-hosting'[\s\S]*?nav: 'site-hosting'/);
    assert.match(betaScript, /channel\.id === 'site-hosting' && state !== 'ready'[\s\S]*?nav: 'settings-next'[\s\S]*?localTab: 'hosting'/);
    assert.doesNotMatch(betaView, /data-dashboard-beta-nav="settings"/);
    assert.match(betaView, /dashboard-beta-channel-icon/);
    assert.match(betaStyle, /button\[data-dashboard-beta-channel="wordpress"\] \.dashboard-beta-channel-icon\s*\{[^}]*transform:\s*scale\(1\.12\)/);
    assert.match(betaStyle, /\.dashboard-beta-channel-status\[data-state="ready"\] \.dashboard-beta-state-dot/);
    assert.match(betaStyle, /\.dashboard-beta-channel-status\[data-state="failed"\] \.dashboard-beta-state-dot/);
    assert.match(betaStyle, /#view-dashboard-beta\s*\{[^}]*--dashboard-beta-status-ready:\s*var\(--ui-status-success\);[^}]*--dashboard-beta-status-attention:\s*var\(--ui-status-warning\);[^}]*--dashboard-beta-status-failed:\s*var\(--ui-status-danger\);/);
    assert.match(betaStyle, /\.dashboard-beta-state-dot\s*\{[^}]*width:\s*14px;[^}]*height:\s*14px;[^}]*border:\s*2px solid var\(--ui-surface\)/);
    assert.match(betaStyle, /background:\s*var\(--dashboard-beta-status-ready\)/);
    assert.match(betaStyle, /background:\s*var\(--dashboard-beta-status-attention\)/);
    assert.match(betaStyle, /button\[data-dashboard-beta-channel\]:focus::after/);
    assert.match(betaStyle, /\.dashboard-beta-readiness-items \[data-dashboard-beta-nav="account"\]/);
    assert.match(betaStyle, /\.dashboard-beta-readiness-items button:disabled/);
    ['warm-editorial'].forEach((theme) => {
      const tokens = read(`ui/styles/styles/${theme}.css`);
      assert.match(tokens, /--ui-channel-naver:\s*#03C75A;/);
      assert.match(tokens, /--ui-channel-wordpress:\s*#21759B;/);
    });
});

test('Dashboard Beta distinguishes processed and public results across today and week', () => {
    const betaView = read('ui/partials/views/dashboard-beta.html');
    const betaScript = read('ui/scripts/features/shell/dashboard-beta.js');

    assert.match(betaView, /data-dashboard-beta-period="today"[^>]*>오늘/);
    assert.match(betaView, /data-dashboard-beta-period="week"[^>]*>이번 주/);
    assert.match(betaView, /data-dashboard-beta-period="month"[^>]*>최근 30일/);
    assert.match(betaView, /id="dashboard-beta-processed-count"/);
    assert.match(betaView, /id="dashboard-beta-published-count"/);
    assert.match(betaView, /id="dashboard-beta-stat-summary-title" class="ui-overview-subheading">요약/);
    assert.match(betaView, /id="dashboard-beta-recent-results-title" class="ui-overview-subheading">발행 내역/);
    assert.match(betaView, /id="dashboard-beta-recent-results-list"/);
    assert.match(betaView, /id="dashboard-beta-trend-bars"/);
    assert.match(betaScript, /Array\.isArray\(items\) \? items\.slice\(0, 5\)/);
    assert.match(betaScript, /period\?\.recent_results/);
    assert.match(betaScript, /period\?\.trend_series/);
    assert.match(betaScript, /period\?\.trend_unit/);
    assert.match(betaScript, /today: '오늘 시간대별 추이'/);
    assert.match(betaScript, /function dashboardBetaTrendAxisLabel/);
    assert.match(betaScript, /index === 0 \|\| index === length - 1 \|\| \(index % 7 === 0 && index < length - 2\)/);
    assert.doesNotMatch(betaScript, /dashboard-beta-recent-results-title/);
    assert.match(betaScript, /navigation_kind === 'result' \? '글 보기' : '블로그 열기'/);
});

test('Dashboard Beta presents flow state once through the shared status badge', () => {
    const betaView = read('ui/partials/views/dashboard-beta.html');
    const betaScript = read('ui/scripts/features/shell/dashboard-beta.js');
    const betaStyle = read('ui/styles/features/dashboard-beta.css');

    assert.match(betaView, /id="dashboard-beta-flow-badge" class="dashboard-beta-flow-badge ui-status-badge"/);
    assert.doesNotMatch(betaView, /dashboard-beta-flow-indicator/);
    assert.doesNotMatch(betaScript, /flowIndicator|dashboard-beta-flow-indicator/);
    assert.doesNotMatch(betaStyle, /dashboard-beta-flow-indicator|dashboard-beta-spin/);
});

test('Dashboard Beta exposes direct paths to queue and automation without legacy controls', () => {
    const betaView = read('ui/partials/views/dashboard-beta.html');
    const betaScript = read('ui/scripts/features/shell/dashboard-beta.js');
    const betaStyle = read('ui/styles/features/dashboard-beta.css');
    const betaResponsiveStyle = read('ui/styles/features/dashboard-beta-responsive.css');

    assert.match(betaView, /data-dashboard-beta-tab="queue">글감 관리/);
    assert.match(betaView, /class="primary"[^>]*data-dashboard-beta-nav="blog-next"[^>]*data-dashboard-beta-tab="queue">글감 관리/);
    assert.match(betaView, /data-dashboard-beta-tab="automation">연속 발행 설정/);
    assert.match(betaView, /id="dashboard-beta-automation-action" class="secondary"/);
    assert.match(betaView, /class="ui-text-action"[^>]*data-dashboard-beta-tab="queue">전체 대기열 보기/);
    assert.match(betaView, /id="dashboard-beta-discovery-refresh" class="secondary compact ui-loading-action"/);
    assert.match(betaView, /class="ui-text-action"[^>]*data-dashboard-beta-nav="help">전체 가이드 보기/);
    assert.equal((betaView.match(/data-dashboard-beta-tab="automation"/g) || []).length, 1);
    assert.match(betaView, /id="dashboard-beta-automation-action"/);
    assert.match(betaView, /<p>실제 공개된 글<\/p>/);
    assert.match(betaScript, /발행 대기 \$\{readyCount\}건이 있습니다/);
    assert.match(betaScript, /automationState === 'on'[\s\S]*'설정 보기'[\s\S]*'설정 확인'/);
    assert.match(betaStyle, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(betaStyle, /\.dashboard-beta-flow-actions\s*\{[^}]*justify-content:\s*flex-end/);
    assert.match(betaResponsiveStyle, /@media \(max-width: 768px\)[\s\S]*\.dashboard-beta-flow-actions\s*\{[^}]*justify-content:\s*flex-start/);
    assert.doesNotMatch(betaView, /쇼핑 자동발행|최신 콘텐츠|뜻밖의 발견|최근 활동 이력/);
});

test('Dashboard strengthens its visual hierarchy and the native File menu opens quick create', () => {
    const betaView = read('ui/partials/views/dashboard-beta.html');
    const betaStyle = read('ui/styles/features/dashboard-beta.css');
    const navigation = read('ui/scripts/foundation/navigation.js');
    const electronMain = read('src/gui/electron-main.js');

    assert.match(betaView, /class="view-title-block dashboard-beta-hero"/);
    assert.doesNotMatch(betaView, /dashboard-beta-quick-create|data-dashboard-beta-action="quick-create"/);
    assert.match(navigation, /async function navigateToBlogQuickCreate\(options = \{\}\)[\s\S]*applyBlogNextWritingIntent\(\{\s*values: options\.values \|\| \{\}[\s\S]*prepareDestination:[\s\S]*navigateTo\('blog-next', 'quick'\)[\s\S]*focusAfterFrame: true/);
    assert.match(navigation, /prepareDestination: async \(\) => \{\s*await navigateTo\('blog-next', 'quick'\);\s*const quickTabActive = document\.querySelector\('\[data-blog-next-tab="quick"\]'\)\?\.getAttribute\('aria-selected'\) === 'true';\s*return Boolean\([\s\S]*?&& quickTabActive\s*\);/);
    assert.match(navigation, /현재 원고를 닫고 다음 글을 작성할까요\?[\s\S]*작성 중인 내용과 원고 미리보기를 지우고 새 글을 작성할까요/);
    assert.match(navigation, /function hasOpenBlockingDialog\(\)[\s\S]*dialog\[open\][\s\S]*\[role="dialog"\]\[aria-modal="true"\]/);
    assert.match(navigation, /async function navigateToBlogQuickCreate\(options = \{\}\)\s*\{\s*if \(hasOpenBlockingDialog\(\)\) return false;/);
    assert.match(electronMain, /function openBlogQuickCreate\(\)[\s\S]*navigateToBlogQuickCreate/);
    assert.match(electronMain, /label: '새 글 작성', accelerator: 'CmdOrCtrl\+N', click: openBlogQuickCreate/);
    assert.doesNotMatch(betaStyle, /\.dashboard-beta-hero\s*\{[\s\S]*?radial-gradient/);
    assert.match(betaStyle, /\.dashboard-beta-hero\s*\{[^}]*overflow:\s*visible/);
    assert.doesNotMatch(betaStyle, /\.dashboard-beta-stat-card:nth-child\(2\)/);
});

test('Dashboard Beta restores the shared new discovery center without blocking operations', () => {
    const betaView = read('ui/partials/views/dashboard-beta.html');
    const betaScript = read('ui/scripts/features/shell/dashboard-beta.js');
    const centerScript = read('ui/scripts/features/recommendations/center.js');

    assert.match(betaView, /id="dashboard-beta-discovery"[^>]*data-recommendation-center/);
    assert.match(betaView, /dashboard-beta-eyebrow ui-overview-eyebrow">글감<\/span>\s*<div class="recommendation-center-title-row">\s*<h2 id="dashboard-beta-discovery-title">새로운 발견/);
    assert.match(betaView, /id="dashboard-beta-discovery-title">새로운 발견/);
    assert.match(betaView, /id="dashboard-beta-discovery-list"[^>]*data-recommendation-list/);
    assert.match(betaView, /data-idle-label="새 소재 찾기"/);
    assert.match(betaView, /class="recommendation-center-count ui-count-badge"/);
    assert.match(betaScript, /void loadRecommendationCenterForDashboard\(\)/);
    assert.match(centerScript, /function activeRecommendationCenterMount\(\)/);
    assert.match(centerScript, /'dashboard\.recommendations': \['dashboard-beta', ''\]/);
    assert.match(centerScript, /await navigateTo\('dashboard-beta'\)/);
    assert.match(centerScript, /'blog\.quick': \['blog-next', 'quick'\]/);
    assert.match(centerScript, /navigateToBlogQuickCreate\(\{\s*values: query \? \{ 'blog-next-subject': query \} : \{\}/);
    assert.doesNotMatch(centerScript, /surface === 'blog\.quick'[\s\S]{0,500}getElementById\('blog-next-subject'\)/);
});

test('Blog Beta is the productized Blog destination on desktop and mobile', () => {
    const index = read('ui/index.html');
    const navigation = read('ui/scripts/foundation/navigation.js');

    assert.match(index, /data-view="blog-next"[\s\S]*?<span class="nav-label">블로그<\/span>/);
    assert.match(navigation, /viewName = 'blog-next';[\s\S]*subTab = 'quick';/);
    assert.match(navigation, /void navigateTo\('blog-next', 'quick'\)/);
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
