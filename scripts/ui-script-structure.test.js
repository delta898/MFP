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

    assert.equal(manifest.split('\n').length - 1 <= 90, true);
    assert.deepEqual(includePaths, [
        'scripts/foundation/style-system.js',
        'scripts/foundation/ui-feedback-state.js',
        'scripts/features/shell/setup-banner.js',
        'scripts/features/shell/sidebar.js',
        'scripts/features/shell/supporting-surfaces.js',
        'scripts/foundation/notifications.js',
        'scripts/foundation/api-client.js',
        'scripts/foundation/presentation.js',
        'scripts/foundation/tab-navigation.js',
        'scripts/foundation/settings-secrets.js',
        'scripts/foundation/settings-card.js',
        'scripts/features/content/state-core.js',
        'scripts/features/discovery/state.js',
        'scripts/features/settings/state.js',
        'scripts/features/settings-next/shell.js',
        'scripts/features/settings-next/ai-model-roles.js',
        'scripts/features/settings-next/writing-defaults.js',
        'scripts/features/content/table-state.js',
        'scripts/shared/runtime-state.js',
        'scripts/features/shell/update-state.js',
        'scripts/features/shell/log-state.js',
        'scripts/foundation/mobile-state.js',
        'scripts/features/shell/update.js',
        'scripts/features/automation/state.js',
        'scripts/foundation/progress-state.js',
        'scripts/foundation/dialogs.js',
        'scripts/foundation/readiness.js',
        'scripts/features/content/trend-table.js',
        'scripts/features/discovery/trend-collection.js',
        'scripts/features/content/blog-tabs.js',
        'scripts/features/discovery/quick-discovery.js',
        'scripts/features/discovery/trend-posting.js',
        'scripts/features/discovery/naver-comment-draft.js',
        'scripts/features/content/tab-navigation.js',
        'scripts/features/publishing/preview-utils.js',
        'scripts/features/shell/dashboard-content.js',
        'scripts/features/recommendations/center.js',
        'scripts/features/shell/account-overview.js',
        'scripts/features/shell/account-actions.js',
        'scripts/features/shell/dashboard.js',
        'scripts/features/shell/dashboard-beta.js',
        'scripts/features/shell/help.js',
        'scripts/features/shell/activity-logs.js',
        'scripts/features/shell/system-logs.js',
        'scripts/features/shell/celebration.js',
        'scripts/features/shell/clock.js',
        'scripts/features/shell/global-publishing-status.js',
        'scripts/features/social/manual-state.js',
        'scripts/features/social/manual-composer.js',
        'scripts/features/social/manual-optimization.js',
        'scripts/features/social/manual-publish.js',
        'scripts/features/social/manual-lifecycle.js',
        'scripts/features/blog-next/shell.js',
        'scripts/features/blog-next/publish-preflight.js',
        'scripts/features/blog-next/quick-flow-ui.js',
        'scripts/features/blog-next/queue-ui.js',
        'scripts/features/blog-next/quick-queue.js',
        'scripts/features/blog-next/trend-posting.js',
        'scripts/features/blog-next/draft-inputs.js',
        'scripts/features/blog-next/smart-comment.js',
        'scripts/features/blog-next/automation-settings.js',
        'scripts/features/blog-next/runner.js',
        'scripts/features/card-news/source-preview.js',
        'scripts/features/card-news/management.js',
        'scripts/foundation/navigation.js',
        'scripts/features/content/blog-topics.js',
        'scripts/features/content/shopping-items.js',
        'scripts/features/content/blog-batch.js',
        'scripts/features/settings/writing-preferences.js',
        'scripts/features/settings/writing-profile-settings.js',
        'scripts/features/settings/buffer.js',
        'scripts/features/settings/sns-runtime.js',
        'scripts/features/settings/card-news-rss.js',
        'scripts/features/settings/major-form.js',
        'scripts/features/settings/ai-models.js',
        'scripts/features/settings/save-lifecycle.js',
        'scripts/features/settings/shopping-images.js',
        'scripts/features/settings/mcp-token.js',
        'scripts/features/settings/google-sheets.js',
        'scripts/features/settings/google-auth.js',
        'scripts/features/settings/platform-auth.js',
        'scripts/features/automation/blog-collect-ui.js',
        'scripts/features/automation/shared-normalization.js',
        'scripts/features/automation/blog.js',
        'scripts/features/automation/shopping.js',
        'scripts/features/legacy-actions-controllers.js',
        'scripts/foundation/lifecycle.js',
        'scripts/features/publishing/wordpress-controls.js',
        'scripts/features/publishing/shared-preferences.js',
        'scripts/features/publishing/shopping-controls.js'
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
