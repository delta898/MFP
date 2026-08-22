const test = require('node:test');
const assert = require('node:assert/strict');
const { createRecommendation } = require('./test-fixtures');
const {
    TRANSITIONS,
    assertTransition,
    buildRecommendationEventId,
    buildRecommendationEvent,
    applyRecommendationEvent
} = require('./lifecycle');

test('lifecycle은 허용된 상태 전이를 모두 적용한다', () => {
    for (const [eventType, rule] of Object.entries(TRANSITIONS)) {
        for (const from of rule.from) assert.equal(assertTransition(eventType, from), rule.to);
    }
});

test('terminal 상태와 잘못된 상태 전이를 거부한다', () => {
    assert.throws(() => assertTransition('recommendation.snoozed', 'dismissed'), /허용되지/);
    assert.throws(() => assertTransition('recommendation.action_completed', 'available'), /허용되지/);
    assert.throws(() => assertTransition('recommendation.unknown', 'available'), /지원되지/);
});

test('stable event id는 operation retry에서 동일하다', () => {
    const input = { owner_user_id: 'owner-1', recommendation_id: 'rec-1', event_type: 'recommendation.opened', operation_id: 'open-1' };
    assert.equal(buildRecommendationEventId(input), buildRecommendationEventId(input));
    assert.notEqual(buildRecommendationEventId(input), buildRecommendationEventId({ ...input, operation_id: 'open-2' }));
});

test('snooze event와 reducer는 snoozed_until을 projection에 반영한다', () => {
    const current = createRecommendation();
    const event = buildRecommendationEvent({
        owner_user_id: current.owner_user_id,
        recommendation_id: current.recommendation_id,
        event_type: 'recommendation.snoozed',
        operation_id: 'snooze-1',
        occurred_at: '2026-08-23T02:00:00.000Z',
        snoozed_until: '2026-08-23T04:00:00.000Z'
    }, current);
    const next = applyRecommendationEvent(current, event);
    assert.equal(next.status, 'snoozed');
    assert.equal(next.snoozed_until, '2026-08-23T04:00:00.000Z');
});

test('observational event는 projection state를 변경하지 않는다', () => {
    const current = createRecommendation();
    const event = buildRecommendationEvent({
        owner_user_id: current.owner_user_id,
        recommendation_id: current.recommendation_id,
        event_type: 'recommendation.opened',
        operation_id: 'open-1',
        occurred_at: '2026-08-23T02:00:00.000Z'
    }, current);
    assert.deepEqual(applyRecommendationEvent(current, event), current);
});

test('recommendation feedback event는 상태를 바꾸지 않는다', () => {
    const current = createRecommendation();
    const event = buildRecommendationEvent({
        owner_user_id: current.owner_user_id,
        recommendation_id: current.recommendation_id,
        event_type: 'recommendation.feedback_recorded',
        operation_id: 'feedback-1',
        occurred_at: '2026-08-23T02:00:00.000Z',
        feedback: 'helpful'
    }, current);
    assert.equal(event.payload.feedback, 'helpful');
    assert.deepEqual(applyRecommendationEvent(current, event), current);
});

test('created event snapshot만으로 projection을 재생한다', () => {
    const recommendation = createRecommendation();
    const event = buildRecommendationEvent({
        owner_user_id: recommendation.owner_user_id,
        recommendation_id: recommendation.recommendation_id,
        event_type: 'recommendation.created',
        operation_id: 'create-1',
        occurred_at: recommendation.last_event_at
    }, { ...recommendation, status: null });
    event.payload.recommendation = recommendation;
    assert.equal(applyRecommendationEvent(null, event).recommendation_id, recommendation.recommendation_id);
});
