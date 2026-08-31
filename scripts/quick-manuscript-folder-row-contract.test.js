const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

test('quick manuscript folder selection uses one compact labeled row', () => {
  const html = read('ui/partials/views/blog/quick.html');
  const row = html.match(/<div class="quick-manuscript-folder-row">([\s\S]*?)<\/div>\s*<input id="quick-manuscript-folder-input"/);

  assert.ok(row, 'quick manuscript folder row must exist');
  assert.match(html, /<label class="blog-quick-label" for="quick-manuscript-path">선택한 원고 폴더<\/label>/);
  assert.match(row[1], /id="quick-manuscript-path"[^>]*placeholder="아직 폴더를 선택하지 않았습니다"[^>]*readonly/);
  assert.match(row[1], /id="quick-manuscript-clear-btn"[^>]*aria-label="선택 지우기"[^>]*hidden>×<\/button>/);
  assert.match(row[1], /id="quick-manuscript-select-btn"[^>]*>원고 폴더 선택<\/button>/);
  assert.ok(row[1].indexOf('quick-manuscript-path') < row[1].indexOf('quick-manuscript-select-btn'));
});

test('quick manuscript clear action follows folder selection state', () => {
  const script = read('ui/scripts/features/legacy-actions-controllers.js');

  assert.match(script, /if \(config\.hideClearWhenEmpty && clearBtn\) clearBtn\.hidden = true;/);
  assert.match(script, /if \(config\.hideClearWhenEmpty && clearBtn\) clearBtn\.hidden = false;/);
  assert.match(script, /scheduleStorageKey: 'quick_manuscript_schedule_date',[\s\S]*?hideClearWhenEmpty: true,/);
});

test('quick manuscript folder row has desktop and mobile layout rules', () => {
  const publishingCss = read('ui/styles/features/publishing.css');
  const responsiveCss = read('ui/styles/layout/responsive.css');

  assert.match(publishingCss, /\.quick-manuscript-folder-row\s*{[\s\S]*?display: flex;/);
  assert.match(publishingCss, /\.quick-manuscript-folder-path\s*{[\s\S]*?position: relative;/);
  assert.match(publishingCss, /\.quick-manuscript-folder-clear\s*{[\s\S]*?position: absolute;/);
  assert.match(responsiveCss, /body\.mobile-quick-mode \.quick-manuscript-folder-row\s*{[\s\S]*?grid-template-columns: 1fr;/);
});

test('Blog Beta manuscript folder selection uses the same compact interaction', () => {
  const html = read('ui/partials/views/blog-next.html');
  const script = read('ui/scripts/features/blog-next/draft-inputs.js');
  const css = read('ui/styles/features/continuous-publishing-interactions.css');
  const row = html.match(/<div class="blog-next-folder-row">([\s\S]*?)<\/div>\s*<input id="blog-next-folder-input"/);

  assert.ok(row, 'Blog Beta manuscript folder row must exist');
  assert.match(html, /<label for="blog-next-folder-path">선택한 원고 폴더<\/label>/);
  assert.match(row[1], /id="blog-next-folder-path"[^>]*placeholder="아직 폴더를 선택하지 않았습니다"[^>]*readonly/);
  assert.match(row[1], /id="blog-next-folder-clear"[^>]*aria-label="선택 지우기"[^>]*hidden>×<\/button>/);
  assert.match(row[1], /id="blog-next-folder-select"[^>]*>원고 폴더 선택<\/button>/);
  assert.match(script, /if \(clear\) clear\.hidden = true;/);
  assert.match(script, /if \(clear\) clear\.hidden = files\.length === 0;/);
  assert.match(css, /\.blog-next-folder-row\s*{[\s\S]*?display: flex;/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.blog-next-folder-row\s*{[\s\S]*?grid-template-columns: 1fr;/);
});
