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

test('UI root selects warm editorial as the main style while compatibility remains the safe fallback', () => {
  const html = createHtmlCompositionRuntime({ fs, path }).composeHtmlFile({ uiRoot }).html;
  assert.match(html, /<html lang="ko" data-style="warm-editorial">/);
  assert.doesNotMatch(html, /data-theme=/);

  const { root, contract } = loadStyleSystem('warm-editorial');
  assert.equal(contract.defaultId, 'compatibility');
  assert.deepEqual(Object.keys(contract.registry), ['compatibility', 'warm-editorial', 'quiet-sage-studio']);
  assert.equal(contract.registry.compatibility.contractVersion, '1.0');
  assert.equal(contract.registry['warm-editorial'].contractVersion, '1.0');
  assert.equal(contract.registry['quiet-sage-studio'].contractVersion, '1.0');
  assert.equal(contract.registry.compatibility.selectable, false);
  assert.equal(contract.registry['warm-editorial'].selectable, false);
  assert.equal(contract.registry['quiet-sage-studio'].selectable, false);
  assert.equal(root.dataset.style, 'warm-editorial');
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

test('every registered style supplies every required semantic and component token', () => {
  const { contract } = loadStyleSystem('compatibility');
  const styleFiles = {
    compatibility: 'ui/styles/styles/compatibility.css',
    'warm-editorial': 'ui/styles/styles/warm-editorial.css',
    'quiet-sage-studio': 'ui/styles/styles/quiet-sage-studio.css'
  };

  assert.equal(contract.requiredTokens.length, new Set(contract.requiredTokens).size);
  Object.keys(contract.registry).forEach((styleId) => {
    const css = read(styleFiles[styleId]);
    const definitions = new Set(
      Array.from(css.matchAll(/(^|[;{])\s*(--ui-[a-z0-9-]+)\s*:/gm), (match) => match[2])
    );
    assert.equal(
      contract.requiredTokens.filter((token) => !definitions.has(token)).length,
      0,
      styleId
    );
    assert.match(css, new RegExp(`\\[data-style="${styleId}"\\]`));
  });
});

test('non-target views opt into compatibility containment explicitly', () => {
  const html = createHtmlCompositionRuntime({ fs, path }).composeHtmlFile({ uiRoot }).html;
  const viewTags = Array.from(html.matchAll(/<section class="[^"]*\bview\b[^"]*"[^>]*id="(view-[^"]+)"[^>]*>/g));
  assert.equal(viewTags.length > 1, true);
  viewTags.forEach(([tag, viewId]) => {
    if (['view-blog-next', 'view-settings-next', 'view-dashboard-beta'].includes(viewId)) {
      assert.doesNotMatch(tag, /data-style-scope=/);
      return;
    }
    assert.match(tag, /data-style-scope="compatibility"/, viewId);
  });

  const compatibility = read('ui/styles/styles/compatibility.css');
  const aliases = read('ui/styles/tokens/legacy-aliases.css');
  assert.match(compatibility, /\[data-style-scope="compatibility"\]/);
  assert.match(aliases, /\[data-style-scope="compatibility"\]/);
  assert.match(html, /id="blog-edit-modal-backdrop"[^>]*data-style-scope="compatibility"/);
  assert.match(html, /id="shopping-edit-modal-backdrop"[^>]*data-style-scope="compatibility"/);
});

test('shared action pattern keeps one filled primary and lower-emphasis alternatives', () => {
  const actions = read('ui/styles/patterns/actions.css');
  const blogNext = createHtmlCompositionRuntime({ fs, path }).composeHtmlFile({
    uiRoot,
    entryFile: 'partials/views/blog-next.html'
  }).html;
  const automationSettings = read('ui/styles/features/automation-settings.css');
  const modalBatch = read('ui/styles/components/modals-batch.css');
  const selectionControls = read('ui/styles/patterns/selection-controls.css');
  const actionGroup = blogNext.match(/<div class="blog-next-form-actions">([\s\S]*?)<\/div>/)?.[1] || '';
  const autoManualRule = automationSettings.match(/\.auto-manual-row button\s*\{([^}]*)\}/)?.[1] || '';

  assert.match(actions, /button\.primary\s*\{[^}]*--ui-button-primary-background/s);
  assert.match(actions, /button\.secondary\s*\{[^}]*--ui-button-secondary-background/s);
  assert.match(actions, /button\.ghost\s*\{[^}]*--ui-button-tertiary-background/s);
  assert.equal((actionGroup.match(/class="primary"/g) || []).length, 1);
  assert.equal(actionGroup.indexOf('blog-next-clear-topic') < actionGroup.indexOf('blog-next-save-topic'), true);
  assert.equal(actionGroup.indexOf('blog-next-save-topic') < actionGroup.indexOf('blog-next-enqueue-topic'), true);
  assert.equal(actionGroup.indexOf('blog-next-enqueue-topic') < actionGroup.indexOf('blog-next-publish-now'), true);
  assert.match(blogNext, /id="blog-next-topic-recommend" class="secondary blog-next-ai-assist"/);
  assert.match(blogNext, /id="blog-next-keyword-recommend" class="secondary blog-next-ai-assist"/);
  assert.match(blogNext, /id="blog-next-title-recommend" class="secondary blog-next-ai-assist"/);
  assert.match(blogNext, /id="blog-next-trend-query" class="primary"/);
  assert.match(blogNext, /id="blog-next-trend-refresh" class="[^"]*ui-refresh-action-icon[^"]*"[^>]*aria-label="최신 데이터 새로고침"[^>]*title="최신 데이터 새로고침"/);
  assert.match(blogNext, /class="[^"]*ui-refresh-action-text[^"]*"[\s\S]*?id="blog-next-queue-refresh"[^>]*>새로고침<\/button>/);
  assert.match(actions, /\.ui-refresh-action-icon\s*\{[^}]*--ui-border-default[^}]*--ui-surface[^}]*--ui-text-secondary/s);
  assert.match(actions, /\.ui-refresh-action-icon\.is-loading \[aria-hidden="true"\]\s*\{[^}]*ui-refresh-action-spin/s);
  assert.match(selectionControls, /input\[type="checkbox"\][\s\S]*input\[type="radio"\][\s\S]*accent-color:\s*var\(--ui-action-primary\);/);
  assert.match(blogNext, /id="blog-next-automation-test"[\s\S]*id="blog-next-automation-save"/);
  assert.doesNotMatch(autoManualRule, /(?:^|;)\s*(?:border|background|color)\s*:/);
  assert.match(automationSettings, /\[data-style-scope="compatibility"\] \.auto-manual-row button\s*\{[^}]*background:\s*#475569;/s);
  assert.doesNotMatch(modalBatch, /\n\.modal-footer button\.(?:primary|secondary)(?::hover)?\s*\{/);
  assert.match(modalBatch, /\[data-style-scope="compatibility"\] \.modal-footer button\.secondary\s*\{/);
  const overlays = read('ui/partials/overlays.html');
  assert.match(overlays, /id="ui-dialog-cancel" class="secondary hidden"/);
  assert.match(overlays, /id="ui-dialog-confirm" class="primary"/);
});

test('overview cards share style-driven surfaces, headings, status badges, and refresh actions', () => {
  const overview = read('ui/styles/patterns/overview-card.css');
  const actions = read('ui/styles/patterns/actions.css');
  const dashboard = read('ui/partials/views/dashboard-beta.html');
  const dashboardStyle = read('ui/styles/features/dashboard-beta.css');
  const dashboardResponsiveStyle = read('ui/styles/features/dashboard-beta-responsive.css');
  const recommendationCenterStyle = read('ui/styles/features/recommendation-center.css');

  assert.match(overview, /\.ui-overview-card\s*\{[^}]*var\(--ui-card-border\)[^}]*var\(--ui-card-radius\)[^}]*var\(--ui-card-background\)[^}]*var\(--ui-card-shadow\)/s);
  assert.match(overview, /\.ui-overview-heading h2\s*\{[^}]*var\(--ui-type-heading-size\)[^}]*var\(--ui-weight-semibold\)/s);
  assert.match(overview, /\.ui-overview-subheading\s*\{[^}]*var\(--ui-space-3\)[^}]*var\(--ui-type-body-size\)[^}]*var\(--ui-weight-semibold\)/s);
  assert.match(overview, /\.ui-status-badge\s*\{[^}]*var\(--ui-surface-muted\)[^}]*var\(--ui-type-caption-size\)/s);
  assert.match(overview, /\.ui-count-badge\s*\{[^}]*var\(--ui-surface-muted\)[^}]*var\(--ui-text-secondary\)/s);
  assert.match(actions, /\.ui-refresh-action-icon svg\s*\{[^}]*stroke:\s*currentColor/s);
  assert.match(actions, /\.ui-text-action\s*\{[^}]*background:\s*transparent[^}]*var\(--ui-action-primary\)/s);
  assert.match(dashboard, /class="dashboard-beta-readiness ui-overview-card"/);
  assert.match(dashboard, /class="dashboard-beta-section-heading ui-overview-heading"/);
  assert.match(dashboard, /class="ui-overview-subheading">요약/);
  assert.match(dashboard, /class="ui-overview-subheading">발행 내역/);
  assert.match(dashboard, /class="dashboard-beta-flow-badge ui-status-badge"/);
  assert.match(dashboard, /id="dashboard-beta-refresh" class="ui-refresh-action-icon"/);
  assert.match(dashboard, /id="dashboard-beta-discovery-count" class="recommendation-center-count ui-count-badge"/);
  assert.doesNotMatch(dashboardStyle, /\.dashboard-beta-section-heading\s*\{/);
  assert.doesNotMatch(dashboardStyle, /\.dashboard-beta-recent-results h3\s*\{/);
  assert.doesNotMatch(dashboardStyle, /\.dashboard-beta-icon-button/);
  assert.doesNotMatch(dashboardStyle, /\.dashboard-beta-flow-badge\s*,/);
  assert.doesNotMatch(dashboard, /dashboard-beta-flow-indicator|\sstyle=/);
  [dashboardStyle, dashboardResponsiveStyle, recommendationCenterStyle].forEach((css) => {
    assert.doesNotMatch(css, /font-size:\s*[0-9.]+(?:px|rem)\b/);
    assert.doesNotMatch(css, /font-weight:\s*[0-9]{3}\b/);
  });
});

