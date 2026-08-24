const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const scriptsRoot = path.join(repoRoot, 'ui', 'scripts');

const controllerContracts = Object.freeze({
    'features/content/trend-table.js': ['renderBlogTrendsTable', 'loadBlogTrends'],
    'features/discovery/trend-collection.js': ['runBlogTrendsCollect', 'runTrendsToTopics'],
    'features/content/blog-tabs.js': ['activateBlogTab'],
    'features/discovery/quick-discovery.js': ['setQuickDiscoveryModalOpen', 'loadQuickKeywordDiscovery', 'loadQuickTopicRecommendations'],
    'features/discovery/trend-posting.js': ['queryTrendPostingKeywords', 'saveTrendPostingTopic'],
    'features/discovery/naver-comment-draft.js': ['runNaverCommentDraft', 'redraftNaverCommentDraft'],
    'features/content/tab-navigation.js': ['activateShoppingTab'],
    'features/content/blog-topics.js': ['renderBlogTable', 'loadBlogTopics'],
    'features/content/shopping-items.js': ['renderBlogShoppingTable', 'loadBlogShopping', 'startShoppingInlineEdit'],
    'features/content/blog-batch.js': ['runBlogBatchAction']
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
        readScript('features/content/blog-tabs.js'),
        readScript('features/content/blog-topics.js'),
        readScript('features/publishing/wordpress-controls.js')
    ].join('\n');

    assert.doesNotMatch(uiScripts, /\bglobalWpCategoryCache\b/);
    assert.doesNotMatch(uiScripts, /window\.categoryCache\b/);
});

test('topic recommendation labels never guess that unknown evidence came from user writing', () => {
    const source = readScript('features/discovery/quick-discovery.js');
    assert.match(source, /topic_facet/);
    assert.match(source, /저장한 관심 주제/);
    assert.match(source, /근거 확인 필요/);
    assert.doesNotMatch(source, /return '내 글쓰기 기반'/);
});

test('topic recommendation continuation is explicit and uses user-facing language', () => {
    const source = readScript('features/discovery/quick-discovery.js');
    const stateSource = readScript('features/discovery/state.js');
    const modalFunction = source.match(/function setQuickDiscoveryModalOpen[\s\S]*?\n}\n/)?.[0] || '';

    assert.match(stateSource, /smartUsage:\s*null/);
    assert.doesNotMatch(modalFunction, /quickTopicRecommendationState\.smartUsageSessionId\s*=/);
    assert.match(source, /return quickTopicNeedsAnotherUse\(\) \? '계속 추천받기'/);
    assert.match(source, /추천을 만들지 못하면 횟수는 사용되지 않습니다/);
    assert.match(source, /한 번 더 새로운 글감을 받아볼 수 있어요/);
    assert.match(source, /새 추천을 준비하고 있어요/);
    assert.match(source, /localRemaining !== null && localLimit !== null/);
    assert.doesNotMatch(source, /이번 추천 세션/);
});

test('older account responses cannot overwrite newer smart usage', () => {
    const accountSource = readScript('features/shell/account-overview.js');
    const dashboardSource = readScript('features/shell/dashboard.js');

    assert.match(accountSource, /function reconcileAccountSmartUsage/);
    assert.match(accountSource, /requestRevision >= smartUsageRevision/);
    assert.match(accountSource, /renderAccountOverview\(overview, \{ smartUsageRevisionAtRequest \}\)/);
    assert.match(dashboardSource, /renderAccountOverview\(accountOverview, \{ smartUsageRevisionAtRequest \}\)/);
});
