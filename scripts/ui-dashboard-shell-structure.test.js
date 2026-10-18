const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const scriptsRoot = path.join(repoRoot, 'ui', 'scripts');

const shellContracts = Object.freeze({
    'shell/setup-banner.js': ['checkSetupBanner', 'dismissSetupBanner'],
    'shell/sidebar.js': ['refreshSidebarDynamicContent', 'initSidebarDynamicContent'],
    'shell/update.js': ['checkUpdate', 'applyUpdate'],
    'shell/account-overview.js': ['renderAccountOverview', 'loadAccountOverview'],
    'shell/account-actions.js': ['bindAccountUpgradeFreeClick', 'bindAccountPlanInfoClick'],
    'shell/celebration.js': ['showAppCelebration', 'showPendingUpdateCelebration', 'showPostingCompletionCelebration', 'flushPendingQuickPostingCelebration'],
    'foundation/widget-slot-host.js': ['initWidgetSlotHost']
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

test('self-update completion uses the shared celebration and acknowledges it after display', () => {
    const celebrationSource = readScript('shell/celebration.js');
    const lifecycleSource = readScript('shell/lifecycle.js');

    assert.match(celebrationSource, /fetchJson\('\/api\/v1\/system\/update\/completion'\)/);
    assert.match(celebrationSource, /showAppCelebration\(\{/);
    assert.match(celebrationSource, /BlogGenius v\$\{completion\.targetVersion\} 업데이트가 적용되었습니다/);
    assert.match(celebrationSource, /postJson\('\/api\/v1\/system\/update\/completion\/ack'/);
    assert.match(lifecycleSource, /void showPendingUpdateCelebration\(\)/);
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

test('dashboard refreshes persisted discoveries once per app session without replacing them on failure', () => {
    const dashboardSource = readScript('features/dashboard/dashboard.js');
    const centerSource = readScript('features/dashboard/recommendations.js');

    assert.match(dashboardSource, /loadRecommendationCenterForDashboard\(\)/);
    assert.match(centerSource, /recommendationCenterStartupRefreshCompleted/);
    assert.match(centerSource, /if \(!initial \|\| initial\.refresh\) return initial/);
    assert.match(centerSource, /loadRecommendationCenter\(\{ suppressExistingNotification: true \}\)/);
    assert.match(centerSource, /payload\.refresh\?\.status === 'evaluated'/);
    assert.match(centerSource, /rememberRecommendationCenterIds\(payload\.items \|\| \[\]\)/);
    assert.match(centerSource, /loadRecommendationCenter\(\{ discover: true, preserveExistingOnError: true \}\)/);
    assert.match(centerSource, /options\.preserveExistingOnError && recommendationCenterItems\.length > 0/);
});

test('manual discovery reports progress through the refresh button', () => {
    const centerSource = readScript('features/dashboard/recommendations.js');

    assert.match(centerSource, /function startRecommendationCenterProgress\(button\)/);
    assert.match(centerSource, /button\.classList\.add\('is-loading'\)/);
    assert.match(centerSource, /button\.textContent = '발견 중\.\.\.'/);
    assert.match(centerSource, /button\.setAttribute\('aria-busy', 'true'\)/);
    assert.match(centerSource, /button\.classList\.remove\('is-loading'\)/);
    assert.match(centerSource, /if \(options\.force\) \{\s*status\.hidden = true;/s);
    assert.match(centerSource, /if \(options\.discover\) startRecommendationCenterProgress\(refresh\)/);
    assert.match(centerSource, /if \(options\.discover\) stopRecommendationCenterProgress\(refresh\)/);
    assert.doesNotMatch(centerSource, /새로운 발견을 준비하는 중입니다/);
});

test('dashboard cards expose only the latest recommendation evidence', () => {
    const centerSource = readScript('features/dashboard/recommendations.js');

    assert.match(centerSource, /function recommendationCenterLatestEvidence\(item\)/);
    assert.match(centerSource, /evidence\?\.observed_at \|\| evidence\?\.source\?\.timestamp/);
    assert.match(centerSource, /\.slice\(0, 1\)/);
    assert.match(centerSource, /recommendationCenterLatestEvidence\(item\)\.forEach/);
    assert.match(centerSource, /recommendationButton\('추천 근거', 'evidence'/);
    assert.match(centerSource, /recommendationButton\('관심 없음', 'dismiss', 'secondary ui-danger-action recommendation-dismiss'\)/);
    assert.doesNotMatch(centerSource, /`추천 근거 \$\{evidence\.children\.length\}개`/);
});
