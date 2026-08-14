const test = require('node:test');
const assert = require('node:assert/strict');
const { createContentIdeaEngine } = require('./engine');

test('passes owner/trend candidates to content idea providers', async () => {
    let generatorInput = null;
    let providerContext = null;
    const engine = createContentIdeaEngine({
        knowledgeRegistry: {
            async fetchForRoute() {
                return [{ provider_id: 'naver-trends', kind: 'trends', items: [{ title: 'AI 트렌드' }] }];
            }
        },
        candidateGenerator: {
            generate(input) {
                generatorInput = input;
                return { candidates: [{ id: 'candidate-1', topic_seed: 'AI 트렌드', explanation: 'fixture' }] };
            }
        },
        providers: [{
            async generate(_input, context) {
                providerContext = context;
                return { ideas: [{ candidate_id: 'candidate-1', title: 'AI 트렌드를 실무에 적용하는 법', summary: '', reason: '', keywords: ['AI'] }] };
            }
        }]
    });

    const result = await engine.generateIdeas({ query: 'AI', limit: 3 }, {
        memory: {
            owner_memory: {
                profile: { owner_user_id: 'local:test' },
                recent_artifacts: [{ id: 'a1', title: '과거 글감' }]
            }
        }
    });

    assert.equal(generatorInput.ownerProfile.owner_user_id, 'local:test');
    assert.equal(generatorInput.recentArtifacts[0].id, 'a1');
    assert.equal(providerContext.recommendationCandidates[0].id, 'candidate-1');
    assert.equal(result.candidates[0].id, 'candidate-1');
    assert.equal(result.ideas[0].title, 'AI 트렌드를 실무에 적용하는 법');
    assert.equal(result.ideas[0].recommendation.candidate_id, 'candidate-1');
    assert.equal(result.ideas[0].recommendation.policy_id, 'topic-ranking-v1');
    assert.match(result.recommendation_run.id, /^topic_recommendation_run_/);
});
