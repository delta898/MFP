const test = require('node:test');
const assert = require('node:assert/strict');
const { createTopicRecommendationsService } = require('./topic-recommendations.service');

test('추천 목록은 지능형 런타임을 호출하고 TTL 동안 재사용한다', async () => {
    let runtimeCalls = 0;
    let retrievalInput = null;
    let nowMs = 1000;
    const service = createTopicRecommendationsService({
        now: () => nowMs,
        cacheTtlMs: 100,
        eventStore: {
            getLocalOwnerIdentity() { return { owner_user_id: 'local:owner-1' }; }
        },
        retrievalService: {
            async buildContextPacket(input) {
                retrievalInput = input;
                return { owner_memory: { owner_user_id: input.ownerUserId } };
            }
        },
        agentRuntime: {
            async handleParsedEnvelope(envelope, context) {
                runtimeCalls += 1;
                assert.equal(envelope.actions[0].domain, 'content.idea');
                assert.equal(envelope.actions[0].params.query, '워드프레스');
                assert.equal(context.channel, 'ui');
                return {
                    status: 'completed',
                    results: [{
                        result: {
                            success: true,
                            data: { ideas: [{ id: 'idea-1', title: '추천 1' }, { id: 'idea-2', title: '추천 2' }] }
                        }
                    }]
                };
            }
        }
    });

    const first = await service.getRecommendations({ limit: 2, query: ' 워드프레스 ', requestId: 'req-1' });
    const second = await service.getRecommendations({ limit: 1, query: '워드프레스', requestId: 'req-2' });
    assert.equal(first.cached, false);
    assert.equal(second.cached, true);
    assert.equal(second.ideas.length, 1);
    assert.equal(runtimeCalls, 1);
    assert.equal(retrievalInput.ownerUserId, 'local:owner-1');

    nowMs = 1200;
    await service.getRecommendations({ limit: 2, query: '워드프레스', requestId: 'req-3' });
    assert.equal(runtimeCalls, 2);
});

test('different topic hints do not share a recommendation cache entry', async () => {
    const queries = [];
    const service = createTopicRecommendationsService({
        retrievalService: { buildContextPacket: async () => ({}) },
        agentRuntime: {
            async handleParsedEnvelope(envelope) {
                queries.push(envelope.actions[0].params.query);
                return { status: 'completed', results: [{ result: { success: true, data: { ideas: [] } } }] };
            }
        }
    });

    await service.getRecommendations({ query: '오사카 여행' });
    await service.getRecommendations({ query: '아이폰 17' });
    await service.getRecommendations({ query: '오사카 여행' });

    assert.deepEqual(queries, ['오사카 여행', '아이폰 17']);
});

test('refresh는 캐시를 우회하고 outcome만 명시적 학습 신호로 기록한다', async () => {
    let runtimeCalls = 0;
    let recorded = null;
    const service = createTopicRecommendationsService({
        eventStore: { getLocalOwnerIdentity: () => ({ owner_user_id: 'local:owner-2' }) },
        retrievalService: { buildContextPacket: async () => ({}) },
        agentRuntime: {
            async handleParsedEnvelope() {
                runtimeCalls += 1;
                return {
                    status: 'completed',
                    results: [{ result: { success: true, data: { ideas: [] } } }]
                };
            }
        },
        learningService: {
            async recordOutcome(input) {
                recorded = input;
                return { recorded: true };
            }
        }
    });

    await service.getRecommendations({});
    await service.getRecommendations({ refresh: true });
    assert.equal(runtimeCalls, 2);

    await service.recordOutcome({
        stage: 'feedback',
        subject: '추천 글감',
        feedback: 'not_helpful',
        recommendation: { run_id: 'run-1', candidate_id: 'candidate-1' }
    });
    assert.equal(recorded.stage, 'feedback');
    assert.equal(recorded.owner_user_id, 'local:owner-2');
    assert.equal(recorded.provenance.surface, 'blog.quick');
});

test('캐시되지 않은 글감 생성만 스마트 사용량 세션으로 처리한다', async () => {
    const usageCalls = [];
    const service = createTopicRecommendationsService({
        retrievalService: { buildContextPacket: async () => ({}) },
        agentRuntime: {
            async handleParsedEnvelope() {
                return { status: 'completed', results: [{ result: { success: true, data: { ideas: [] } } }] };
            }
        },
        smartUsageService: {
            async run(capability, input, action) {
                usageCalls.push({ capability, input });
                return { result: await action(), sessionId: input.sessionId, usage: { capability, remaining: 19 } };
            }
        }
    });

    const first = await service.getRecommendations({ sessionId: 'topic-session', operationId: 'topic-op' });
    await service.getRecommendations({ sessionId: 'topic-session', operationId: 'topic-op-2' });

    assert.equal(first.smart_usage.remaining, 19);
    assert.equal(usageCalls.length, 1);
    assert.equal(usageCalls[0].capability, 'content_idea');
});
