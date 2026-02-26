function createBlogAutoService(deps = {}) {
    const {
        Logger,
        getAutoStatusPayload,
        ensureSheetsReadyForUi,
        resolveNaverAutoCategoryCatalog,
        runAutoCycle
    } = deps;

    return {
        async getStatus() {
            return getAutoStatusPayload();
        },

        async getCategories({ force = false } = {}) {
            await ensureSheetsReadyForUi();
            return resolveNaverAutoCategoryCatalog({ force });
        },

        async runManual({ requestBody = {} } = {}) {
            const requestedDate = String(requestBody?.trendDate || '').trim();
            const skipTrends = requestBody?.skipTrends === true;
            const settingsOverrides = (requestBody?.settingsOverrides && typeof requestBody.settingsOverrides === 'object')
                ? requestBody.settingsOverrides
                : {};

            Logger.info(`🚀 [UI][AUTO] 수동 실행 요청 수신 (trendDate: ${requestedDate || '미지정'}, skipTrends: ${skipTrends ? 'Yes' : 'No'})`);

            const runResult = await runAutoCycle('ui-manual', {
                forceRun: true,
                trendDate: requestedDate || '',
                skipTrends,
                settingsOverrides
            });

            if (!runResult?.success) {
                Logger.warn(
                    `⚠️ [UI][AUTO] 수동 실행 실패 (trendDate: ${requestedDate || '미지정'}, skipTrends: ${skipTrends ? 'Yes' : 'No'}, code: ${runResult?.code || '-'}, message: ${runResult?.message || 'unknown'})`
                );
                return {
                    success: false,
                    statusCode: 400,
                    code: runResult?.code || 'AUTO_MANUAL_RUN_FAILED',
                    message: runResult?.message || '자동발행 수동 실행에 실패했습니다.'
                };
            }

            const summary = runResult?.data?.summary || {};
            const skipped = Array.isArray(summary?.skipped) ? summary.skipped : [];
            Logger.info(
                `✅ [UI][AUTO] 수동 실행 완료 (trendDate: ${requestedDate || '미지정'}, skipTrends: ${skipTrends ? 'Yes' : 'No'}, trends: ${Number(summary?.trendsCollected || 0)}, topics: ${Number(summary?.trendsToTopics || 0)}, blog: ${Number(summary?.blogSuccess || 0)}/${Number(summary?.blogAttempted || 0)})`
            );
            if (skipped.length > 0) {
                Logger.info(`ℹ️ [UI][AUTO] 수동 실행 건너뜀 사유: ${skipped.join(' | ')}`);
            }

            return {
                success: true,
                data: {
                    trendDate: requestedDate || '',
                    skipTrends,
                    ...(runResult?.data || {})
                }
            };
        },

        async startAuto() {
            return {
                success: false,
                statusCode: 409,
                code: 'AUTO_POC_ONLY',
                message: '현재 Auto Mode는 PoC 단계로 설정 저장만 지원합니다. 실제 자동 실행은 추후 활성화 예정입니다.'
            };
        },

        async stopAuto() {
            return {
                success: false,
                statusCode: 409,
                code: 'AUTO_POC_ONLY',
                message: '현재 Auto Mode는 PoC 단계로 설정 저장만 지원합니다.'
            };
        }
    };
}

module.exports = {
    createBlogAutoService
};
