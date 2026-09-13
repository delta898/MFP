const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createCssCompositionRuntime } = require('../src/ui-runtime/css-composition-runtime');
const { CONTRACTS, getDesignSystemStylePaths } = require('./design-system-targets');

const repoRoot = path.resolve(__dirname, '..');
const uiRoot = path.join(repoRoot, 'ui');
const manifestPath = path.join(uiRoot, 'styles.css');
const CASCADE_LAYER_ORDER = Object.freeze([
    'reset',
    'tokens',
    'base',
    'components',
    'features',
    'utilities',
    'overrides',
    'legacy'
]);

function collectCssFiles(rootDir) {
    return fs.readdirSync(rootDir, { withFileTypes: true }).flatMap((entry) => {
        const entryPath = path.join(rootDir, entry.name);
        if (entry.isDirectory()) return collectCssFiles(entryPath);
        return entry.isFile() && entry.name.endsWith('.css') ? [entryPath] : [];
    });
}

test('CSS manifest preserves the explicit base, layout, component, and feature cascade order', () => {
    const manifest = fs.readFileSync(manifestPath, 'utf8');
    const includePaths = Array.from(
        manifest.matchAll(/\/\*\s*@include\s+([^\s]+)\s*\*\//g),
        (match) => match[1]
    );

    assert.equal(manifest.split('\n').length - 1 <= 120, true);
    assert.deepEqual(includePaths, [
        'styles/styles/compatibility.css',
        'styles/styles/warm-editorial.css',
        'styles/styles/quiet-sage-studio.css',
        'styles/tokens/legacy-aliases.css',
        'styles/base/foundation.css',
        'styles/layout/shell-navigation.css',
        'styles/components/app-chrome.css',
        'styles/patterns/actions.css',
        'styles/patterns/selection-controls.css',
        'styles/patterns/select-shell.css',
        'styles/patterns/tab-navigation.css',
        'styles/patterns/overview-card.css',
        'styles/patterns/settings-card.css',
        'styles/patterns/transaction-dialog.css',
        'styles/components/clock.css',
        'styles/components/clock-pomodoro-controls.css',
        'styles/components/clock-pomodoro-faces.css',
        'styles/components/clock-celebration.css',
        'styles/components/clock-status.css',
        'styles/components/global-publishing-status.css',
        'styles/components/modals-batch.css',
        'styles/components/feedback.css',
        'styles/components/form-widgets.css',
        'styles/features/account.css',
        'styles/features/social.css',
        'styles/features/social-media.css',
        'styles/features/social-actions.css',
        'styles/features/social-density.css',
        'styles/features/social-surfaces.css',
        'styles/features/publishing.css',
        'styles/features/publishing-comment-drafts.css',
        'styles/features/publishing-manuscript.css',
        'styles/features/publishing-support.css',
        'styles/features/automation-settings.css',
        'styles/features/automation-settings-preview.css',
        'styles/features/automation-settings-categories.css',
        'styles/features/automation-settings-help.css',
        'styles/features/automation-settings-images.css',
        'styles/features/dashboard.css',
        'styles/features/dashboard-beta.css',
        'styles/features/dashboard-beta-responsive.css',
        'styles/features/help.css',
        'styles/features/dashboard-feeds.css',
        'styles/features/content-tabs.css',
        'styles/features/shopping-connect.css',
        'styles/features/shopping-image-settings.css',
        'styles/features/continuous-publishing.css',
        'styles/features/continuous-publishing-queue.css',
        'styles/features/continuous-publishing-automation.css',
        'styles/features/continuous-publishing-drafts.css',
        'styles/features/continuous-publishing-responsive.css',
        'styles/features/blog-next-smart-comment.css',
        'styles/features/card-news.css',
        'styles/features/card-news-results.css',
        'styles/features/card-news-management.css',
        'styles/features/continuous-publishing-interactions.css',
        'styles/features/blog-next-panel-anatomy.css',
        'styles/features/blog-next-quick-flow.css',
        'styles/features/blog-next-baseline.css',
        'styles/features/continuous-publishing-usability.css',
        'styles/features/settings-tables.css',
        'styles/features/settings-detail.css',
        'styles/features/settings-next.css',
        'styles/features/settings-next-appearance.css',
        'styles/features/writing-settings.css',
        'styles/features/recommendations.css',
        'styles/features/recommendation-center.css',
        'styles/features/discovery-modal.css',
        'styles/features/discovery-keyword-research.css',
        'styles/features/discovery-responsive.css',
        'styles/features/discovery-writing-assists.css',
        'styles/layout/responsive.css',
        'styles/layout/responsive-shell.css',
        'styles/layout/responsive-forms.css',
        'styles/layout/responsive-blog-quick.css',
        'styles/layout/responsive-footer.css'
    ]);
});

test('CSS manifest declares one cascade contract and keeps every module inside a named layer', () => {
    const manifest = fs.readFileSync(manifestPath, 'utf8');
    const declaredOrder = manifest.match(/@layer\s+([^;]+);/)?.[1]
        .split(',')
        .map((name) => name.trim().replace(/^bloggenius\./, ''));
    assert.deepEqual(declaredOrder, CASCADE_LAYER_ORDER);

    let activeLayer = '';
    const assignedModules = [];
    manifest.split('\n').forEach((line, index) => {
        const trimmed = line.trim();
        if (
            trimmed
            && !trimmed.startsWith('/*')
            && !trimmed.startsWith('@import ')
            && !/^@layer\s+[^;]+;$/.test(trimmed)
            && !/^@layer\s+bloggenius\.[a-z-]+\s*\{$/.test(trimmed)
            && trimmed !== '}'
        ) {
            assert.fail(`raw CSS is not allowed in the composition manifest at line ${index + 1}`);
        }
        const layerStart = trimmed.match(/^@layer\s+bloggenius\.([a-z-]+)\s*\{$/);
        if (layerStart) {
            assert.equal(activeLayer, '', `nested manifest layer at line ${index + 1}`);
            assert.equal(CASCADE_LAYER_ORDER.includes(layerStart[1]), true, layerStart[1]);
            activeLayer = layerStart[1];
            return;
        }
        if (trimmed === '}') {
            assert.notEqual(activeLayer, '', `unmatched layer close at line ${index + 1}`);
            activeLayer = '';
            return;
        }
        const include = trimmed.match(/^\/\*\s*@include\s+([^\s]+)\s*\*\/$/);
        if (include) {
            assert.notEqual(activeLayer, '', `${include[1]} is outside a named layer`);
            assignedModules.push({ path: include[1], layer: activeLayer });
        }
    });

    assert.equal(activeLayer, '');
    assert.equal(assignedModules.length > 0, true);
    const tokenModules = new Set([
        'styles/styles/compatibility.css',
        'styles/styles/warm-editorial.css',
        'styles/styles/quiet-sage-studio.css',
        'styles/tokens/legacy-aliases.css'
    ]);
    const baseModules = new Set(['styles/base/foundation.css', 'styles/layout/shell-navigation.css']);
    assignedModules.forEach(({ path: modulePath, layer }) => {
        const expectedLayer = tokenModules.has(modulePath)
            ? 'tokens'
            : baseModules.has(modulePath)
                ? 'base'
                : modulePath.startsWith('styles/layout/responsive')
                    ? 'utilities'
                    : modulePath.startsWith('styles/features/')
                        ? 'features'
                        : 'components';
        assert.equal(layer, expectedLayer, modulePath);
    });
    assert.equal(assignedModules.some(({ layer }) => layer === 'legacy'), false);
    assert.equal(assignedModules.length, new Set(assignedModules.map(({ path: modulePath }) => modulePath)).size);

    const composed = createCssCompositionRuntime({ fs, path }).composeCssFile({ uiRoot }).css;
    assert.match(composed, /^@import[^\n]+\n@layer bloggenius\.reset,/);
    assert.doesNotMatch(composed, /@layer bloggenius\.legacy\s*\{/);
});

test('every CSS module is reachable, unique, and remains below the module boundary', () => {
    const moduleRoot = path.join(uiRoot, 'styles');
    const moduleFiles = collectCssFiles(moduleRoot);
    const result = createCssCompositionRuntime({ fs, path }).composeCssFile({ uiRoot });
    const reachable = new Set(result.includedFiles);

    assert.equal(reachable.size, result.includedFiles.length);
    assert.deepEqual(
        new Set(moduleFiles.map((filePath) => path.relative(uiRoot, filePath))),
        reachable
    );
    moduleFiles.forEach((filePath) => {
        const lineCount = fs.readFileSync(filePath, 'utf8').split('\n').length - 1;
        assert.equal(lineCount <= 900, true, `${path.relative(uiRoot, filePath)} has ${lineCount} lines`);
    });
    assert.match(result.css, /^@import url/);
    assert.match(result.css, /\.quick-discovery-modal-container\s*\{/);
    assert.doesNotMatch(result.css, /\/\*\s*@include\s+/);
});

test('segmented control radios remain visually hidden inside their own label', () => {
    const css = fs.readFileSync(
        path.join(uiRoot, 'styles', 'features', 'automation-settings.css'),
        'utf8'
    );

    assert.match(css, /\.settings-segmented-control label\s*\{[^}]*position:\s*relative;/s);
    assert.match(css, /\.settings-segmented-control input\s*\{[^}]*position:\s*absolute;/s);
    assert.match(css, /\.settings-segmented-control input\s*\{[^}]*width:\s*1px;/s);
    assert.match(css, /\.settings-segmented-control input\s*\{[^}]*height:\s*1px;/s);
    assert.match(css, /\.settings-segmented-control input\s*\{[^}]*clip-path:\s*inset\(50%\);/s);
});

test('Blog Beta form typography separates labels, edit values, and compact automation fields', () => {
    const coreCss = fs.readFileSync(
        path.join(uiRoot, 'styles', 'features', 'continuous-publishing.css'),
        'utf8'
    );
    const automationCss = fs.readFileSync(
        path.join(uiRoot, 'styles', 'features', 'continuous-publishing-automation.css'),
        'utf8'
    );

    assert.match(coreCss, /\.blog-next-field\s*\{[^}]*font-size:\s*var\(--ui-type-body-size\);[^}]*font-weight:\s*var\(--ui-weight-regular\);/s);
    assert.match(coreCss, /\.blog-next-field\s*>\s*span:first-child,[\s\S]*?font-size:\s*var\(--ui-type-label-size\);[\s\S]*?font-weight:\s*var\(--ui-weight-bold\);/);
    assert.match(coreCss, /\.blog-next-field input\[type="text"\],[\s\S]*?font-size:\s*var\(--ui-type-body-size\);[\s\S]*?font-weight:\s*var\(--ui-weight-regular\);/);
    assert.match(automationCss, /\.blog-next-automation-fields \.blog-next-field\s*>\s*span:first-child\s*\{[^}]*font-size:\s*var\(--ui-type-label-size\);[^}]*font-weight:\s*var\(--ui-weight-semibold\);/s);
});

test('Blog Beta management typography follows shared navigation roles and distinguishes item content and actions', () => {
    const queueCss = fs.readFileSync(
        path.join(uiRoot, 'styles', 'features', 'continuous-publishing-queue.css'),
        'utf8'
    );
    const usabilityCss = fs.readFileSync(
        path.join(uiRoot, 'styles', 'features', 'continuous-publishing-usability.css'),
        'utf8'
    );
    const tabCss = fs.readFileSync(
        path.join(uiRoot, 'styles', 'patterns', 'tab-navigation.css'),
        'utf8'
    );

    assert.match(tabCss, /\.ui-top-tab,\s*\.ui-segmented-tab\s*\{[^}]*font-weight:\s*var\(--ui-weight-semibold\);[^}]*line-height:\s*var\(--ui-line-height-tight\);/s);
    assert.match(tabCss, /\.ui-segmented-tab\s*\{[^}]*font-size:\s*var\(--ui-type-label-size\);/s);
    assert.match(usabilityCss, /\.blog-next-management-tab strong\s*\{[^}]*font-size:\s*var\(--ui-type-caption-size\);[^}]*font-weight:\s*inherit;/s);
    assert.match(queueCss, /\.blog-next-queue-copy strong\s*\{[^}]*font-size:\s*var\(--ui-type-body-size\);[^}]*font-weight:\s*var\(--ui-weight-semibold\);/s);
    assert.match(queueCss, /\.blog-next-queue-copy span\s*\{[^}]*font-size:\s*var\(--ui-type-label-size\);[^}]*font-weight:\s*var\(--ui-weight-regular\);/s);
    assert.match(queueCss, /\.blog-next-queue-actions \.ghost\s*\{[^}]*font-size:\s*var\(--ui-type-label-size\);[^}]*font-weight:\s*var\(--ui-weight-semibold\);/s);
    assert.match(queueCss, /\.blog-next-queue-actions \.primary\s*\{[^}]*font-size:\s*var\(--ui-type-label-size\);[^}]*font-weight:\s*var\(--ui-weight-bold\);/s);
});

