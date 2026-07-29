function createBlogAutoService(deps = {}) {
    const {
        Logger,
        getAutoStatusPayload,
        ensureSheetsReadyForUi,
        resolveNaverAutoCategoryCatalog,
        runAutoCycle,
        runTrendCollectCycle,
        runRssCollectCycle,
        triggerSnsDiscoveryCycle,
        triggerSnsDistributionCycle,
        runAutoPublishCycle,
        triggerAutoPublishCycle
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

        async runCollectTrends({ requestBody = {} } = {}) {
            Logger.info(`🚀 [UI][AUTO] 트렌드 수동 수집 요청 수신`);
            try {
                const result = await runTrendCollectCycle('ui-manual', requestBody);
                if (!result?.success) {
                    return {
                        success: false,
                        message: result?.message || '트렌드 수집에 실패했습니다.',
                        data: result || {}
                    };
                }
                return { success: true, data: result || {} };
            } catch (e) {
                Logger.error(`⚠️ [UI][AUTO] 트렌드 수동 수집 오류:`, e);
                return { success: false, message: e.message || '알 수 없는 오류' };
            }
        },

        async runCollectRss({ requestBody = {} } = {}) {
            Logger.info(`🚀 [UI][AUTO] RSS 수동 수집 요청 수신`);
            try {
                const result = await runRssCollectCycle('ui-manual', requestBody);
                return { success: true, data: result || {} };
            } catch (e) {
                Logger.error(`⚠️ [UI][AUTO] RSS 수동 수집 오류:`, e);
                return { success: false, message: e.message || '알 수 없는 오류' };
            }
        },

        async runCollectSns() {
            Logger.info(`🚀 [UI][AUTO] SNS RSS 수동 확인 요청 수신`);
            const result = await triggerSnsDiscoveryCycle('ui-manual');
            if (!result?.success) {
                return {
                    success: false,
                    statusCode: result?.code === 'SNS_CYCLE_ALREADY_RUNNING' ? 409 : 400,
                    code: result?.code || 'SNS_DISCOVERY_FAILED',
                    message: result?.message || 'SNS RSS 확인에 실패했습니다.',
                    data: result || {}
                };
            }
            return { success: true, data: result || {} };
        },

        async runPublishSns() {
            Logger.info(`🚀 [UI][AUTO] SNS 원문 글 수동 발행 요청 수신`);
            const result = await triggerSnsDistributionCycle('ui-manual');
            if (!result?.success) {
                return {
                    success: false,
                    statusCode: result?.code === 'SNS_CYCLE_ALREADY_RUNNING' ? 409 : 400,
                    code: result?.code || 'SNS_DISTRIBUTION_FAILED',
                    message: result?.message || 'SNS 원문 글 발행에 실패했습니다.',
                    data: result || {}
                };
            }
            return { success: true, data: result || {} };
        },

        async runAutoPublish({ requestBody = {} } = {}) {
            Logger.info(`🚀 [UI][AUTO] 자동발행 1회 수동 실행 요청 수신`);
            try {
                const result = await runAutoPublishCycle('ui-manual', {
                    targetRowIndices: requestBody?.targetRowIndices || [],
                    settingsOverrides: requestBody?.settingsOverrides || {}
                });
                return { success: true, data: result || {} };
            } catch (e) {
                Logger.error(`⚠️ [UI][AUTO] 자동발행 수동 실행 오류:`, e);
                return { success: false, message: e.message || '알 수 없는 오류' };
            }
        },

        async startAutoPublish({ requestBody = {} } = {}) {
            Logger.info(`🚀 [UI][AUTO] 자동발행 비동기 시작 요청 수신`);
            try {
                const result = await triggerAutoPublishCycle('ui-manual', {
                    targetRowIndices: requestBody?.targetRowIndices || [],
                    settingsOverrides: requestBody?.settingsOverrides || {}
                });
                if (!result?.success) {
                    return {
                        success: false,
                        statusCode: result?.code === 'PUBLISH_AUTO_ALREADY_RUNNING' ? 409 : 400,
                        code: result?.code || 'PUBLISH_AUTO_START_FAILED',
                        message: result?.message || '자동 발행 시작에 실패했습니다.'
                    };
                }
                return result;
            } catch (e) {
                Logger.error(`⚠️ [UI][AUTO] 자동발행 비동기 시작 오류:`, e);
                return { success: false, statusCode: 400, message: e.message || '알 수 없는 오류' };
            }
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
