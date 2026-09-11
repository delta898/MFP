const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('shopping topic management follows the Blog Beta panel anatomy', () => {
  const html = read('ui/partials/views/shopping.html');
  const panel = html.slice(html.indexOf('id="shopping-tab-batch"'), html.indexOf('</section>', html.indexOf('id="shopping-tab-batch"')));

  assert.match(panel, /blog-next-panel-lead blog-next-panel-intro shopping-management-intro/);
  assert.match(html, /shopping-tab-panel blog-next-panel shopping-management-panel/);
  assert.match(panel, /blog-next-panel-local-nav/);
  assert.match(panel, /blog-next-management-actions/);
  assert.match(panel, /준비한 글을 한곳에서 관리/);
  assert.match(panel, /data-shopping-management-tab="ready">발행 대기열/);
  assert.match(panel, /data-shopping-management-tab="saved">보관한 글감/);
  assert.doesNotMatch(panel, /연속 발행 설정/);
});

test('shopping management replaces the legacy table with two queue lists', () => {
  const html = read('ui/partials/views/shopping.html');
  [
    'shopping-refresh-btn',
    'shopping-management-tab-ready',
    'shopping-management-tab-saved',
    'shopping-management-ready-count',
    'shopping-management-saved-count',
    'shopping-management-ready-list',
    'shopping-management-saved-list',
    'shopping-management-status'
  ].forEach((id) => {
    assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `${id} must remain unique`);
  });
  assert.doesNotMatch(html, /id="shopping-table"/);
  assert.doesNotMatch(html, /id="shopping-status-filter"/);
  assert.doesNotMatch(html, /id="shopping-q-filter"/);
  assert.doesNotMatch(read('ui/scripts/features/content/shopping-items.js'), /shopping-batch-(?:target|headless|result)/);
});

test('shopping management removes local inline layout and uses semantic tokens', () => {
  const html = read('ui/partials/views/shopping.html');
  const panelStart = html.indexOf('id="shopping-tab-batch"');
  const panel = html.slice(panelStart, html.indexOf('</section>', panelStart));
  const css = read('ui/styles/features/shopping-connect.css');

  assert.doesNotMatch(panel, /style=/);
  assert.match(css, /\.shopping-management-panel/);
  assert.doesNotMatch(css, /\.shopping-management[^\{]*\{[^\}]*#[0-9a-f]{3,8}/i);
});

test('shopping management uses item actions matching the Blog Beta lifecycle', () => {
  const source = read('ui/scripts/features/content/shopping-items.js');
  assert.match(source, /createShoppingManagementItem/);
  assert.match(source, /대기열로 이동/);
  assert.match(source, /보관으로 이동/);
  assert.match(source, /지금 포스팅/);
  assert.match(source, /발행 대상 없음/);
  assert.match(source, /발행 대상 선택/);
  assert.match(source, /발행 대기열로 옮기려면 포스팅 대상을 하나 이상 선택/);
  assert.match(source, /\/api\/v1\/continuous-publishing\/shopping\/runner\/start/);
  assert.doesNotMatch(source.slice(source.indexOf('async function runShoppingManagementItem'), source.indexOf('function createShoppingManagementItem')),
    /runShoppingBatchAction|shopping-quick-target-(?:naver|wordpress)|checkPublishPrerequisites/);
  assert.match(source, /data-shopping-management-tab/);
  assert.match(source, /readyItems\.length}\uAC74/);
  assert.match(source, /savedItems\.length}\uAC74/);
  assert.doesNotMatch(source, /startShoppingInlineEdit|shoppingInlineEditState/);
  assert.doesNotMatch(read('ui/scripts/features/content/trend-table.js'), /renderShoppingPagination|updateShoppingSelectionUi|shopping-row-selector/);
});

test('shopping editor saves the posting targets used by the management queue', () => {
  const overlays = read('ui/partials/overlays.html');
  const editor = read('ui/scripts/features/content/blog-topics.js');

  assert.match(overlays, /id="shopping-edit-target-naver"/);
  assert.match(overlays, /id="shopping-edit-target-wordpress"/);
  assert.match(editor, /const targets = \[/);
  assert.match(editor, /status === '발행 준비 완료' && targets\.length === 0/);
  assert.match(editor, /product, shortUrl, instruction, category, postStatus, status, targets/);
});
