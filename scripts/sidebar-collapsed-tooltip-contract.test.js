const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('collapsed desktop sidebar renders menu-name tooltips and preserves accessible names', () => {
  const sidebar = read('ui/scripts/features/shell/sidebar.js');
  const lifecycle = read('ui/scripts/foundation/lifecycle.js');
  const styles = read('ui/styles/layout/shell-navigation.css');

  assert.match(sidebar, /function syncCollapsedSidebarTooltips\(\)/);
  assert.match(sidebar, /function isCollapsedSidebarTooltipEnabled\(\)/);
  assert.match(sidebar, /window\.innerWidth > 960 && document\.getElementById\('sidebar'\)\?\.classList\.contains\('collapsed'\)/);
  assert.match(sidebar, /id = SIDEBAR_TOOLTIP_ID/);
  assert.match(sidebar, /tooltip\.setAttribute\('role', 'tooltip'\)/);
  assert.match(sidebar, /item\.addEventListener\('pointerenter'/);
  assert.match(sidebar, /item\.addEventListener\('focus'/);
  assert.match(sidebar, /item\.setAttribute\('aria-label', label\)/);
  assert.match(sidebar, /item\.removeAttribute\('title'\);/);
  assert.match(styles, /\.sidebar-menu-tooltip\s*\{[\s\S]*?position:\s*fixed;/);
  assert.match(sidebar, /window\.addEventListener\('resize', syncCollapsedSidebarTooltips\)/);
  assert.match(lifecycle, /sidebar\.classList\.add\('collapsed'\);\s*}\s*syncCollapsedSidebarTooltips\(\);/);
  assert.match(lifecycle, /localStorage\.setItem\('sidebar-collapsed', nowCollapsed\);\s*syncCollapsedSidebarTooltips\(\);/);
});

test('dynamic sidebar links share the collapsed tooltip policy instead of retaining a native title', () => {
  const sidebar = read('ui/scripts/features/shell/sidebar.js');

  assert.doesNotMatch(sidebar, /link\.title\s*=/);
  assert.match(sidebar, /sidebarDynamicContentSignature = nextSignature;\s*syncCollapsedSidebarTooltips\(\);/);
});

test('desktop sidebar uses a compact width while preserving collapsed and mobile widths', () => {
  const styles = read('ui/styles/layout/shell-navigation.css');

  assert.match(styles, /\.sidebar\s*\{[\s\S]*?width:\s*224px;/);
  assert.match(styles, /\.sidebar\.collapsed\s*\{[\s\S]*?width:\s*80px;/);
  assert.match(styles, /@media \(max-width:\s*960px\)\s*\{[\s\S]*?\.sidebar\s*\{[\s\S]*?width:\s*280px;/);
});
