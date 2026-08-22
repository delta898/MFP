const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { createJsCompositionRuntime } = require('../src/ui-runtime/js-composition-runtime');

const repoRoot = path.resolve(__dirname, '..');
const uiRoot = path.join(repoRoot, 'ui');
const manifestPath = path.join(uiRoot, 'app.js');

function collectJsFiles(rootDir) {
    return fs.readdirSync(rootDir, { withFileTypes: true }).flatMap((entry) => {
        const entryPath = path.join(rootDir, entry.name);
        if (entry.isDirectory()) return collectJsFiles(entryPath);
        return entry.isFile() && entry.name.endsWith('.js') ? [entryPath] : [];
    });
}

test('JavaScript manifest preserves one explicit classic-script execution order', () => {
    const manifest = fs.readFileSync(manifestPath, 'utf8');
    const includePaths = Array.from(
        manifest.matchAll(/^\s*\/\/\s*@include\s+([^\s]+)\s*$/gm),
        (match) => match[1]
    );

    assert.equal(manifest.split('\n').length - 1 <= 50, true);
    assert.deepEqual(includePaths, [
        'scripts/foundation/setup-and-surfaces.js',
        'scripts/foundation/notifications.js',
        'scripts/foundation/api-client.js',
        'scripts/foundation/presentation.js',
        'scripts/foundation/settings-secrets.js',
        'scripts/shared/state.js',
        'scripts/foundation/progress-state.js',
        'scripts/foundation/dialogs.js',
        'scripts/foundation/readiness.js',
        'scripts/features/legacy-discovery-account.js',
        'scripts/features/legacy-dashboard-social.js',
        'scripts/foundation/navigation.js',
        'scripts/features/legacy-content-publishing.js',
        'scripts/features/legacy-settings.js',
        'scripts/features/legacy-actions-controllers.js',
        'scripts/foundation/lifecycle.js',
        'scripts/features/legacy-publish-helpers.js'
    ]);
});

test('every JavaScript module is reachable, unique, bounded, and composes as one classic script', () => {
    const moduleRoot = path.join(uiRoot, 'scripts');
    const moduleFiles = collectJsFiles(moduleRoot);
    const result = createJsCompositionRuntime({ fs, path }).composeJsFile({ uiRoot });
    const reachable = new Set(result.includedFiles);

    assert.equal(reachable.size, result.includedFiles.length);
    assert.deepEqual(
        new Set(moduleFiles.map((filePath) => path.relative(uiRoot, filePath))),
        reachable
    );
    moduleFiles.forEach((filePath) => {
        const relativePath = path.relative(uiRoot, filePath);
        const lineCount = fs.readFileSync(filePath, 'utf8').split('\n').length - 1;
        const limit = relativePath.includes('/features/legacy-') ? 3000 : 800;
        assert.equal(lineCount <= limit, true, `${relativePath} has ${lineCount} lines (limit ${limit})`);
    });
    assert.doesNotThrow(() => new vm.Script(result.js, { filename: manifestPath }));
    assert.doesNotMatch(result.js, /^\s*\/\/\s*@include\s+/m);
});
