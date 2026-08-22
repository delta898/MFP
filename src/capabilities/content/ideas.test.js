const test = require('node:test');
const assert = require('node:assert/strict');
const { createContentIdeaCapabilities } = require('./ideas');

test('content idea capability keeps response shape and adds canonical recommendation id', async () => {
    const capability = createContentIdeaCapabilities({
        eventStore: { getLocalOwnerIdentity: () => ({ owner_user_id: 'owner-local' }) },
        contentIdeaEngine: {
            async generateIdeas() {
                return {
                    ideas: [{ id: 'idea-1', candidate_id: 'topic_candidate_1', title: 'AI 검색 변화', summary: '검색 변화', reason: '최근 트렌드', recommendation: { run_id: 'run-1', candidate_id: 'topic_candidate_1' } }],
                    candidates: [{ id: 'topic_candidate_1', candidate_type: 'trend_seed', topic_seed: 'AI 검색', source_refs: [{ kind: 'knowledge', provider_id: 'trends', transport: 'builtin_api' }], ranking: { policy_id: 'topic-ranking-v1', policy_version: 1, score: 20, rank: 1, breakdown: [] } }],
                    recommendation_run: { id: 'run-1' }, ranking: { selected_count: 1 }
                };
            }
        },
        recommendationMaterializer: {
            async materialize() { return { persisted: true, recommendation: { recommendation_id: 'rec_topic_1' } }; }
        }
    })[0];
    const result = await capability.execute({ limit: 1 }, { memory: { owner_memory: { owner_user_id: 'owner-local' } } });
    assert.equal(result.success, true);
    assert.equal(result.data.ideas[0].id, 'idea-1');
    assert.equal(result.data.ideas[0].recommendation.recommendation_id, 'rec_topic_1');
    assert.deepEqual(result.data.ranking, { selected_count: 1 });
});
