const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const scriptsRoot = path.join(repoRoot, 'ui', 'scripts');

const controllerContracts = Object.freeze({
    'features/content-workspace/workspace-tables.js': ['renderTopicsPagination', 'toggleTableSort'],
    'features/blog/discovery/quick-discovery.js': ['setQuickDiscoveryModalOpen', 'loadQuickKeywordDiscovery', 'loadQuickTopicRecommendations'],
    'features/shopping/tab-navigation.js': ['activateShoppingTab'],
    'features/content-workspace/blog-topics.js': ['renderBlogTable', 'loadBlogTopics'],
    'features/shopping/items.js': ['renderBlogShoppingTable', 'loadBlogShopping', 'createShoppingManagementItem'],
});

function readScript(relativePath) {
    return fs.readFileSync(path.join(scriptsRoot, relativePath), 'utf8');
}

function functionDeclarationPattern(functionName) {
    return new RegExp(`(?:async\\s+)?function\\s+${functionName}\\s*\\(`, 'g');
}

test('discovery and content controllers have one explicit feature owner', () => {
    const sources = Object.fromEntries(
        Object.keys(controllerContracts).map((relativePath) => [relativePath, readScript(relativePath)])
    );
    const combinedSource = Object.values(sources).join('\n');

    Object.entries(controllerContracts).forEach(([ownerPath, functionNames]) => {
        functionNames.forEach((functionName) => {
            assert.match(sources[ownerPath], functionDeclarationPattern(functionName));
            assert.equal(
                Array.from(combinedSource.matchAll(functionDeclarationPattern(functionName))).length,
                1,
                `${functionName} must have one discovery/content owner`
            );
        });
    });
});

test('temporary feature modules no longer own discovery and content controllers', () => {
    const featureRoot = path.join(scriptsRoot, 'features');
    const legacySource = fs.readdirSync(featureRoot)
        .filter((name) => name.startsWith('legacy-') && name.endsWith('.js'))
        .map((name) => readScript(`features/${name}`))
        .join('\n');

    Object.values(controllerContracts).flat().forEach((functionName) => {
        assert.doesNotMatch(legacySource, functionDeclarationPattern(functionName));
    });
});

test('WordPress category consumers use the shared lexical cache contract', () => {
    const uiScripts = [
        readScript('features/content-workspace/blog-topics.js'),
        readScript('shared/publishing/wordpress-controls.js')
    ].join('\n');

    assert.doesNotMatch(uiScripts, /\bglobalWpCategoryCache\b/);
    assert.doesNotMatch(uiScripts, /window\.categoryCache\b/);
});

test('topic recommendation labels never guess that unknown evidence came from user writing', () => {
    const source = readScript('features/blog/discovery/quick-discovery.js');
    assert.match(source, /topic_facet/);
    assert.match(source, /저장한 관심 주제/);
    assert.match(source, /근거 확인 필요/);
    assert.doesNotMatch(source, /return '내 글쓰기 기반'/);
});

test('topic recommendation continuation is explicit and uses user-facing language', () => {
    const source = readScript('features/blog/discovery/quick-discovery.js');
    const stateSource = readScript('features/blog/discovery/state.js');
    const modalFunction = source.match(/function setQuickDiscoveryModalOpen[\s\S]*?\n}\n/)?.[0] || '';

    assert.match(stateSource, /smartUsage:\s*null/);
    assert.doesNotMatch(modalFunction, /quickTopicRecommendationState\.smartUsageSessionId\s*=/);
    assert.match(source, /function getQuickTopicRefreshLabel\(\) \{\s*return '글감 추천';\s*\}/);
    assert.match(source, /추천을 만들지 못하면 횟수는 사용되지 않습니다/);
    assert.match(source, /한 번 더 새로운 글감을 받아볼 수 있어요/);
    assert.match(source, /새 추천을 준비하고 있어요/);
    assert.match(source, /localRemaining !== null && localLimit !== null/);
    assert.doesNotMatch(source, /이번 추천 세션/);
});

test('older account responses cannot overwrite newer smart usage', () => {
    const accountSource = readScript('shell/account-overview.js');

    assert.match(accountSource, /function reconcileAccountSmartUsage/);
    assert.match(accountSource, /requestRevision >= smartUsageRevision/);
    assert.match(accountSource, /renderAccountOverview\(overview, \{ smartUsageRevisionAtRequest \}\)/);
});

test('applying discovered keywords preserves an existing quick-writing subject', () => {
    const source = readScript('features/blog/discovery/quick-discovery.js');
    const applyFunction = source.match(/async function applyQuickKeywordDiscovery[\s\S]*?\n}\n/)?.[0] || '';

    assert.match(applyFunction, /const subjectInput = getQuickDiscoveryInputElement\('subject'\)/);
    assert.match(applyFunction, /if \(subjectInput && !String\(subjectInput\.value \|\| ''\)\.trim\(\)\)/);
    assert.match(applyFunction, /subjectInput\.value = keywords\[0\]/);
    assert.doesNotMatch(applyFunction, /writeQuickDiscoveryInput\('subject', keywords\[0\]\)/);
});