test('warm editorial avoids the compatibility blue and dark filled secondary palette', () => {
  const css = read('ui/styles/styles/warm-editorial.css');
  assert.match(css, /--ui-action-primary:\s*#b65f42;/);
  assert.match(css, /--ui-button-secondary-background:\s*#fffdf9;/);
  assert.doesNotMatch(css, /#0ea5e9|#0284c7|#475569|#334155/i);
});

test('quiet sage varies palette, density, radius and elevation without style-specific component selectors', () => {
  const css = read('ui/styles/styles/quiet-sage-studio.css');
  const shared = [
    read('ui/styles/patterns/actions.css'),
    read('ui/styles/patterns/selection-controls.css'),
    read('ui/styles/patterns/overview-card.css'),
    read('ui/styles/features/dashboard-beta.css'),
    read('ui/styles/features/recommendation-center.css'),
    read('ui/styles/features/recommendations.css'),
    read('ui/styles/features/continuous-publishing.css'),
    read('ui/styles/features/blog-next-smart-comment.css')
  ].join('\n');

  assert.match(css, /--ui-action-primary:\s*#49675a;/);
  assert.match(css, /--ui-radius-md:\s*8px;/);
  assert.match(css, /--ui-space-4:\s*14px;/);
  assert.match(css, /--ui-card-shadow:\s*none;/);
  assert.doesNotMatch(css, /#0ea5e9|#0284c7|#475569|#334155/i);
  assert.doesNotMatch(shared, /quiet-sage-studio/);
});

test('shared patterns and Blog Beta anchored surfaces consume shared elevation recipes', () => {
  const panel = read('ui/styles/features/blog-next-panel-anatomy.css');
  const tabs = read('ui/styles/patterns/tab-navigation.css');
  const queue = read('ui/styles/features/continuous-publishing-interactions.css');
  const baseline = read('ui/styles/features/blog-next-baseline.css');
  const usability = read('ui/styles/features/continuous-publishing-usability.css');

  assert.match(tabs, /box-shadow:\s*var\(--ui-segmented-active-shadow\)/);
  assert.match(panel, /box-shadow:\s*var\(--ui-segmented-badge-shadow\)/);
  assert.match(queue, /box-shadow:\s*var\(--ui-row-running-shadow\)/);
  assert.match(baseline, /box-shadow:\s*var\(--ui-table-header-divider-shadow\)/);
  assert.match(usability, /box-shadow:\s*var\(--ui-sticky-footer-shadow\)/);
  assert.doesNotMatch([tabs, panel, queue, baseline, usability].join('\n'), /box-shadow:\s*(?:inset\s+)?0\s+(?:-?\d+px|0)\s+/);
});

test('shared feedback and Blog Beta trend surfaces do not retain the compatibility palette', () => {
  const feedback = read('ui/styles/components/feedback.css');
  const blogNext = read('ui/styles/features/continuous-publishing-interactions.css');

  assert.match(feedback, /\.ui-toast\s*\{[^}]*--ui-surface-translucent[^}]*--ui-border-default[^}]*--ui-status-info/s);
  assert.match(feedback, /\.ui-toast\.ui-toast-warn\s*\{[^}]*--ui-status-warning/s);
  assert.match(feedback, /\.ui-dialog-backdrop\s*\{[^}]*--ui-overlay/s);
  assert.doesNotMatch(feedback, /#3b82f6|#f59e0b|#ef4444|#e0f2fe|#075985|#bae6fd/i);
  assert.match(blogNext, /\.blog-next-view \.auto-section[\s\S]*--ui-border-default[\s\S]*--ui-surface-muted/);
  assert.match(blogNext, /\.blog-next-view \.category-option-btn\.active\s*\{[^}]*--ui-action-primary[^}]*--ui-text-inverse/s);
});

test('clock shell follows the product style while seasonal color remains a local accent', () => {
  const clock = read('ui/styles/components/clock.css');

  assert.match(clock, /\.clock-widget-main\s*\{[^}]*border:\s*1px solid var\(--ui-border-default\);[^}]*border-radius:\s*var\(--ui-radius-lg\);[^}]*background:\s*var\(--ui-surface-translucent\);[^}]*box-shadow:\s*var\(--ui-shadow-md\);/s);
  assert.match(clock, /\.clock-season-dot\s*\{[^}]*background:\s*var\(--clock-season\);/s);
  assert.match(clock, /\.clock-ambient-message\s*\{[^}]*color:\s*var\(--clock-season\);/s);
  assert.doesNotMatch(clock.match(/\.clock-widget-main\s*\{([^}]*)\}/)?.[1] || '', /rgba\(|#[0-9a-f]{3,8}|--clock-season-glow/i);
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
    'ui/styles/features/blog-next-smart-comment.css',
    'ui/styles/patterns/tab-navigation.css'
  ];
  const legacyTokenPattern = /var\(--(?:bg-gradient|surface|surface-solid|line|text-main|text-muted|text-light|brand-primary|brand-hover|brand-light|success|warning|danger|shadow-sm|shadow-md|shadow-lg|glass-shadow|radius-sm|radius-md|radius-lg|radius-full|transition|text-secondary|border-color|brand|shadow-soft)\)/;

  migratedFiles.forEach((file) => {
    assert.doesNotMatch(read(file), legacyTokenPattern, file);
  });
});

