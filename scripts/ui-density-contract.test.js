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

test('Discovery consumes density roles while preserving result geometry', () => {
  const center = read('ui/styles/features/recommendation-center.css');
  const recommendations = read('ui/styles/features/recommendations.css');
  const modal = read('ui/styles/features/discovery-modal.css');
  const combined = `${center}\n${recommendations}\n${modal}`;

  [
    '--ui-density-section-padding',
    '--ui-density-field-gap',
    '--ui-density-control-min-height',
    '--ui-density-compact-control-min-height',
    '--ui-density-control-padding-inline',
    '--ui-density-control-radius'
  ].forEach((token) => assert.match(combined, new RegExp(`var\\(${token.replaceAll('-', '\\-')}\\)`), token));
  assert.match(center, /\.recommendation-center-list\s*\{[^}]*repeat\(3, minmax\(0, 1fr\)\)[^}]*gap:\s*var\(--ui-density-field-gap\)/s);
  assert.match(recommendations, /\.quick-topic-recommendation-row\s*\{[^}]*minmax\(160px, 1fr\)/s);
  assert.match(modal, /\.quick-discovery-modal-container\s*\{[^}]*width:\s*min\(1040px, calc\(100vw - 32px\)\)/s);
  assert.match(modal, /\.keyword-metrics-table\s*\{[^}]*width:\s*100%/s);
});

test('Blog Beta consumes every density role while preserving workflow geometry', () => {
  const files = [
    'ui/styles/features/blog-next-baseline.css',
    'ui/styles/features/blog-next-panel-anatomy.css',
    'ui/styles/features/blog-next-quick-flow.css',
    'ui/styles/features/blog-next-smart-comment.css',
    'ui/styles/features/continuous-publishing.css',
    'ui/styles/features/continuous-publishing-interactions.css',
    'ui/styles/features/continuous-publishing-usability.css'
  ];
  const combined = files.map(read).join('\n');

  densityTokens.forEach((token) => assert.match(combined, new RegExp(`var\\(${token.replaceAll('-', '\\-')}\\)`), token));
  assert.match(combined, /\.blog-next-markdown-input\s*\{[^}]*min-height:\s*280px/s);
  assert.match(combined, /\.blog-next-queue-item:not\(\.blog-next-saved-item\) \.blog-next-queue-actions\s*\{[^}]*grid-template-columns:\s*36px 36px 112px 120px/s);
  assert.match(combined, /\.blog-next-manuscript-preview \.local-markdown-body-preview figure img\s*\{[^}]*max-width:\s*min\(100%, 720px\)[^}]*max-height:\s*min\(42vh, 460px\)/s);
});
