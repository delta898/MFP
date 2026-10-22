const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

const viewHeaders = [
  ['ui/partials/views/dashboard.html', 'Dashboard', '글쓰기 흐름과 다음 발행 계획을 한눈에 확인합니다.'],
  ['ui/partials/views/site-hosting.html', '사이트', '웹사이트를 만들고 관리합니다.'],
  ['ui/partials/views/blog-next.html', '블로그', '글감을 모아두고, 준비된 글을 하나씩 차례로 포스팅하세요.'],
  ['ui/partials/views/shopping.html', '쇼핑커넥트', '쇼핑 상품 정보를 분석해 콘텐츠를 만들고 발행합니다.'],
  ['ui/partials/views/social.html', 'SNS', '한 번 작성한 게시물을 여러 소셜 채널에 한 번에 전하세요.'],
  ['ui/partials/views/account.html', '내 정보', '사용 중인 플랜, 이용 현황과 서비스 연결 상태를 확인합니다.'],
  ['ui/partials/views/settings-next.html', '설정', '콘텐츠 작업에 필요한 설정을 한곳에서 간편하게 관리하세요.'],
  ['ui/partials/views/help.html', '도움말', '처음 설정하는 방법부터 글쓰기와 자동화 활용법까지 한곳에서 찾아보세요.']
];

test('site hosting view provides project workspace and accessible create dialog shells', () => {
  const html = read('ui/partials/views/site-hosting.html');
  assert.match(html, /id="site-hosting-content"/);
  assert.match(html, /id="site-project-create-dialog" class="site-project-dialog ui-transaction-dialog"/);
  assert.match(html, /id="site-project-create-form"/);
  assert.match(html, /id="site-create-dialog" class="[^"]*site-create-dialog[^"]*ui-transaction-dialog/);
  assert.match(html, /id="site-create-form"/);
  assert.match(html, /id="site-template-id" name="template_id" type="hidden" required/);
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
