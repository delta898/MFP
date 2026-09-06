const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { createCssCompositionRuntime } = require('../src/ui-runtime/css-composition-runtime');
const { createHtmlCompositionRuntime } = require('../src/ui-runtime/html-composition-runtime');

const repoRoot = path.resolve(__dirname, '..');
const uiRoot = path.join(repoRoot, 'ui');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function loadStyleSystem(initialStyle = '') {
  const root = { dataset: { style: initialStyle } };
  const context = vm.createContext({
    document: { documentElement: root },
    console: { warn() {} }
  });
  const source = `${read('ui/scripts/foundation/style-system.js')}\n;globalThis.__styleContract = {\n    defaultId: DESIGN_STYLE_DEFAULT_ID,\n    registry: DESIGN_STYLE_REGISTRY,\n    requiredTokens: DESIGN_STYLE_REQUIRED_TOKENS,\n    resolveDesignStyleId,\n    applyDesignStyle\n  };`;
  vm.runInContext(source, context);
  return { root, contract: context.__styleContract };
}

test('UI root selects the single compatibility style without a separate theme axis', () => {
  const html = createHtmlCompositionRuntime({ fs, path }).composeHtmlFile({ uiRoot }).html;
  assert.match(html, /<html lang="ko" data-style="compatibility">/);
  assert.doesNotMatch(html, /data-theme=/);

  const { root, contract } = loadStyleSystem('compatibility');
  assert.equal(contract.defaultId, 'compatibility');
  assert.deepEqual(Object.keys(contract.registry), ['compatibility']);
  assert.equal(contract.registry.compatibility.selectable, false);
  assert.equal(root.dataset.style, 'compatibility');
});

test('unknown or empty style ids fail safely to compatibility', () => {
  const { root, contract } = loadStyleSystem('future-unknown-style');
  assert.equal(root.dataset.style, 'compatibility');
  assert.equal(contract.resolveDesignStyleId(''), 'compatibility');
  assert.equal(contract.resolveDesignStyleId(' Editorial '), 'compatibility');

  const anotherRoot = { dataset: {} };
  const applied = contract.applyDesignStyle('not-registered', anotherRoot);
  assert.equal(applied.id, 'compatibility');
  assert.equal(anotherRoot.dataset.style, 'compatibility');
});

test('compatibility style supplies every required semantic token', () => {
  const { contract } = loadStyleSystem('compatibility');
  const css = read('ui/styles/styles/compatibility.css');
  const definitions = new Set(
    Array.from(css.matchAll(/(^|[;{])\s*(--ui-[a-z0-9-]+)\s*:/gm), (match) => match[2])
  );

  assert.equal(contract.requiredTokens.length, new Set(contract.requiredTokens).size);
  assert.equal(
    contract.requiredTokens.filter((token) => !definitions.has(token)).length,
    0
  );
  assert.match(css, /^\[data-style="compatibility"\]\s*\{/);
});

test('legacy aliases preserve existing surfaces and repair missing global tokens', () => {
  const aliases = read('ui/styles/tokens/legacy-aliases.css');
  const expectedAliases = [
    '--bg-gradient', '--surface', '--surface-solid', '--line', '--text-main', '--text-muted',
    '--text-light', '--brand-primary', '--brand-hover', '--brand-light', '--success', '--warning',
    '--danger', '--shadow-sm', '--shadow-md', '--shadow-lg', '--glass-shadow', '--radius-sm',
    '--radius-md', '--radius-lg', '--radius-full', '--transition', '--text-primary', '--text-secondary',
    '--border-color', '--brand', '--shadow-soft', '--surface-color', '--secondary-bg', '--bg-card',
    '--bg-surface', '--bg-surface-secondary', '--bg-surface-hover'
  ];

  expectedAliases.forEach((token) => {
    assert.match(aliases, new RegExp(`${token.replace('--', '--')}\\s*:\\s*var\\(--ui-`));
  });
});

test('composed CSS has no fallback-free unresolved custom property references', () => {
  const css = createCssCompositionRuntime({ fs, path }).composeCssFile({ uiRoot }).css;
  const scripts = fs.readdirSync(path.join(uiRoot, 'scripts'), { recursive: true })
    .filter((entry) => String(entry).endsWith('.js'))
    .map((entry) => fs.readFileSync(path.join(uiRoot, 'scripts', entry), 'utf8'))
    .join('\n');
  const definitions = new Set(
    Array.from(`${css}\n${scripts}`.matchAll(/--[a-zA-Z0-9_-]+\s*:/g), (match) => match[0].replace(/\s*:\s*$/, ''))
  );
  for (const match of scripts.matchAll(/setProperty\(\s*['"](--[a-zA-Z0-9_-]+)['"]/g)) {
    definitions.add(match[1]);
  }
  for (const match of css.matchAll(/var\(\s*(--[a-zA-Z0-9_-]+)\s*([,)])/g)) {
    const [, token, terminator] = match;
    if (terminator === ',') continue;
    assert.equal(definitions.has(token), true, `${token} is referenced without a definition or fallback`);
  }
});

test('migrated shell and Blog Beta styles consume semantic tokens instead of legacy globals', () => {
  const migratedFiles = [
    'ui/styles/base/foundation.css',
    'ui/styles/layout/shell-navigation.css',
    'ui/styles/layout/responsive.css',
    'ui/styles/components/app-chrome.css',
    'ui/styles/components/clock.css',
    'ui/styles/components/feedback.css',
    'ui/styles/components/global-publishing-status.css',
    'ui/styles/features/continuous-publishing.css',
    'ui/styles/features/continuous-publishing-interactions.css',
    'ui/styles/features/continuous-publishing-usability.css',
    'ui/styles/features/blog-next-smart-comment.css'
  ];
  const legacyTokenPattern = /var\(--(?:bg-gradient|surface|surface-solid|line|text-main|text-muted|text-light|brand-primary|brand-hover|brand-light|success|warning|danger|shadow-sm|shadow-md|shadow-lg|glass-shadow|radius-sm|radius-md|radius-lg|radius-full|transition|text-secondary|border-color|brand|shadow-soft)\)/;

  migratedFiles.forEach((file) => {
    assert.doesNotMatch(read(file), legacyTokenPattern, file);
  });
});
