const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const scriptsRoot = path.join(repoRoot, 'ui', 'scripts');

const controllerContracts = Object.freeze({
    'features/publishing/preview-utils.js': ['renderInlinePreviewHtml', 'setLocalMarkdownPreviewDensity'],
    'features/publishing/wordpress-controls.js': ['initWpCategorySelector'],
    'features/publishing/shared-preferences.js': ['initGlobalPublishSettingsSync'],
    'features/publishing/shopping-controls.js': ['initShoppingQuickCategoryPersistence'],
    'features/social/manual-composer.js': ['syncManualSnsComposerState', 'loadManualSnsComposer'],
    'features/social/manual-optimization.js': ['optimizeManualSnsText', 'undoManualSnsOptimization'],
    'features/social/manual-publish.js': ['publishManualSns'],
    'features/social/manual-lifecycle.js': ['initManualSnsComposer']
});

function readScript(relativePath) {
    return fs.readFileSync(path.join(scriptsRoot, relativePath), 'utf8');
}

function functionDeclarationPattern(functionName) {
    return new RegExp(`(?:async\\s+)?function\\s+${functionName}\\s*\\(`, 'g');
}

test('publishing and social controllers have one explicit feature owner', () => {
    const sources = Object.fromEntries(
        Object.keys(controllerContracts).map((relativePath) => [relativePath, readScript(relativePath)])
    );
    const combinedSource = Object.values(sources).join('\n');

    Object.entries(controllerContracts).forEach(([ownerPath, functionNames]) => {
        functionNames.forEach((functionName) => {
            assert.match(sources[ownerPath], functionDeclarationPattern(functionName));
            assert.equal(Array.from(combinedSource.matchAll(functionDeclarationPattern(functionName))).length, 1);
        });
    });
});

test('temporary feature modules no longer own extracted publishing or social controllers', () => {
    const featureRoot = path.join(scriptsRoot, 'features');
    const legacySource = fs.readdirSync(featureRoot)
        .filter((name) => name.startsWith('legacy-') && name.endsWith('.js'))
        .map((name) => readScript(`features/${name}`))
        .join('\n');

    Object.values(controllerContracts).flat().forEach((functionName) => {
        assert.doesNotMatch(legacySource, functionDeclarationPattern(functionName));
    });
});
