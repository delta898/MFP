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
                recent_artifacts: [{
                    id: 'a1',
                    title: '과거 글감',
                    artifact_type: 'content_idea',
                    payload: { recommendation: { candidate_id: 'old-candidate' } }
                }]
            }
        }
    });

    assert.equal(generatorInput.ownerProfile.owner_user_id, 'local:test');
    assert.equal(generatorInput.recentArtifacts[0].id, 'a1');
    assert.deepEqual(generatorInput.excludedCandidateIds, ['old-candidate']);
    assert.equal(providerContext.recommendationCandidates[0].id, 'candidate-1');
    assert.equal(result.candidates[0].id, 'candidate-1');
    assert.equal(result.ideas[0].title, 'AI 트렌드를 실무에 적용하는 법');
    assert.equal(result.ideas[0].recommendation.candidate_id, 'candidate-1');
    assert.equal(result.ideas[0].recommendation.policy_id, 'topic-ranking-v1');
    assert.match(result.recommendation_run.id, /^topic_recommendation_run_/);
});

test('keeps the candidate pool broad but sends one recommendation per source to the AI provider', async () => {
    let generatorLimit = 0;
    let providerCandidates = [];
    const engine = createContentIdeaEngine({
        candidateGenerator: {
            generate(input) {
                generatorLimit = input.limit;
                return {
                    candidates: [
                        {
                            id: 'trend-1',
                            candidate_type: 'trend_seed',
                            topic_seed: '오늘의 트렌드',
                            trend: { trend_date: new Date().toISOString(), change_type: 'new' },
                            explanation: '외부 트렌드'
                        },
                        {
                            id: 'profile-1',
                            candidate_type: 'profile_seed',
                            topic_seed: '관심 주제',
                            explanation: '관심 주제'
                        },
                        {
                            id: 'activity-1',
                            candidate_type: 'activity_seed',
                            topic_seed: '최근 활동',
                            explanation: '최근 활동'
                        },
                        {
                            id: 'trend-2',
                            candidate_type: 'trend_seed',
                            topic_seed: '추가 트렌드',
                            trend: { trend_date: new Date().toISOString(), change_type: 'new' },
                            explanation: '추가 외부 트렌드'
                        }
                    ],
                    source_counts: { trend_seed: 2, profile_seed: 1, activity_seed: 1 }
                };
            }
        },
        providers: [{
            id: 'test-provider',
            async generate(_input, context) {
                providerCandidates = context.recommendationCandidates;
                return {
                    ideas: providerCandidates.map((candidate) => ({
                        candidate_id: candidate.id,
                        title: `${candidate.topic_seed} 글감`
                    }))
                };
            }
        }]
    });

    const result = await engine.generateIdeas({ limit: 3 });

    assert.equal(generatorLimit, 30);
    assert.equal(providerCandidates.length, 3);
    assert.deepEqual(
        providerCandidates.map((candidate) => candidate.candidate_type).sort(),
        ['activity_seed', 'profile_seed', 'trend_seed']
    );
    assert.equal(result.ideas.length, 3);
});
