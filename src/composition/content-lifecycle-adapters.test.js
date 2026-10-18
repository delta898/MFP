const test = require('node:test');
const assert = require('node:assert/strict');

const {
    CONTENT_LIFECYCLE_KIND,
    createContentLifecycleAdapterRegistry
} = require('./content-lifecycle-adapters');
const { resolveDeliveryPlan } = require('../services/content-delivery/contract');

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

test('Site Hosting adapter passes the row and stored post mode to its queue executor', async () => {
    let request;
    const registry = createContentLifecycleAdapterRegistry({
        async executeSiteHostingQueueRowAction(nextRequest) {
            request = nextRequest;
            return { success: true };
        }
    });
    const topic = {
        options: {
            platforms: ['site-hosting'], post_status: 'draft',
            site_target: { project_id: 'project-1', site_id: 'site-1', kind: 'vault', destination_path: 'notes' }
        }
    };

    const result = await registry.get(CONTENT_LIFECYCLE_KIND.SITE_HOSTING).execute({
        rowIndex: 9,
        plan: topic,
        execution: { automatic: true, operationId: 'site-row-9' }
    });

    assert.equal(result.success, true);
    assert.deepEqual(request, { rowIndex: 9, topic, postStatus: 'draft', execution: { automatic: true, operationId: 'site-row-9' } });
});
