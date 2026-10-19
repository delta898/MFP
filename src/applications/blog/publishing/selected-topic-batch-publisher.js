const { buildPublishQuotaPreflight } = require('../../../services/licensing/publish-quota');

function createSelectedTopicBatchPublisher(deps = {}) {
    const {
        CONFIG,
        Logger,
        checkPublishLicense,
        canBatchPublish,
        readTopics,
        publishRow,
        notifyPublishSummary,
        normalizeNonNegativeInt,
        initialStatus = {}
    } = deps;

    const runtimeState = {
        enabled: initialStatus.enabled === true,
        running: false,
        status: 'stopped',
        startedAt: null,
        lastRunAt: null,
        cycleCount: 0,
        lastSummary: null,
        message: ''
    };

    async function publishReadyTopicsBatch(trigger = 'manual', options = {}) {
        const settingsOverrides = options?.settingsOverrides || {};
        const precheck = await checkPublishLicense({ quiet: true });
        if (!precheck.success) return { success: false, message: `라이선스 오류: ${precheck.message}` };
        if (!canBatchPublish(precheck.features)) {
            return { success: false, message: '블로그 batch 권한이 없습니다.' };
        }

        Logger.info(`🚀 [Blog][BatchPublish] 선택 글감 발행 시작 (Trigger: ${trigger})`);

        try {
            const topicsRes = await readTopics({
                status: '',
                limit: 100000,
                sortBy: 'rowNumber',
                sortDir: 'asc'
            });
            const topicItems = Array.isArray(topicsRes.items) ? topicsRes.items : [];

            let candidates = [];
            if (Array.isArray(options?.targetRowIndices) && options.targetRowIndices.length > 0) {
                candidates = topicItems.filter((item) => options.targetRowIndices.includes(item.rowIndex));
            } else {
                candidates = topicItems
                    .filter((item) => String(item?.status || '').trim() === '발행 준비 완료')
                    .sort((a, b) => Number(a.rowNumber || 0) - Number(b.rowNumber || 0));
            }

            let batchSize = normalizeNonNegativeInt(settingsOverrides.PUBLISH_AUTO_BATCH_SIZE ?? CONFIG.PUBLISH_AUTO_BATCH_SIZE, 1);
            if (batchSize === 0) batchSize = 1;

            const selectedCandidates = candidates.slice(0, batchSize);
            const quotaPreflight = buildPublishQuotaPreflight(selectedCandidates.length, precheck);
            const targetCandidates = selectedCandidates.slice(0, quotaPreflight.executable);
            if (targetCandidates.length === 0) {
                Logger.info(quotaPreflight.selected > 0
                    ? `[AUTO][Consumer] ${quotaPreflight.message}`
                    : 'ℹ️ [AUTO][Consumer] 발행 대기 상태인 토픽이 없습니다.');
                return {
                    success: quotaPreflight.selected === 0,
                    code: quotaPreflight.selected > 0 ? 'QUOTA_EXHAUSTED' : undefined,
                    message: quotaPreflight.selected > 0 ? quotaPreflight.message : undefined,
                    data: { published: 0, quotaPreflight }
                };
            }
            Logger.info(`[AUTO][Consumer] ${quotaPreflight.message}`);

            const rawTargets = String(settingsOverrides.PUBLISH_AUTO_TARGET_CHANNELS ?? CONFIG.PUBLISH_AUTO_TARGET_CHANNELS ?? 'naver')
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean);
            const targets = rawTargets.length > 0 ? rawTargets : ['naver'];

            const headless = settingsOverrides.PUBLISH_AUTO_HEADLESS !== undefined
                ? settingsOverrides.PUBLISH_AUTO_HEADLESS
                : (CONFIG.PUBLISH_AUTO_HEADLESS !== undefined ? CONFIG.PUBLISH_AUTO_HEADLESS : CONFIG.HEADLESS);
            const postStatus = String(
                settingsOverrides.PUBLISH_AUTO_POST_STATUS
                ?? CONFIG.PUBLISH_AUTO_POST_STATUS
                ?? 'publish'
            ).trim().toLowerCase() === 'draft' ? 'draft' : 'publish';

            let successCount = 0;
            let failCount = 0;
            const totalResults = [];

            for (const candidate of targetCandidates) {
                const rowOptions = candidate.options || {};
                let rowTargets = targets;
                if (rowOptions.platforms && Array.isArray(rowOptions.platforms) && rowOptions.platforms.length > 0) {
                    rowTargets = rowOptions.platforms;
                }

                const singleResult = await publishRow({
                    action: 'batch',
                    rowIndices: [candidate.rowIndex],
                    headless,
                    targets: rowTargets,
                    postStatus,
                    isAutoCycle: true
                });

                successCount += Number(singleResult?.data?.successCount || 0);
                failCount += Number(singleResult?.data?.failCount || 0);
                if (singleResult?.data?.results) {
                    totalResults.push(...singleResult.data.results);
                }
            }

            const blogResult = { data: { successCount, failCount, results: totalResults } };
            const finalSuccessCount = Number(blogResult?.data?.successCount || 0);
            const finalFailCount = Number(blogResult?.data?.failCount || 0);

            Logger.info(`✅ [Blog][BatchPublish] 선택 글감 발행 완료: 성공 ${finalSuccessCount}건, 실패 ${finalFailCount}건`);

            const shouldSendSummary = (successCount + failCount) > 1 || failCount > 0;

            if (CONFIG.PUBLISH_AUTO_NOTIFY_ENABLED && shouldSendSummary && typeof notifyPublishSummary === 'function') {
                await notifyPublishSummary({
                    successCount,
                    failCount,
                    results: blogResult?.data?.results || [],
                    completedAt: new Date().toISOString()
                });
            }

            return {
                success: true,
                data: {
                    published: successCount,
                    failed: failCount,
                    skipped: selectedCandidates.length - targetCandidates.length,
                    quotaPreflight
                }
            };
        } catch (error) {
            Logger.error(`❌ [Blog][BatchPublish] 글감 발행 실패: ${error.message}`);
            return { success: false, message: `글감 발행 처리 오류: ${error.message}` };
        }
    }

    function normalizeManualPublishTargetRowIndices(value) {
        if (!Array.isArray(value)) return [];
        return Array.from(new Set(
            value
                .map((item) => Number(item))
                .filter((item) => Number.isInteger(item) && item >= 0)
        ));
    }

    async function startReadyTopicsBatch(trigger = 'manual', options = {}) {
        if (runtimeState.running) {
            return {
                success: false,
                code: 'PUBLISH_AUTO_ALREADY_RUNNING',
                message: '이미 다른 발행 작업이 실행 중입니다.'
            };
        }

        const normalizedOptions = {
            ...options,
            targetRowIndices: normalizeManualPublishTargetRowIndices(options?.targetRowIndices)
        };
        const startedAt = new Date().toISOString();

        runtimeState.running = true;
        runtimeState.status = 'running';
        runtimeState.message = '발행 작업을 시작했습니다.';
        runtimeState.startedAt = startedAt;
        runtimeState.lastRunAt = startedAt;

        Promise.resolve()
            .then(async () => {
                const result = await publishReadyTopicsBatch(trigger, normalizedOptions);
                runtimeState.lastSummary = result || null;
                if (result?.success === false) {
                    runtimeState.status = 'error';
                    runtimeState.message = result?.message || '발행 작업 처리 중 오류가 발생했습니다.';
                } else {
                    runtimeState.message = '발행 작업이 백그라운드에서 완료되었습니다.';
                    runtimeState.cycleCount = Number(runtimeState.cycleCount || 0) + 1;
                }
            })
            .catch((error) => {
                Logger.error(`❌ [Blog][BatchPublish] 비동기 발행 시작 실패: ${error.message}`);
                runtimeState.status = 'error';
                runtimeState.message = error.message || '발행 작업 처리 중 오류가 발생했습니다.';
                runtimeState.lastSummary = {
                    success: false,
                    message: runtimeState.message
                };
            })
            .finally(() => {
                runtimeState.running = false;
                if (runtimeState.status !== 'error') {
                    runtimeState.status = runtimeState.enabled ? 'waiting' : 'stopped';
                }
                runtimeState.lastRunAt = new Date().toISOString();
            });

        return {
            success: true,
            data: {
                started: true,
                trigger,
                startedAt,
                targetRowIndices: normalizedOptions.targetRowIndices,
                targetRowCount: normalizedOptions.targetRowIndices.length
            }
        };
    }

    function getStatus() {
        return { ...runtimeState };
    }

    return {
        publishReadyTopicsBatch,
        normalizeManualPublishTargetRowIndices,
        startReadyTopicsBatch,
        getStatus
    };
}

module.exports = {
    createSelectedTopicBatchPublisher
};
