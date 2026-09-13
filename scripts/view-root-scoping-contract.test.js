const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function collectCssFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectCssFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.css')) {
      files.push(full);
    }
  }
  return files;
}

test('bare view-root classes never set display (active-scoped ids own it)', () => {
  const viewRootClasses = [
    'account-view',
    'blog-next-view',
    'card-news-view',
    'help-view',
    'settings-next-view',
    'shopping-view',
    'social-view'
  ];
  const cssFiles = collectCssFiles(path.join(root, 'ui', 'styles'));
  const violations = [];
  for (const file of cssFiles) {
    const css = fs.readFileSync(file, 'utf8');
    for (const cls of viewRootClasses) {
      const rule = new RegExp(`\\.${cls}\\s*\\{[^}]*display\\s*:`, 'g');
      if (rule.test(css)) violations.push(`${path.relative(root, file)}:.${cls}`);
    }
  }
  assert.deepEqual(violations, []);
});

test('migrated views scope their layout to the active state', () => {
  const help = fs.readFileSync(path.join(root, 'ui', 'styles', 'features', 'help.css'), 'utf8');
  const account = fs.readFileSync(path.join(root, 'ui', 'styles', 'features', 'account.css'), 'utf8');

  assert.match(help, /#view-help\.active/);
  assert.match(account, /#view-account\.active/);
});
