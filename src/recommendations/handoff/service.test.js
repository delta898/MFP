const test = require('node:test');
const assert = require('node:assert/strict');
const { ConfirmationStore } = require('../../agent/confirmation-store');
const { createRecommendation } = require('../core/test-fixtures');
const { createVolatileRecommendationStore } = require('../lifecycle-store');
const { createRecommendationHandoffService } = require('./service');

const TEST_NOW = '2026-08-23T03:00:00.000Z';

function registryFixture(options = {}) {
    let validationCount = 0;
    let executionCount = 0;
    let failCount = Number(options.failCount || 0);
    const capability = {
        id: options.id || 'content.register_topic.execute',
        type: 'content.register',
        confirmPolicy: options.confirmPolicy || 'required'
    };
    return {
        get validationCount() { return validationCount; },
        get executionCount() { return executionCount; },
        get(id) { return id === capability.id ? capability : null; },
        async validateAction(action) {
            validationCount += 1;
            if (options.invalidAt === validationCount) {
                return { ok: false, errors: ['현재 상태 invalid'], normalizedParams: null };
            }
            return { ok: true, errors: [], normalizedParams: { ...action.params, normalized: true } };
        },
        async previewAction(action) {
            return { kind: 'topic_registration', theme: action.params.theme };
        },
        async executeAction(action) {
            executionCount += 1;
            assert.equal(action.params.theme, '서버 저장 주제');
            assert.equal(action.params.normalized, true);
            if (failCount > 0) {
                failCount -= 1;
                const error = new Error('raw provider detail');
                error.code = 'temporary_failure';
                throw error;
            }
            return { success: true, message: '등록 완료', data: { count: 1 } };
        }
    };
}

async function fixture(options = {}) {
    const recommendationStore = createVolatileRecommendationStore({ reason: 'test' });
    const recommendation = createRecommendation({
        expires_at: options.expiresAt || createRecommendation().expires_at,
        candidate: {
            ...createRecommendation().candidate,
            handoff: options.handoff || {
                type: 'capability',
                label: '글감 등록',
                capability_id: 'content.register_topic.execute',
                params: { theme: '서버 저장 주제' },
                intent: '추천 글감을 등록합니다.'
            }
        }
    });
    await recommendationStore.createRecommendation(recommendation, { operation_id: 'create-handoff-test' });
    const capabilityRegistry = options.capabilityRegistry || registryFixture(options);
    const confirmationStore = options.confirmationStore || new ConfirmationStore();
    let operation = 0;
    const service = createRecommendationHandoffService({
        recommendationStore,
        capabilityRegistry,
        confirmationStore,
        now: () => new Date(TEST_NOW),
        operationIdFactory: () => `handoff:test:${++operation}`
    });
    const input = {
        ownerUserId: recommendation.owner_user_id,
        recommendationId: recommendation.recommendation_id
    };
    return { service, input, recommendationStore, capabilityRegistry, confirmationStore };
}

test('presentation handoff는 safe target만 반환하고 lifecycle을 바꾸지 않는다', async () => {
    const { service, input, recommendationStore } = await fixture({
        handoff: {
            type: 'presentation', label: '설정 열기',
            target: { surface: 'settings.wordpress', view: 'settings', tab: 'wordpress' },
            payload: { focus: 'url' }
        }
    });
    const result = await service.prepare(input);
    assert.equal(result.status, 'presentation');
    assert.equal(result.action.target.surface, 'settings.wordpress');
    assert.equal((await recommendationStore.getRecommendation(input.ownerUserId, input.recommendationId)).status, 'available');
});

test('client가 capability나 params를 주입하면 저장된 action을 실행하기 전에 거부한다', async () => {
    const { service, input, capabilityRegistry } = await fixture({ confirmPolicy: 'never' });
    await assert.rejects(service.prepare({
        ...input,
        capability_id: 'settings.blog_auto.disable',
        params: { enabled: false }
    }), (error) => error.code === 'untrusted_action_input');
    assert.equal(capabilityRegistry.executionCount, 0);
});

