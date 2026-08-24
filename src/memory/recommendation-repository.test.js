const test = require('node:test');
const assert = require('node:assert/strict');
const { createRecommendation } = require('../recommendations/core/test-fixtures');
const {
    MIGRATION_ID,
    parseRecommendationRow,
    KuzuRecommendationRepository
} = require('./recommendation-repository');

function emptyResult(rows = []) {
    let index = 0;
    return {
        hasNext() { return index < rows.length; },
        async getNext() { return rows[index++]; }
    };
}

test('schema initialization은 Recommendation schema marker만 만들고 SuggestionNode를 읽지 않는다', async () => {
    const calls = [];
    const repository = new KuzuRecommendationRepository({
        executeQuery: async (query, params) => {
            calls.push({ query, params });
            return emptyResult();
        }
    });
    await repository.initializeSchema();
    assert.equal(calls.some((call) => call.query.includes('RecommendationNode')), true);
    assert.equal(calls.some((call) => call.query.includes('SuggestionNode')), false);
    assert.equal(calls.at(-1).params.id, MIGRATION_ID);
    assert.deepEqual(JSON.parse(calls.at(-1).params.details_json), { historic_suggestion_backfill: false });
});

test('event와 projection은 transaction 안에서 owner relation까지 함께 저장한다', async () => {
    const calls = [];
    const recommendation = createRecommendation();
    const event = {
        id: 'recommendation_event:abc',
        event_type: 'recommendation.created',
        timestamp: recommendation.last_event_at,
        payload: { recommendation_id: recommendation.recommendation_id }
    };
    const repository = new KuzuRecommendationRepository({
        executeQuery: async (query, params) => {
            calls.push({ query, params });
            return emptyResult();
        },
        ensureOwner: async () => true
    });
    await repository.saveEventAndProjection(event, recommendation);
    assert.equal(calls[0].query, 'BEGIN TRANSACTION');
    assert.equal(calls.at(-1).query, 'COMMIT');
    assert.equal(calls.some((call) => call.query.includes('EventHAS_RECOMMENDATION')), true);
    assert.equal(calls.some((call) => call.query.includes('OwnerOWNS_RECOMMENDATION')), true);
    assert.equal(calls.some((call) => call.query.includes('OwnerOWNS_EVENT')), true);
});

test('projection 저장 실패는 transaction을 rollback하고 오류를 숨기지 않는다', async () => {
    const calls = [];
    const recommendation = createRecommendation();
    const repository = new KuzuRecommendationRepository({
        executeQuery: async (query) => {
            calls.push(query);
            if (query.includes('MERGE (r:RecommendationNode')) throw new Error('projection failed');
            return emptyResult();
        }
    });
    await assert.rejects(repository.saveEventAndProjection({
        id: 'recommendation_event:abc', event_type: 'recommendation.created',
        timestamp: recommendation.last_event_at, payload: {}
    }, recommendation), /projection failed/);
    assert.equal(calls.at(-1), 'ROLLBACK');
    assert.equal(calls.includes('COMMIT'), false);
});

test('projection row parser는 JSON과 indexed identity 불일치를 거부한다', () => {
    const recommendation = createRecommendation();
    assert.equal(parseRecommendationRow({
        id: recommendation.recommendation_id,
        owner_user_id: recommendation.owner_user_id,
        recommendation_json: JSON.stringify(recommendation)
    }).status, 'available');
    assert.throws(() => parseRecommendationRow({
        id: 'different-id',
        owner_user_id: recommendation.owner_user_id,
        recommendation_json: JSON.stringify(recommendation)
    }), /identity/);
});

test('목록 조회는 query에 선언된 Kuzu parameter만 전달한다', async () => {
    const calls = [];
    const repository = new KuzuRecommendationRepository({
        executeQuery: async (query, params) => {
            calls.push({ query, params });
            return emptyResult();
        }
    });

    await repository.list('owner-local', { limit: 6 });
    await repository.list('owner-local', { limit: 6, status: 'available' });

    assert.deepEqual(calls[0].params, { owner_id: 'owner-local', limit: 6 });
    assert.deepEqual(calls[1].params, { owner_id: 'owner-local', limit: 6, status: 'available' });
});

test('shared Kuzu connection의 recommendation transaction은 서로 겹치지 않는다', async () => {
    let activeTransactions = 0;
    let maximumActiveTransactions = 0;
    const repository = new KuzuRecommendationRepository({
        executeQuery: async (query) => {
            if (query === 'BEGIN TRANSACTION') {
                activeTransactions += 1;
                maximumActiveTransactions = Math.max(maximumActiveTransactions, activeTransactions);
                await new Promise((resolve) => setTimeout(resolve, 5));
            }
            if (query === 'COMMIT' || query === 'ROLLBACK') activeTransactions -= 1;
            return emptyResult();
        }
    });
    const first = createRecommendation();
    const second = createRecommendation({ recommendation_id: 'recommendation:second' });
    await Promise.all([
        repository.saveEventAndProjection({ id: 'event-1', event_type: 'recommendation.created', timestamp: first.last_event_at, payload: {} }, first),
        repository.saveEventAndProjection({ id: 'event-2', event_type: 'recommendation.created', timestamp: second.last_event_at, payload: {} }, second)
    ]);
    assert.equal(maximumActiveTransactions, 1);
});
