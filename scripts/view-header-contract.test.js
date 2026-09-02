const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

const viewHeaders = [
  ['ui/partials/views/dashboard.html', 'Dashboard', '서비스 상태와 추천, 자동화 현황을 한눈에 확인합니다.'],
  ['ui/partials/views/blog.html', '블로그', '블로그 글을 작성하고 발행하며 자동화 흐름을 관리합니다.'],
  ['ui/partials/views/blog-next.html', '블로그 Beta', '글감을 빠르게 쌓아두고, 준비된 글을 한 건씩 이어서 발행하는 새로운 흐름입니다.'],
  ['ui/partials/views/shopping.html', '쇼핑커넥트', '쇼핑 상품 정보를 분석해 콘텐츠를 만들고 발행합니다.'],
  ['ui/partials/views/social.html', 'SNS', '짧은 생각과 기록을 설정된 Buffer 채널에 바로 발행합니다.'],
  ['ui/partials/views/account.html', '계정 및 구독', '이 기기의 라이선스, 사용량과 서비스 연결 상태를 확인합니다.'],
  ['ui/partials/views/settings.html', '설정', '서비스 연결, AI 모델, 글쓰기와 알림 설정을 관리합니다.'],
  ['ui/partials/views/logs.html', '로그 및 이력', '최근 활동 이력과 시스템 로그를 확인합니다.']
];

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

test('only Blog Beta keeps a title badge', () => {
  viewHeaders.forEach(([file]) => {
    const html = read(file);
    if (file.endsWith('blog-next.html')) assert.match(html, /class="blog-next-beta-badge"/);
    else assert.doesNotMatch(html, /view-title-heading[\s\S]{0,300}\bbadge\b/);
  });
});

test('status and refresh controls remain outside title copy while app controls stay inside the clock menu', () => {
  const dashboard = read('ui/partials/views/dashboard.html');
  const account = read('ui/partials/views/account.html');
  const clock = read('ui/scripts/features/shell/clock.js');

  assert.match(dashboard, /class="page-clock-widget dash-clock-widget">\s*<div class="server-control" id="server-control" hidden>/);
  assert.match(dashboard, /<div class="dashboard-status-row">\s*<div class="dashboard-readiness-bar"/);
  assert.doesNotMatch(dashboard, /<div class="dashboard-status-row">[\s\S]*id="server-control"/);
  assert.match(clock, /display\.closest\('\.dash-clock-widget'\)\?\.querySelector\('#server-control'\)/);
  assert.match(clock, /menu\.appendChild\(serverControl\);\s*serverControl\.hidden = false;/);
  assert.match(account, /<\/div>\s*<div class="account-view-actions">\s*<button id="account-refresh-btn"/);
});

test('dashboard readiness prioritizes publishing channels and usable quota over healthy and duplicate version badges', () => {
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
});
