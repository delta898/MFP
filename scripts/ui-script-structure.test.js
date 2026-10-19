const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { createJsCompositionRuntime } = require('../src/adapters/ui/assets/composition/js-composition');
const { evaluateUiSize } = require('./ui-size-policy');

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

test('JavaScript manifest preserves its execution order and remains within its size policy', (t) => {
    const manifest = fs.readFileSync(manifestPath, 'utf8');
    const includePaths = Array.from(
        manifest.matchAll(/^\s*\/\/\s*@include\s+([^\s]+)\s*$/gm),
        (match) => match[1]
    );

    const manifestSize = evaluateUiSize('jsManifest', includePaths.length);
    assert.notEqual(manifestSize.status, 'error', `ui/app.js has ${includePaths.length} includes (maximum ${manifestSize.maximum})`);
    if (manifestSize.status === 'warning') t.diagnostic(`Size recommendation: ui/app.js has ${includePaths.length} includes (recommended ${manifestSize.recommended}; maximum ${manifestSize.maximum}).`);
    assert.deepEqual(includePaths, [
        'scripts/foundation/design-style-token-contract.js',
        'scripts/foundation/style-system.js',
        'scripts/shared/grid-tail-spacers.js',
        'scripts/shared/ai-action-button.js',
        'scripts/foundation/ui-feedback-state.js',
        'scripts/foundation/ui-progress.js',
        'scripts/shell/setup-banner.js',
        'scripts/shell/sidebar.js',
        'scripts/shell/supporting-surfaces.js',
        'scripts/foundation/notifications.js',
        'scripts/foundation/api-client.js',
        'scripts/foundation/presentation.js',
        'scripts/shared/form-values.js',
        'scripts/shared/google-sheet-url.js',
        'scripts/foundation/tab-navigation.js',
        'scripts/features/settings/secrets.js',
        'scripts/features/settings/card.js',
        'scripts/features/content-workspace/state-core.js',
        'scripts/features/blog/discovery/state.js',
        'scripts/features/settings/shell.js',
        'scripts/features/settings/plugins.js',
        'scripts/features/settings/site-hosting.js',
        'scripts/features/site-hosting/project-management.js',
        'scripts/features/site-hosting/site-hosting-settings-and-accounts.js',
        'scripts/features/site-hosting/site-profile-fields.js',
        'scripts/features/site-hosting/domains.js',
        'scripts/features/site-hosting/site-creation-validation.js',
        'scripts/features/site-hosting/site-creation-navigation.js',
        'scripts/features/site-hosting/site-import-workflow.js',
        'scripts/features/settings/spreadsheet-connection.js',
        'scripts/features/settings/save-proceed.js',
        'scripts/features/settings/ai-model-roles.js',
        'scripts/features/settings/writing-defaults.js',
        'scripts/features/settings/optional-services.js',
        'scripts/features/settings/external-connections.js',
        'scripts/features/settings/app-input.js',
        'scripts/features/settings/app-general.js',
        'scripts/features/settings/appearance.js',
        'scripts/features/content-workspace/table-state.js',
        'scripts/shared/runtime-state.js',
        'scripts/shell/update-state.js',
        'scripts/shell/mobile-state.js',
        'scripts/shell/update.js',
        'scripts/foundation/progress-state.js',
        'scripts/foundation/dialogs.js',
        'scripts/foundation/readiness.js',
        'scripts/shared/capability-readiness.js',
        'scripts/features/content-workspace/workspace-tables.js',
        'scripts/features/blog/discovery/quick-discovery.js',
        'scripts/features/blog/discovery/keyword-modal.js',
        'scripts/features/shopping/tab-navigation.js',
        'scripts/shared/publishing/preview-utils.js',
        'scripts/features/dashboard/recommendations.js',
        'scripts/shell/account-overview.js',
        'scripts/shell/account-actions.js',
        'scripts/features/dashboard/dashboard.js',
        'scripts/shell/help.js',
        'scripts/shell/celebration.js',
        'scripts/foundation/widget-slot-host.js',
        'scripts/shell/global-publishing-status.js',
        'scripts/shared/buffer-publishing-controls.js',
        'scripts/features/sns/manual-state.js',
        'scripts/features/sns/manual-workspace-cache.js',
        'scripts/features/sns/manual-workspace-loading.js',
        'scripts/features/sns/manual-composer.js',
        'scripts/features/sns/manual-optimization.js',
        'scripts/features/sns/manual-publish.js',
        'scripts/features/sns/manual-lifecycle.js',
        'scripts/features/blog/shell.js',
        'scripts/features/blog/publish-preflight.js',
        'scripts/features/blog/settings-instance.js',
        'scripts/features/blog/quick-flow-ui.js',
        'scripts/features/blog/queue-ui.js',
        'scripts/features/blog/writing-overrides.js',
        'scripts/features/blog/quick-queue.js',
        'scripts/features/blog/queue-management.js',
        'scripts/features/blog/trend-posting.js',
        'scripts/features/blog/publishing-targets.js',
        'scripts/features/blog/draft-inputs.js',
        'scripts/shared/manuscript-image-card.js',
        'scripts/features/blog/draft-images.js',
        'scripts/features/blog/draft-execution.js',
        'scripts/features/blog/smart-comment.js',
        'scripts/features/blog/automation-settings.js',
        'scripts/features/blog/runner.js',
        'scripts/features/blog/writing-intent.js',
        'scripts/features/card-news/image-model-selection.js',
        'scripts/features/card-news/source-preview.js',
        'scripts/features/card-news/signature-requests.js',
        'scripts/features/card-news/generation-workflow.js',
        'scripts/features/card-news/publishing.js',
        'scripts/features/card-news/management.js',
        'scripts/features/card-news/source-manager.js',
        'scripts/shell/navigation.js',
        'scripts/features/content-workspace/blog-topics.js',
        'scripts/features/shopping/quick-preview.js',
        'scripts/features/shopping/items.js',
        'scripts/features/shopping/image-settings.js',
        'scripts/shared/publishing/prerequisites.js',
        'scripts/features/legacy-actions-controllers.js',
        'scripts/shell/lifecycle.js',
        'scripts/shared/publishing/wordpress-controls.js',
        'scripts/shared/publishing/shared-preferences.js',
        'scripts/features/shopping/publishing-controls.js'
    ]);
});

test('every JavaScript module is reachable, unique, within size policy, and composes as one classic script', (t) => {
    const moduleRoot = path.join(uiRoot, 'scripts');
    const standaloneEditorFiles = new Set([
        'features/blog/manuscript-editor-entry.js',
        'vendor/manuscript-editor.js'
    ]);
    const moduleFiles = collectJsFiles(moduleRoot).filter((filePath) =>
        !standaloneEditorFiles.has(path.relative(moduleRoot, filePath))
    );
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
        const policyName = relativePath === 'scripts/features/legacy-actions-controllers.js' ? 'legacyJsController' : 'jsModule';
        const size = evaluateUiSize(policyName, lineCount);
        assert.notEqual(size.status, 'error', `${relativePath} has ${lineCount} lines (maximum ${size.maximum})`);
        if (size.status === 'warning') t.diagnostic(`Size recommendation: ${relativePath} has ${lineCount} lines (recommended ${size.recommended}; maximum ${size.maximum}).`);
    });
    assert.doesNotThrow(() => new vm.Script(result.js, { filename: manifestPath }));
    assert.doesNotMatch(result.js, /^\s*\/\/\s*@include\s+/m);
});
