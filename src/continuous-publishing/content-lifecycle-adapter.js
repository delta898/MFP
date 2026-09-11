const CONTENT_LIFECYCLE_KIND = Object.freeze({
    BLOG: 'blog',
    SHOPPING: 'shopping'
});

const LIFECYCLE_TARGETS = Object.freeze(['naver', 'wordpress']);
const LIFECYCLE_POST_STATUSES = Object.freeze(['publish', 'draft', 'schedule']);

function normalizeText(value) {
    return String(value || '').trim();
}

function normalizeTargets(value) {
    const values = Array.isArray(value) ? value : normalizeText(value).split(',');
    return Array.from(new Set(values
        .map((item) => normalizeText(item).toLowerCase())
        .filter((item) => LIFECYCLE_TARGETS.includes(item))));
}

function normalizePostStatus(value) {
    const status = normalizeText(value).toLowerCase();
    return LIFECYCLE_POST_STATUSES.includes(status) ? status : 'publish';
}

function resolveDeliveryPlan(item = {}) {
    const options = item.options && typeof item.options === 'object' ? item.options : {};
    const targets = normalizeTargets(item.targets || options.platforms || options.targets);
    const postStatus = normalizePostStatus(item.postStatus || options.post_status);
    const scheduleDate = postStatus === 'schedule'
        ? normalizeText(item.scheduleDate || options.schedule_date)
        : '';
    return { targets, postStatus, scheduleDate };
}

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

    return null;
}

function createContentLifecycleAdapterRegistry(deps = {}) {
    const adapters = new Map([
        [CONTENT_LIFECYCLE_KIND.BLOG, createAdapter(CONTENT_LIFECYCLE_KIND.BLOG, deps.executeBlogRowAction)],
        [CONTENT_LIFECYCLE_KIND.SHOPPING, createAdapter(CONTENT_LIFECYCLE_KIND.SHOPPING, deps.executeShoppingBatchRowsAction)]
    ].filter(([, adapter]) => adapter));

    return Object.freeze({
        get(kind) {
            return adapters.get(String(kind || '').trim()) || null;
        }
    });
}

module.exports = {
    CONTENT_LIFECYCLE_KIND,
    LIFECYCLE_POST_STATUSES,
    LIFECYCLE_TARGETS,
    createContentLifecycleAdapterRegistry,
    normalizePostStatus,
    normalizeTargets,
    resolveDeliveryPlan
};
