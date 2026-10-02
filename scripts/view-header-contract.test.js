const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

const viewHeaders = [
  ['ui/partials/views/dashboard-beta.html', 'Dashboard', '글쓰기 흐름과 다음 발행 계획을 한눈에 확인합니다.'],
  ['ui/partials/views/site-hosting.html', '사이트', '프로젝트와 사이트를 관리합니다.'],
  ['ui/partials/views/blog-next.html', '블로그', '글감을 빠르게 쌓아두고, 준비된 글을 한 건씩 이어서 발행하는 새로운 흐름입니다.'],
  ['ui/partials/views/shopping.html', '쇼핑커넥트', '쇼핑 상품 정보를 분석해 콘텐츠를 만들고 발행합니다.'],
  ['ui/partials/views/social.html', 'SNS', '짧은 생각과 기록을 설정된 Buffer 채널에 바로 발행합니다.'],
  ['ui/partials/views/account.html', '내 정보', '사용 중인 플랜, 이용 현황과 서비스 연결 상태를 확인합니다.'],
  ['ui/partials/views/settings-next.html', '설정', '공통 연결과 기본값을 한곳에서 관리하고, 각 기능에서 필요한 설정을 선택해 사용합니다.'],
  ['ui/partials/views/logs.html', '로그 및 이력', '최근 활동 이력과 시스템 로그를 확인합니다.'],
  ['ui/partials/views/help.html', '도움말', '처음 설정하는 방법부터 글쓰기와 자동화 활용법까지 한곳에서 찾아보세요.']
];

test('site hosting view provides project workspace and accessible create dialog shells', () => {
  const html = read('ui/partials/views/site-hosting.html');
  assert.match(html, /id="site-hosting-content"/);
  assert.match(html, /id="site-project-create-dialog" class="site-project-dialog ui-transaction-dialog"/);
  assert.match(html, /id="site-project-create-form"/);
  assert.match(html, /id="site-create-dialog" class="site-project-dialog ui-transaction-dialog"/);
  assert.match(html, /id="site-create-form"/);
  assert.match(html, /id="site-template-id" name="template_id" required/);
  assert.match(html, /id="site-name" name="name" type="text" maxlength="80" required/);
  assert.match(html, /프로젝트 이름/);
  assert.match(html, /목록에서 구분할 이름입니다\. 한글도 사용할 수 있습니다\./);
  assert.match(html, /id="site-project-name"[^>]*placeholder="예: 개인 블로그, 회사 홈페이지"/);
});

test('every top-level view uses the shared title and description structure', () => {
  viewHeaders.forEach(([file, title, description]) => {
    const html = read(file);
    assert.match(html, /class="view-title-block[^"]*"/);
    assert.match(html, /class="view-title-row[^"]*"/);
    assert.match(html, /class="view-title-copy"/);
    assert.match(html, /class="view-title-heading"/);
    assert.match(html, new RegExp(`<h1>${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</h1>`));
    assert.equal(html.includes(`<p>${description}</p>`), true, `${file} must expose its view description`);
  });
});

test('productized views do not retain beta title badges', () => {
  viewHeaders.forEach(([file]) => {
    const html = read(file);
    assert.doesNotMatch(html, /view-title-heading[\s\S]{0,300}\bbadge\b/);
  });
});

test.skip('legacy Dashboard status controls remain outside title copy', () => {
  const dashboard = read('ui/partials/views/dashboard.html');
  const account = read('ui/partials/views/account.html');
  const clock = read('ui/scripts/features/shell/clock.js');

  assert.match(dashboard, /class="page-clock-widget dash-clock-widget">\s*<div class="server-control" id="server-control" hidden>/);
  assert.match(dashboard, /<div class="dashboard-status-row">\s*<div class="dashboard-readiness-bar"/);
  assert.doesNotMatch(dashboard, /<div class="dashboard-status-row">[\s\S]*id="server-control"/);
  assert.match(clock, /display\.closest\('\.dash-clock-widget'\)\?\.querySelector\('#server-control'\)/);
  assert.match(clock, /menu\.appendChild\(serverControl\);\s*serverControl\.hidden = false;/);
  assert.doesNotMatch(account, /id="account-refresh-btn"/);
});

test.skip('legacy Dashboard readiness prioritizes publishing channels and usable quota', () => {
  const dashboard = read('ui/partials/views/dashboard.html');
  const dashboardScript = read('ui/scripts/features/shell/dashboard.js');

  assert.match(dashboard, /id="dashboard-naver-status"/);
  assert.match(dashboard, /id="dashboard-wordpress-status"/);
  assert.match(dashboard, /id="dashboard-usage-status"/);
  assert.match(dashboard, /id="dashboard-google-status"[^>]*hidden/);
  assert.match(dashboard, /id="dashboard-health-status"[^>]*hidden/);
  assert.doesNotMatch(dashboard, /id="badge-(?:health|session|license|version)"/);
  assert.doesNotMatch(dashboard, /Health:|Plan:|버전 확인 중/);
  assert.match(dashboardScript, /WordPress 연결 확인됨/);
  assert.match(dashboardScript, /WordPress 확인 필요/);
  assert.match(dashboardScript, /WordPress 연결 실패/);
  assert.match(dashboardScript, /if \(force\) dashboardForceRefreshPending = true/);
  assert.match(dashboardScript, /queueMicrotask\(\(\) => void loadDashboard\(\{ force: true \}\)\)/);
  assert.match(dashboardScript, /WordPress 미사용/);
  assert.match(dashboardScript, /기본 \$\{Math\.max\(0, remaining\)\}회 남음/);
  assert.match(dashboardScript, /navigateTo\(view, tab\)/);
  assert.match(dashboardScript, /function bindDashboardReadinessNavigation\(\)/);
  assert.match(dashboardScript, /bind\('dashboard-naver-status', 'settings-next', 'core', 'publishing', 'settings-next-naver-form'\)/);
  assert.match(dashboardScript, /bind\('dashboard-wordpress-status', 'settings-next', 'core', 'publishing', 'settings-next-wordpress-form'\)/);
  assert.match(dashboardScript, /navigateToSettingsNextTarget\(tab, targetId, localTab\)/);
});