test('loading spinners share one keyframes definition', () => {
    const cssFiles = [];
    const collect = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) collect(full);
            else if (entry.isFile() && entry.name.endsWith('.css')) cssFiles.push(full);
        }
    };
    collect(path.join(uiRoot, 'styles'));
    const keyframes = new Set();
    for (const file of cssFiles) {
        const css = fs.readFileSync(file, 'utf8');
        for (const match of css.matchAll(/@keyframes\s+([a-zA-Z0-9_-]+)/g)) {
            if (/spin/i.test(match[1])) keyframes.add(match[1]);
        }
    }
    assert.deepEqual([...keyframes].sort(), ['ui-refresh-action-spin']);
});

test('indeterminate progress bars share one pattern', () => {
    const readUi = (file) => fs.readFileSync(path.join(uiRoot, file), 'utf8');
    const feedback = readUi('styles/components/feedback.css');
    const overlays = readUi('partials/overlays.html');

    assert.match(feedback, /\.ui-progress-indeterminate\s*\{/);
    assert.match(feedback, /@keyframes ui-progress-slide/);
    for (const file of [
        'styles/features/discovery-modal.css',
        'styles/features/discovery-keyword-research.css',
        'styles/features/discovery-responsive.css',
        'styles/features/discovery-writing-assists.css',
        'styles/features/recommendations.css'
    ]) {
        const css = readUi(file);
        assert.doesNotMatch(css, /keyword-modal-progress/);
        assert.doesNotMatch(css, /quick-topic-recommendations-progress/);
        assert.doesNotMatch(css, /quick-topic-progress/);
    }
    assert.match(overlays, /class="ui-progress-indeterminate"/);
});

test('responsive breakpoints use the canonical set', () => {
    const cssFiles = [];
    const collect = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) collect(full);
            else if (entry.isFile() && entry.name.endsWith('.css')) cssFiles.push(full);
        }
    };
    collect(path.join(uiRoot, 'styles'));
    const maxWidths = new Set();
    const minWidths = new Set();
    for (const file of cssFiles) {
        const css = fs.readFileSync(file, 'utf8');
        for (const match of css.matchAll(/@media\s*\(\s*max-width:\s*([0-9]+)px\s*\)/g)) {
            maxWidths.add(match[1]);
        }
        for (const match of css.matchAll(/@media\s*\(\s*min-width:\s*([0-9]+)px\s*\)/g)) {
            minWidths.add(match[1]);
        }
        for (const match of css.matchAll(/\(\s*min-width:\s*([0-9]+)px\s*\)\s*and\s*\(\s*max-width:/g)) {
            minWidths.add(match[1]);
        }
    }
    // 1240px stays frozen in the hidden legacy dashboard view.
    assert.deepEqual([...maxWidths].sort((a, b) => a - b), ['640', '768', '960', '1100', '1240']);
    assert.deepEqual([...minWidths].sort((a, b) => a - b), ['769', '961']);
});

