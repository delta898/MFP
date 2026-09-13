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
    'features/social/manual-workspace-cache.js': ['readManualSnsWorkspaceCache', 'persistManualSnsWorkspaceCache', 'clearManualSnsWorkspaceCache'],
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

test('manual SNS publishing owns a busy state that locks duplicate actions', () => {
    const stateSource = readScript('features/social/manual-state.js');
    const composerSource = readScript('features/social/manual-composer.js');
    const publishSource = readScript('features/social/manual-publish.js');
    const styles = fs.readFileSync(path.join(repoRoot, 'ui', 'styles', 'features', 'social.css'), 'utf8');
    const feedbackStyles = fs.readFileSync(path.join(repoRoot, 'ui', 'styles', 'components', 'feedback.css'), 'utf8');
    const socialView = fs.readFileSync(path.join(repoRoot, 'ui', 'partials', 'views', 'social.html'), 'utf8');

    assert.match(stateSource, /manualSnsPublishingInFlight/);
    assert.match(stateSource, /manualSnsLastPublishedSignature/);
    assert.match(publishSource, /manualSnsPublishingInFlight\s*=\s*true/);
    assert.match(publishSource, /manualSnsPublishingInFlight\s*=\s*false/);
    assert.match(publishSource, /publishBtn\.disabled\s*\|\|\s*manualSnsPublishingInFlight/);
    assert.match(composerSource, /publishBtn\.classList\.toggle\('is-loading',\s*manualSnsPublishingInFlight\)/);
    assert.match(composerSource, /manualSnsLastPublishedSignature\s*===\s*publishSignature/);
    assert.match(composerSource, /\? '발행 완료'/);
    assert.match(composerSource, /imageFileEl\.disabled\s*=\s*manualSnsPublishingInFlight/);
    assert.match(composerSource, /input\.dataset\.manualSnsUnavailable/);
    assert.match(composerSource, /manualSnsDraggedImageIndex/);
    assert.match(socialView, /id="manual-sns-publish-btn" class="primary ui-loading-action"/);
    assert.match(feedbackStyles, /button\.ui-loading-action\.is-loading::before/);
    assert.match(feedbackStyles, /animation: ui-refresh-action-spin/);
    assert.doesNotMatch(styles, /@keyframes manual-sns-publish-spin/);
    assert.match(styles, /#manual-sns-publish-btn:disabled/);
});
