const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const scriptsRoot = path.join(repoRoot, 'ui', 'scripts');

const shellContracts = Object.freeze({
    'features/shell/setup-banner.js': ['checkSetupBanner', 'dismissSetupBanner'],
    'features/shell/sidebar.js': ['refreshSidebarDynamicContent', 'initSidebarDynamicContent'],
    'features/shell/supporting-surfaces.js': ['initDashboardDynamicContent', 'refreshAccountDynamicContent'],
    'features/shell/update.js': ['checkUpdate', 'applyUpdate'],
    'features/shell/dashboard-content.js': ['renderDashboardAutoSchedule', 'loadDashboardExternalContent'],
    'features/shell/account-overview.js': ['renderAccountOverview', 'loadAccountOverview'],
    'features/shell/account-actions.js': ['bindAccountUpgradeFreeClick', 'bindAccountPlanInfoClick'],
    'features/shell/dashboard.js': ['loadDashboard'],
    'features/shell/activity-logs.js': ['loadDashboardLogs'],
    'features/shell/system-logs.js': ['loadSystemLog', 'formatSystemLogHtml'],
    'features/shell/celebration.js': ['showAppCelebration', 'flushPendingQuickPostingCelebration'],
    'features/shell/clock.js': ['initClockWidget']
});

function readScript(relativePath) {
    return fs.readFileSync(path.join(scriptsRoot, relativePath), 'utf8');
}

function functionDeclarationPattern(functionName) {
    return new RegExp(`(?:async\\s+)?function\\s+${functionName}\\s*\\(`, 'g');
}

test('dashboard shell responsibilities have one explicit feature owner', () => {
    const shellSources = Object.fromEntries(
        Object.keys(shellContracts).map((relativePath) => [relativePath, readScript(relativePath)])
    );
    const combinedShellSource = Object.values(shellSources).join('\n');

    Object.entries(shellContracts).forEach(([ownerPath, functionNames]) => {
        functionNames.forEach((functionName) => {
            assert.match(shellSources[ownerPath], functionDeclarationPattern(functionName));
            assert.equal(
                Array.from(combinedShellSource.matchAll(functionDeclarationPattern(functionName))).length,
                1,
                `${functionName} must have one dashboard shell owner`
            );
        });
    });
});

test('temporary feature modules no longer own dashboard shell controllers', () => {
    const featureRoot = path.join(scriptsRoot, 'features');
    const legacyFiles = fs.readdirSync(featureRoot)
        .filter((name) => name.startsWith('legacy-') && name.endsWith('.js'));
    const legacySource = legacyFiles.map((name) => readScript(`features/${name}`)).join('\n');
    const shellFunctionNames = Object.values(shellContracts).flat();

    shellFunctionNames.forEach((functionName) => {
        assert.doesNotMatch(legacySource, functionDeclarationPattern(functionName));
    });
});
