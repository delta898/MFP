const test = require('node:test');
const assert = require('node:assert/strict');
const { ConfirmationStore } = require('../../../adapters/storage/confirmations/confirmation-store');
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

test('실행 오류의 결과가 불확실하면 재시도를 차단한다', async () => {
    const capabilityRegistry = registryFixture({ confirmPolicy: 'never', failCount: 1 });
    const { service, input, recommendationStore } = await fixture({ capabilityRegistry });
    await assert.rejects(service.prepare(input), (error) => error.code === 'execution_outcome_unknown');
    assert.equal((await recommendationStore.getRecommendation(input.ownerUserId, input.recommendationId)).status, 'action_in_progress');
    await assert.rejects(service.prepare(input), error => error.code === 'recommendation_not_actionable');
    assert.equal(capabilityRegistry.executionCount, 1);
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

test('handoff decision refuses an expiry between lookup and transition', async (t) => {
    for (const decision of ['accept', 'reject']) await t.test(decision, async () => {
        const confirmationStore = new ConfirmationStore({ ttlMs: 1000 });
        let now = 10000;
        confirmationStore._now = () => now;
        const { service, input, capabilityRegistry } = await fixture({ confirmationStore });
        const prepared = await service.prepare(input);
        const originalGet = confirmationStore.get.bind(confirmationStore);
        let advance = true;
        confirmationStore.get = id => { const result = originalGet(id); if (advance) { advance = false; now += 1000; } return result; };
        await assert.rejects(service.decide({ ...input, confirmationId: prepared.confirmation.id, decision }), error => error.code === 'confirmation_expired');
        assert.equal(confirmationStore.get(prepared.confirmation.id).status, 'expired');
        assert.equal(capabilityRegistry.executionCount, 0);
    });
});


test('승인 후 시작 거부는 확정 실패로 기록하고 실행하지 않는다', async () => {
    const { service, input, recommendationStore, confirmationStore, capabilityRegistry } = await fixture();
    const prepared = await service.prepare(input);
    const original = recommendationStore.transitionRecommendation.bind(recommendationStore);
    recommendationStore.transitionRecommendation = async event => {
        if (event.event_type === 'recommendation.action_started') throw new Error('injected');
        return original(event);
    };
    await assert.rejects(service.decide({ ...input, confirmationId: prepared.confirmation.id, decision: 'accept' }), error => error.code === 'action_start_rejected');
    assert.equal(confirmationStore.get(prepared.confirmation.id).status, 'failed');
    assert.equal(capabilityRegistry.executionCount, 0);
});

test('승인 후 불확실한 실행 오류는 보존하고 재실행하지 않는다', async () => {
    const { service, input, confirmationStore, capabilityRegistry } = await fixture({ failCount: 1 });
    const prepared = await service.prepare(input);
    const decision = { ...input, confirmationId: prepared.confirmation.id, decision: 'accept' };
    await assert.rejects(service.decide(decision), error => error.code === 'execution_outcome_unknown');
    assert.equal(confirmationStore.get(prepared.confirmation.id).status, 'accepted');
    await assert.rejects(service.decide(decision), error => error.code === 'confirmation_already_decided');
    await assert.rejects(service.prepare(input), error => error.code === 'recommendation_not_actionable');
    assert.equal(capabilityRegistry.executionCount, 1);
});


test('추천 승인 저장 실패 시 실행하지 않는다', async () => {
    const { service, input, confirmationStore, capabilityRegistry } = await fixture();
    const prepared = await service.prepare(input);
    const persist = confirmationStore._persist.bind(confirmationStore);
    confirmationStore._persist = () => {
        if (confirmationStore.items.get(prepared.confirmation.id)?.status === 'accepted') throw Object.assign(new Error('injected'), { code: 'CONFIRMATION_STORAGE_ERROR' });
        return persist();
    };
    await assert.rejects(service.decide({ ...input, confirmationId: prepared.confirmation.id, decision: 'accept' }), { code: 'CONFIRMATION_STORAGE_ERROR' });
    assert.equal(capabilityRegistry.executionCount, 0);
});

test('registry의 실행 직전 검증 거부만 안전하게 실패 처리하고 새 요청으로 재시도한다', async (t) => {
    const { createCapabilityRegistry } = require('../../../host/agent/capability-registry/registry');
    for (const confirmPolicy of ['never', 'required']) await t.test(confirmPolicy, async () => {
        let validations = 0;
        let executions = 0;
        const failAt = confirmPolicy === 'never' ? 2 : 3;
        const capability = {
            id: 'content.register_topic.execute', type: 'content.register', domain: 'content.register_topic',
            effect: 'local_change', confirmPolicy,
            validate(params) {
                validations++;
                return validations === failAt
                    ? { ok: false, errors: ['injected'], normalizedParams: null }
                    : { ok: true, errors: [], normalizedParams: params };
            },
            async preview() { return {}; },
            async execute() { executions++; return { success: true }; }
        };
        const capabilityRegistry = createCapabilityRegistry({ agentActionProviders: [() => [capability]] });
        const { service, input, recommendationStore, confirmationStore } = await fixture({ capabilityRegistry });
        let prepared;
        if (confirmPolicy === 'required') prepared = await service.prepare(input);
        const first = () => confirmPolicy === 'never' ? service.prepare(input)
            : service.decide({ ...input, confirmationId: prepared.confirmation.id, decision: 'accept' });
        await assert.rejects(first(), { code: 'capability_execution_failed' });
        assert.equal(executions, 0);
        assert.equal((await recommendationStore.getRecommendation(input.ownerUserId, input.recommendationId)).status, 'action_failed');
        if (prepared) assert.equal(confirmationStore.get(prepared.confirmation.id).status, 'failed');
        const retry = await service.prepare(input);
        if (confirmPolicy === 'required') {
            assert.equal(retry.status, 'confirmation_required');
            assert.equal((await service.decide({ ...input, confirmationId: retry.confirmation.id, decision: 'accept' })).status, 'executed');
        } else assert.equal(retry.status, 'executed');
        assert.equal(executions, 1);
    });
});

test('안전한 실패라도 실패 상태 기록이 거부되면 재실행을 허용하지 않는다', async () => {
    const { createCapabilityRegistry } = require('../../../host/agent/capability-registry/registry');
    let validations = 0;
    let executions = 0;
    const capabilityRegistry = createCapabilityRegistry({ agentActionProviders: [() => [{
        id: 'content.register_topic.execute', type: 'content.register', domain: 'content.register_topic', confirmPolicy: 'never',
        validate(params) { return ++validations === 2 ? { ok: false, errors: ['injected'] } : { ok: true, normalizedParams: params }; },
        async preview() { return {}; }, async execute() { executions++; return { success: true }; }
    }]] });
    const { service, input, recommendationStore } = await fixture({ capabilityRegistry });
    const original = recommendationStore.transitionRecommendation.bind(recommendationStore);
    recommendationStore.transitionRecommendation = async event => {
        if (event.event_type === 'recommendation.action_failed') throw new Error('injected');
        return original(event);
    };
    await assert.rejects(service.prepare(input), { code: 'failure_record_failed' });
    await assert.rejects(service.prepare(input), { code: 'recommendation_not_actionable' });
    assert.equal(executions, 0);
});

test('capability 실행 중 내부 registry의 검증 거부는 바깥 작업이 안전하다는 증거가 아니다', async () => {
    const { createCapabilityRegistry } = require('../../../host/agent/capability-registry/registry');
    let executions = 0;
    const nested = { id: 'nested.run', type: 'nested', domain: 'nested', confirmPolicy: 'never',
        validate: () => ({ ok: false, errors: ['no'] }), preview: async () => ({}), execute: async () => ({ success: true }) };
    let registry;
    const outer = { id: 'content.register_topic.execute', type: 'content.register', domain: 'content.register_topic', confirmPolicy: 'never',
        validate: params => ({ ok: true, normalizedParams: params }), preview: async () => ({}),
        async execute() { executions++; return registry.executeAction({ domain: 'nested', name: 'run', params: {} }); } };
    registry = createCapabilityRegistry({ agentActionProviders: [() => [outer, nested]] });
    const { service, input } = await fixture({ capabilityRegistry: registry });
    await assert.rejects(service.prepare(input), { code: 'execution_outcome_unknown' });
    await assert.rejects(service.prepare(input), { code: 'recommendation_not_actionable' });
    assert.equal(executions, 1);
});