test('required capability는 preview만 만들고 승인 전 lifecycle을 유지한다', async () => {
    const { service, input, recommendationStore, confirmationStore, capabilityRegistry } = await fixture();
    const prepared = await service.prepare(input);
    assert.equal(prepared.status, 'confirmation_required');
    assert.deepEqual(prepared.confirmation.preview, { kind: 'topic_registration', theme: '서버 저장 주제' });
    assert.equal((await recommendationStore.getRecommendation(input.ownerUserId, input.recommendationId)).status, 'available');

    const confirmed = await service.decide({ ...input, confirmationId: prepared.confirmation.id, decision: 'accept' });
    assert.equal(confirmed.status, 'executed');
    assert.equal(capabilityRegistry.validationCount, 2);
    assert.equal(capabilityRegistry.executionCount, 1);
    assert.equal(confirmationStore.get(prepared.confirmation.id).status, 'executed');
    assert.equal((await recommendationStore.getRecommendation(input.ownerUserId, input.recommendationId)).status, 'action_completed');
});

test('confirmation 거절은 추천을 available로 남긴다', async () => {
    const { service, input, recommendationStore, capabilityRegistry } = await fixture();
    const prepared = await service.prepare(input);
    const rejected = await service.decide({ ...input, confirmationId: prepared.confirmation.id, decision: 'reject' });
    assert.equal(rejected.status, 'rejected');
    assert.equal(capabilityRegistry.executionCount, 0);
    assert.equal((await recommendationStore.getRecommendation(input.ownerUserId, input.recommendationId)).status, 'available');
});

test('승인 시점의 current-state validation 실패는 실행과 lifecycle 전이를 막는다', async () => {
    const capabilityRegistry = registryFixture({ invalidAt: 2 });
    const { service, input, recommendationStore } = await fixture({ capabilityRegistry });
    const prepared = await service.prepare(input);
    await assert.rejects(
        service.decide({ ...input, confirmationId: prepared.confirmation.id, decision: 'accept' }),
        (error) => error.code === 'capability_validation_failed'
    );
    assert.equal(capabilityRegistry.executionCount, 0);
    assert.equal((await recommendationStore.getRecommendation(input.ownerUserId, input.recommendationId)).status, 'available');
});

test('confirmPolicy never는 확인 없이 trusted action을 실행한다', async () => {
    const { service, input, recommendationStore, capabilityRegistry } = await fixture({ confirmPolicy: 'never' });
    const result = await service.prepare(input);
    assert.equal(result.status, 'executed');
    assert.equal(capabilityRegistry.executionCount, 1);
    assert.equal((await recommendationStore.getRecommendation(input.ownerUserId, input.recommendationId)).status, 'action_completed');
});

test('실행 실패는 action_failed로 기록되고 새 operation으로 재시도된다', async () => {
    const capabilityRegistry = registryFixture({ confirmPolicy: 'never', failCount: 1 });
    const { service, input, recommendationStore } = await fixture({ capabilityRegistry });
    await assert.rejects(service.prepare(input), (error) => error.code === 'capability_execution_failed');
    assert.equal((await recommendationStore.getRecommendation(input.ownerUserId, input.recommendationId)).status, 'action_failed');
    const retry = await service.prepare(input);
    assert.equal(retry.status, 'executed');
    assert.equal(capabilityRegistry.executionCount, 2);
    assert.equal((await recommendationStore.getRecommendation(input.ownerUserId, input.recommendationId)).status, 'action_completed');
});

test('owner mismatch와 expired recommendation은 동일 owner scope 밖 실행을 막는다', async () => {
    const { service, input } = await fixture();
    await assert.rejects(
        service.prepare({ ...input, ownerUserId: 'owner-other' }),
        (error) => error.code === 'recommendation_not_found'
    );
    const expiredFixture = await fixture({ expiresAt: '2026-08-23T02:00:00.000Z' });
    await assert.rejects(
        expiredFixture.service.prepare(expiredFixture.input),
        (error) => error.code === 'recommendation_expired'
    );
});