test('active surfaces use type and weight tokens', () => {
    const activeFiles = getDesignSystemStylePaths(CONTRACTS.TYPOGRAPHY);
    for (const file of activeFiles) {
        const css = fs.readFileSync(path.join(repoRoot, file), 'utf8');
        const lines = css.split('\n').filter((line) => !/type-geometry-exception/.test(line));
        const scoped = lines.join('\n');
        assert.doesNotMatch(scoped, /font-size:\s*[0-9.]+(?:px|r?em)/, file);
        assert.doesNotMatch(scoped, /font-weight:\s*[0-9]+/, file);
    }
});

test('active surface transitions use motion tokens', () => {
    const activeFiles = getDesignSystemStylePaths(CONTRACTS.MOTION);
    for (const file of activeFiles) {
        const css = fs.readFileSync(path.join(repoRoot, file), 'utf8');
        const declarations = Array.from(css.matchAll(/transition:\s*([^;]+);/g), (match) => match[1].trim());
        declarations.forEach((value) => {
            if (value === 'none') return;
            assert.match(
                value,
                /var\(--ui-(?:motion|transition)-[a-z0-9-]+\)/,
                `${file} owns an untokenized transition: ${value}`
            );
            assert.doesNotMatch(
                value,
                /(?:^|\s|,)\d*\.?\d+(?:ms|s)\b/,
                `${file} owns a raw transition duration: ${value}`
            );
        });
    }
});
