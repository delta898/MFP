function createBlogAutoService(deps = {}) {
    const {
        Logger,
        getSnsAutomationStatus,
        getBlogBatchPublishStatus,
        getBlogAutoSettingsSnapshot,
        triggerSnsDiscoveryCycle,
        triggerSnsDistributionCycle,
        publishReadyTopicsBatch,
        startReadyTopicsBatch
    } = deps;

    return {
        async getStatus() {
            const blog = getBlogBatchPublishStatus();
            const sns = getSnsAutomationStatus();
            const blogStatus = {
                enabled: false,
                running: blog.running,
                status: blog.status,
                message: blog.message || '',
                startedAt: blog.startedAt,
                lastRunAt: blog.lastRunAt,
                nextRunAt: null,
                cycleCount: blog.cycleCount,
                lastSummary: blog.lastSummary,
                settings: getBlogAutoSettingsSnapshot()
            };
            const running = blog.running || sns.running;
            return {
                blog: blogStatus,
                sns,
                enabled: sns.enabled,
                running,
                status: running ? 'running' : (sns.enabled ? 'waiting' : 'stopped'),
                message: blog.message || (running ? '작업을 처리 중입니다.' : '실행 중인 작업이 없습니다.')
            };
        },

        async runCollectSns() {
            Logger.info('🚀 [UI][AUTO] SNS RSS 수동 확인 요청 수신');
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
            Logger.info('🚀 [UI][AUTO] SNS 원문 글 수동 발행 요청 수신');
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
            Logger.info('🚀 [UI][AUTO] 블로그 발행 대기열 수동 실행 요청 수신');
            try {
                const result = await publishReadyTopicsBatch('ui-manual', {
                    targetRowIndices: requestBody?.targetRowIndices || [],
                    settingsOverrides: requestBody?.settingsOverrides || {}
                });
                return { success: true, data: result || {} };
            } catch (error) {
                Logger.error('⚠️ [UI][AUTO] 블로그 발행 대기열 실행 오류:', error);
                return { success: false, message: error.message || '알 수 없는 오류' };
            }
        },

        async startAutoPublish({ requestBody = {} } = {}) {
            Logger.info('🚀 [UI][AUTO] 블로그 발행 대기열 비동기 시작 요청 수신');
            try {
                const result = await startReadyTopicsBatch('ui-manual', {
                    targetRowIndices: requestBody?.targetRowIndices || [],
                    settingsOverrides: requestBody?.settingsOverrides || {}
                });
                if (!result?.success) {
                    return {
                        success: false,
                        statusCode: result?.code === 'PUBLISH_AUTO_ALREADY_RUNNING' ? 409 : 400,
                        code: result?.code || 'PUBLISH_AUTO_START_FAILED',
                        message: result?.message || '발행 작업 시작에 실패했습니다.'
                    };
                }
                return result;
            } catch (error) {
                Logger.error('⚠️ [UI][AUTO] 블로그 발행 대기열 비동기 시작 오류:', error);
                return { success: false, statusCode: 400, message: error.message || '알 수 없는 오류' };
            }
        }
    };
}

module.exports = { createBlogAutoService };
