const { CONTENT_LIFECYCLE_KIND, resolveDeliveryPlan } = require('../services/content-delivery/contract');

function createAdapter(kind, executor) {
    if (typeof executor !== 'function') return null;

    if (kind === CONTENT_LIFECYCLE_KIND.BLOG) {
        return Object.freeze({
            kind,
            async execute({ rowIndex, plan, execution = {} }) {
                return executor(
                    {
                        action: 'batch',
                        rowIndex,
                        headless: execution.headless,
                        requireReadyStatus: true
                    },
                    {
                        manualTrigger: execution.manual === true,
                        continuousAutomation: execution.automatic === true,
                        isAutoCycle: execution.automatic === true,
                        isLast: true,
                        operationId: execution.operationId,
                        onProgress: execution.onProgress
                    }
                );
            }
        });
    }

    if (kind === CONTENT_LIFECYCLE_KIND.SHOPPING) {
        return Object.freeze({
            kind,
            async execute({ rowIndex, plan, execution = {} }) {
                const result = await executor({
                    action: 'batch',
                    rowIndices: [rowIndex],
                    targets: resolveDeliveryPlan(plan).targets,
                    headless: execution.headless,
                    manualTrigger: execution.manual === true,
                    requireReadyStatus: true,
                    source: 'continuous-publishing',
                    operationId: execution.operationId
                });
                if (!result?.success) return result;
                const rowResult = Array.isArray(result?.data?.results)
                    ? result.data.results.find((item) => Number(item?.rowIndex) === Number(rowIndex))
                    : null;
                if (!rowResult?.success) {
                    return {
                        success: false,
                        code: rowResult?.code || 'SHOPPING_LIFECYCLE_EXECUTION_FAILED',
                        message: rowResult?.message || '쇼핑 글감 실행에 실패했습니다.'
                    };
                }
                return { success: true, data: rowResult.data || {} };
            }
        });
    }

    if (kind === CONTENT_LIFECYCLE_KIND.SITE_HOSTING) {
        return Object.freeze({
            kind,
            async execute({ rowIndex, plan, execution = {} }) {
                return executor({
                    rowIndex,
                    topic: plan,
                    postStatus: resolveDeliveryPlan(plan).postStatus,
                    execution
                });
            }
        });
    }

    return null;
}

function createContentLifecycleAdapterRegistry(deps = {}) {
    const adapters = new Map([
        [CONTENT_LIFECYCLE_KIND.BLOG, createAdapter(CONTENT_LIFECYCLE_KIND.BLOG, deps.executeBlogRowAction)],
        [CONTENT_LIFECYCLE_KIND.SHOPPING, createAdapter(CONTENT_LIFECYCLE_KIND.SHOPPING, deps.executeShoppingBatchRowsAction)],
        [CONTENT_LIFECYCLE_KIND.SITE_HOSTING, createAdapter(CONTENT_LIFECYCLE_KIND.SITE_HOSTING, deps.executeSiteHostingQueueRowAction)]
    ].filter(([, adapter]) => adapter));

    return Object.freeze({
        get(kind) {
            return adapters.get(String(kind || '').trim()) || null;
        }
    });
}

module.exports = {
    CONTENT_LIFECYCLE_KIND,
    createContentLifecycleAdapterRegistry,
    resolveDeliveryPlan
};
