const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createCssCompositionRuntime } = require('../src/ui-runtime/css-composition-runtime');

const repoRoot = path.resolve(__dirname, '..');
const uiRoot = path.join(repoRoot, 'ui');
const manifestPath = path.join(uiRoot, 'styles.css');

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

    assert.equal(manifest.split('\n').length - 1 <= 50, true);
    assert.deepEqual(includePaths, [
        'styles/base/foundation.css',
        'styles/layout/shell-navigation.css',
        'styles/features/account.css',
        'styles/components/app-chrome.css',
        'styles/features/social.css',
        'styles/features/publishing.css',
        'styles/features/automation-settings.css',
        'styles/features/dashboard.css',
        'styles/components/clock.css',
        'styles/features/dashboard-feeds.css',
        'styles/features/content-tabs.css',
        'styles/features/settings-tables.css',
        'styles/components/modals-batch.css',
        'styles/components/feedback.css',
        'styles/layout/responsive.css',
        'styles/features/settings-detail.css',
        'styles/features/writing-settings.css',
        'styles/components/form-widgets.css',
        'styles/features/recommendations.css',
        'styles/features/recommendation-center.css',
        'styles/features/discovery-modal.css'
    ]);
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
