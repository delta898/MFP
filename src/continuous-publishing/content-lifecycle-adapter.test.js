const test = require('node:test');
const assert = require('node:assert/strict');

const {
    CONTENT_LIFECYCLE_KIND,
    createContentLifecycleAdapterRegistry,
    resolveDeliveryPlan
} = require('./content-lifecycle-adapter');

test('delivery plan normalizes the persisted row plan without accepting unknown targets', () => {
    assert.deepEqual(resolveDeliveryPlan({
        targets: ['NAVER', 'unknown', 'wordpress', 'naver'],
        postStatus: 'schedule',
        scheduleDate: '2026-09-12T09:00'
    }), {
        targets: ['naver', 'wordpress'],
        postStatus: 'schedule',
        scheduleDate: '2026-09-12T09:00'
    });
});

test('Blog adapter preserves the existing runner executor request contract', async () => {
    let request;
    let options;
    const registry = createContentLifecycleAdapterRegistry({
        async executeBlogRowAction(nextRequest, nextOptions) {
            request = nextRequest;
            options = nextOptions;
            return { success: true };
        }
    });

    const result = await registry.get(CONTENT_LIFECYCLE_KIND.BLOG).execute({
        rowIndex: 8,
        plan: { targets: ['naver'] },
        execution: { headless: true, manual: true, operationId: 'operation-8' }
    });

    assert.equal(result.success, true);
    assert.deepEqual(request, { action: 'batch', rowIndex: 8, headless: true, requireReadyStatus: true });
    assert.equal(options.manualTrigger, true);
    assert.equal(options.operationId, 'operation-8');
});

test('Shopping adapter passes only the stored delivery targets to the existing batch executor', async () => {
    let request;
    const registry = createContentLifecycleAdapterRegistry({
        async executeShoppingBatchRowsAction(nextRequest) {
            request = nextRequest;
            return { success: true, data: { results: [{ rowIndex: 4, success: true, data: { status: '발행 완료' } }] } };
        }
    });

    await registry.get(CONTENT_LIFECYCLE_KIND.SHOPPING).execute({
        rowIndex: 4,
        plan: { options: { platforms: ['wordpress'] } },
        execution: { headless: false, manual: true, operationId: 'shopping-4' }
    });

    assert.deepEqual(request, {
        action: 'batch',
        rowIndices: [4],
        targets: ['wordpress'],
        headless: false,
        manualTrigger: true,
        requireReadyStatus: true,
        source: 'continuous-publishing',
        operationId: 'shopping-4'
    });
});
