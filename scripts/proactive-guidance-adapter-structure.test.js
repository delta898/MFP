const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

test('generic Agent suggestion results no longer materialize SuggestionNode', () => {
    const source = fs.readFileSync(path.join(ROOT, 'src/memory/event-store.js'), 'utf8');
    assert.doesNotMatch(source, /action\.domain[^\n]+agent\.suggestions[\s\S]{0,1200}_upsertSuggestionNode/);
    assert.match(source, /agent\.confirmation\.requested[\s\S]{0,900}_upsertSuggestionNode/);
});

test('legacy suggestions provider remains a thin compatibility facade', () => {
    const source = fs.readFileSync(path.join(ROOT, 'src/suggestions/providers/memory-based.js'), 'utf8');
    assert.equal(source.trim().split(/\r?\n/).length <= 3, true);
    assert.doesNotMatch(source, /Date\.now|dedupe_key|policy_id/);
});

test('Telegram keeps historic feedback callbacks beside canonical callbacks', () => {
    const source = fs.readFileSync(path.join(ROOT, 'src/telegram-bot.service.js'), 'utf8');
    assert.match(source, /verb === 'rec_fb'/);
    assert.match(source, /verb === 'suggest_feedback'/);
});

test('producer runtime stays independent from policy, lifecycle, legacy suggestions and UI', () => {
    const source = fs.readFileSync(path.join(ROOT, 'src/recommendations/producers/runtime.js'), 'utf8');
    assert.match(source, /validateRecommendationCandidate/);
    assert.doesNotMatch(source, /topic-ranking-policy|recommendation-materializer|lifecycle-store/);
    assert.doesNotMatch(source, /src\/suggestions|telegram|ui-server|ui\//i);
    assert.doesNotMatch(source, /\.materialize\(|policy_id|recommendation\.created/);
});

test('content producer stays on canonical Knowledge and candidate boundaries', () => {
    const files = [
        'src/recommendations/producers/content-query-plan.js',
        'src/recommendations/producers/content-knowledge-collector.js',
        'src/recommendations/producers/content-opportunity.js'
    ];
    const source = files.map((file) => fs.readFileSync(path.join(ROOT, file), 'utf8')).join('\n');
    assert.match(source, /normalizeKnowledgeSnapshot/);
    assert.doesNotMatch(source, /topic-ranking-policy|recommendation-materializer|lifecycle-store/);
    assert.doesNotMatch(source, /src\/suggestions|telegram|ui-server|ui\//i);
    assert.doesNotMatch(source, /naver-news|naver-trends|serpapi/i);
    assert.doesNotMatch(source, /policy_id|recommendation\.created|capability_id/);
});

test('operational producers use sanitized state without policy, lifecycle or channel coupling', () => {
    const files = [
        'src/recommendations/producers/operational-state-collector.js',
        'src/recommendations/producers/operational-candidate.js',
        'src/recommendations/producers/setup-guidance.js',
        'src/recommendations/producers/job-recovery.js',
        'src/recommendations/producers/pending-workflow.js'
    ];
    const source = files.map((file) => fs.readFileSync(path.join(ROOT, file), 'utf8')).join('\n');
    assert.doesNotMatch(source, /require\(['"]\.\.\/\.\.\/config-loader/);
    assert.doesNotMatch(source, /topic-ranking-policy|recommendation-materializer|lifecycle-store/);
    assert.doesNotMatch(source, /src\/suggestions|telegram|ui-server|ui\//i);
    assert.doesNotMatch(source, /policy_id|recommendation\.created|capability_id|\.materialize\(/);
    assert.doesNotMatch(source, /result_json|raw_response/);
});

test('commerce producer uses canonical Knowledge and owner activity without policy or provider coupling', () => {
    const files = [
        'src/recommendations/producers/commerce-grounding.js',
        'src/recommendations/producers/commerce-opportunity.js'
    ];
    const source = files.map((file) => fs.readFileSync(path.join(ROOT, file), 'utf8')).join('\n');
    assert.match(source, /normalizeKnowledgeSnapshot/);
    assert.doesNotMatch(source, /topic-ranking-policy|recommendation-materializer|lifecycle-store/);
    assert.doesNotMatch(source, /src\/suggestions|telegram|ui-server|ui\//i);
    assert.doesNotMatch(source, /naver-news|naver-trends|serpapi/i);
    assert.doesNotMatch(source, /policy_id|recommendation\.created|capability_id|\.materialize\(/);
    assert.doesNotMatch(source, /판매량|전환율|매출|수익률/);
});

test('recommendation policy reads sanitized injected facts without UI, provider or singleton coupling', () => {
    const files = [
        'src/recommendations/policy/context.js',
        'src/recommendations/policy/requirements.js',
        'src/recommendations/policy/eligibility.js'
    ];
    const source = files.map((file) => fs.readFileSync(path.join(ROOT, file), 'utf8')).join('\n');
    assert.doesNotMatch(source, /require\(['"]\.\.\/\.\.\/config-loader/);
    assert.doesNotMatch(source, /require\(['"]\.\.\/\.\.\/license['"]\)/);
    assert.doesNotMatch(source, /telegram|ui-server|ui\//i);
    assert.doesNotMatch(source, /naver-news|naver-trends|serpapi|raw_response/i);
    assert.doesNotMatch(source, /recommendation\.created|\.materialize\(/);
});
