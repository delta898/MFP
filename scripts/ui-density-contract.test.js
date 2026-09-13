const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

const densityTokens = [
  '--ui-density-page-gap',
  '--ui-density-section-padding',
  '--ui-density-action-padding',
  '--ui-density-field-gap',
  '--ui-density-control-min-height',
  '--ui-density-compact-control-min-height',
  '--ui-density-control-padding-inline',
  '--ui-density-control-radius'
];

test('every design style implements the role-based density contract', () => {
  const context = vm.createContext({ document: { documentElement: { dataset: {} } }, console: { warn() {} } });
  vm.runInContext(`${read('ui/scripts/foundation/style-system.js')}\n;globalThis.requiredTokens = DESIGN_STYLE_REQUIRED_TOKENS;`, context);

  densityTokens.forEach((token) => assert.equal(context.requiredTokens.includes(token), true, token));
  [
    'ui/styles/styles/compatibility.css',
    'ui/styles/styles/warm-editorial.css',
    'ui/styles/styles/quiet-sage-studio.css'
  ].forEach((stylePath) => {
    const css = read(stylePath);
    densityTokens.forEach((token) => assert.match(css, new RegExp(`${token.replaceAll('-', '\\-')}\\s*:`), `${stylePath}: ${token}`));
  });
});

test('SNS consumes density roles without changing its content or interaction geometry', () => {
  const social = read('ui/styles/features/social.css');
  const surfaces = read('ui/styles/features/social-surfaces.css');
  const combined = `${social}\n${surfaces}`;

  densityTokens.forEach((token) => assert.match(combined, new RegExp(`var\\(${token.replaceAll('-', '\\-')}\\)`), token));
  assert.match(social, /\.social-editor\s*\{[^}]*block-size:\s*168px[^}]*min-block-size:\s*168px/s);
  assert.match(social, /\.social-channel-grid\s*\{[^}]*repeat\(3, minmax\(0, 1fr\)\)/s);
  assert.match(surfaces, /\.social-view \.social-workspace-select\s*\{\s*margin:\s*0 0 var\(--ui-space-4\);\s*\}/);
});