test('design-system feature styles do not bypass the style contract', () => {
  const featureFiles = [
    'ui/styles/features/continuous-publishing.css',
    'ui/styles/features/continuous-publishing-interactions.css',
    'ui/styles/features/continuous-publishing-usability.css',
    'ui/styles/features/blog-next-baseline.css',
    'ui/styles/features/blog-next-panel-anatomy.css',
    'ui/styles/features/blog-next-quick-flow.css',
    'ui/styles/features/blog-next-smart-comment.css',
    'ui/styles/features/settings-next.css',
    'ui/styles/features/dashboard-beta.css',
    'ui/styles/features/dashboard-beta-responsive.css',
    'ui/styles/features/recommendation-center.css',
    'ui/styles/features/recommendations.css',
    'ui/styles/patterns/actions.css',
    'ui/styles/patterns/overview-card.css',
    'ui/styles/patterns/tab-navigation.css'
  ];

  featureFiles.forEach((file) => {
    const css = read(file);
    assert.doesNotMatch(css, /!important\b/, `${file} must resolve cascade through component boundaries`);
    assert.doesNotMatch(css, /\[data-style(?:=|-)/, `${file} must not branch on a concrete style`);
    assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i, `${file} must consume style tokens instead of fixed colors`);

    const shadowValues = Array.from(css.matchAll(/box-shadow:\s*([^;]+);/g), (match) => match[1].trim());
    shadowValues.forEach((value) => {
      assert.match(
        value,
        /^(?:none|(?:inset\s+)?var\(--ui-[a-z0-9-]+\))$/,
        `${file} owns a raw shadow recipe: ${value}`
      );
    });
  });
});
