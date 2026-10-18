const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

test('generic Agent suggestion results do not materialize suggestion rows', () => {
    const source = fs.readFileSync(path.join(ROOT, 'src/adapters/storage/memory/sqlite-event-store.js'), 'utf8');
    assert.doesNotMatch(source, /agent\.suggestions|_upsertSuggestion/);
    assert.match(source, /agent\.confirmation\.requested[\s\S]{0,1200}_upsertConfirmation/);
});

test('retired suggestions feature root stays removed', () => {
    assert.equal(fs.existsSync(path.join(ROOT, 'src/suggestions')), false);
});

test('Telegram routes recommendation feedback through the canonical callback only', () => {
    const source = fs.readFileSync(path.join(ROOT, 'src/telegram-bot.service.js'), 'utf8');
    assert.match(source, /verb === 'rec_fb'/);
    assert.doesNotMatch(source, /suggest_feedback/);
});

test('producer runtime stays independent from policy, lifecycle, legacy suggestions and UI', () => {
    const source = fs.readFileSync(path.join(ROOT, 'src/services/recommendations/producers/runtime.js'), 'utf8');
    assert.match(source, /validateRecommendationCandidate/);
    assert.doesNotMatch(source, /topic-ranking-policy|recommendation-materializer|lifecycle-store/);
    assert.doesNotMatch(source, /src\/suggestions|telegram|ui-server|ui\//i);
    assert.doesNotMatch(source, /\.materialize\(|policy_id|recommendation\.created/);
});

test('content producer stays on canonical Knowledge and candidate boundaries', () => {
    const files = [
        'src/services/recommendations/producers/content-query-plan.js',
        'src/services/recommendations/producers/content-knowledge-collector.js',
        'src/services/recommendations/producers/content-opportunity.js'
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
        'src/services/recommendations/producers/operational-state-collector.js',
        'src/services/recommendations/producers/operational-candidate.js',
        'src/services/recommendations/producers/setup-guidance.js',
        'src/services/recommendations/producers/job-recovery.js',
        'src/services/recommendations/producers/pending-workflow.js'
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
        'src/services/recommendations/producers/commerce-grounding.js',
        'src/services/recommendations/producers/commerce-opportunity.js'
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
        'src/services/recommendations/policy/context.js',
        'src/services/recommendations/policy/requirements.js',
        'src/services/recommendations/policy/eligibility.js',
        'src/services/recommendations/policy/scoring.js',
        'src/services/recommendations/policy/diversity.js',
        'src/services/recommendations/policy/ranking.js'
    ];
    const source = files.map((file) => fs.readFileSync(path.join(ROOT, file), 'utf8')).join('\n');
    assert.doesNotMatch(source, /require\(['"]\.\.\/\.\.\/config-loader/);
    assert.doesNotMatch(source, /require\(['"]\.\.\/\.\.\/license['"]\)/);
    assert.doesNotMatch(source, /telegram|ui-server|ui\//i);
    assert.doesNotMatch(source, /naver-news|naver-trends|serpapi|raw_response/i);
    assert.doesNotMatch(source, /recommendation\.created|\.materialize\(/);
});

test('policy evaluator is the only policy layer allowed to call the existing materializer', () => {
    const source = fs.readFileSync(path.join(ROOT, 'src/services/recommendations/policy/evaluator.js'), 'utf8');
    assert.match(source, /materializer\.materialize/);
    assert.doesNotMatch(source, /recommendation\.created|transitionRecommendation|saveEventAndProjection/);
    assert.doesNotMatch(source, /config-loader|require\(['"]\.\.\/\.\.\/license['"]\)/);
    assert.doesNotMatch(source, /telegram|ui-server|ui\/|naver-news|naver-trends|serpapi/i);
});

test('trusted handoff resolves stored recommendation actions without client or channel authority', () => {
    const source = fs.readFileSync(path.join(ROOT, 'src/services/recommendations/handoff/service.js'), 'utf8');
    assert.match(source, /recommendationStore\.getRecommendation/);
    assert.match(source, /capabilityRegistry\.validateAction/);
    assert.match(source, /capabilityRegistry\.executeAction/);
    assert.doesNotMatch(source, /input\.(?:capability|params|requires_confirmation)/);
    assert.doesNotMatch(source, /config-loader|require\(['"]\.\.\/\.\.\/license['"]\)/);
    assert.doesNotMatch(source, /telegram|ui-server|ui\/|naver-news|naver-trends|serpapi/i);
});
