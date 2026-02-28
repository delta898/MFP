const { createControllerErrorResponder, sendMethodNotAllowed } = require('./controller-common');

function createSystemController(deps = {}) {
    const { service, sendSuccess, sendError, logger, updater } = deps;
    const toErrorResponse = createControllerErrorResponder(sendError, { defaultStatus: 500 });

    return {
        async health({ requestId, method, res }) {
            if (method !== 'GET') {
                return sendMethodNotAllowed(sendError, res, requestId);
            }
            try {
                return sendSuccess(res, requestId, await service.getHealth());
            } catch (e) {
                return toErrorResponse(res, requestId, 'HEALTH_CHECK_FAILED', '상태 확인에 실패했습니다.', e);
            }
        },

        async updateCheck({ requestId, method, res }) {
            if (method !== 'GET') {
                return sendMethodNotAllowed(sendError, res, requestId);
            }
            try {
                return sendSuccess(res, requestId, await service.checkUpdate({ updater }));
            } catch (e) {
                return toErrorResponse(res, requestId, 'UPDATE_CHECK_ERROR', '업데이트 확인에 실패했습니다.', e);
            }
        },

        async updateApply({ requestId, method, res }) {
            if (method !== 'POST') {
                return sendMethodNotAllowed(sendError, res, requestId);
            }
            try {
                return sendSuccess(res, requestId, await service.applyUpdate({ updater }));
            } catch (e) {
                return toErrorResponse(res, requestId, 'UPDATE_APPLY_ERROR', '업데이트 적용에 실패했습니다.', e);
            }
        },

        async updateRestart({ requestId, method, res }) {
            if (method !== 'POST') {
                return sendMethodNotAllowed(sendError, res, requestId);
            }
            sendSuccess(res, requestId, { success: true });
            setTimeout(() => {
                updater.restart();
            }, 1000);
            return true;
        },

        async systemRestart({ requestId, method, res }) {
            if (method !== 'POST') {
                return sendMethodNotAllowed(sendError, res, requestId);
            }
            logger.info('🔄 [System] UI에서 서버 재시작 요청');
            sendSuccess(res, requestId, { success: true, message: '서버를 재시작합니다.' });
            setTimeout(() => {
                updater.restart();
            }, 1000);
            return true;
        },

        async systemStop({ requestId, method, res }) {
            if (method !== 'POST') {
                return sendMethodNotAllowed(sendError, res, requestId);
            }
            logger.info('🛑 [System] UI에서 서버 종료 요청');
            sendSuccess(res, requestId, { success: true, message: '서버를 종료합니다.' });
            setTimeout(() => {
                process.exit(0);
            }, 1000);
            return true;
        },

        async dashboardSummary({ requestId, method, res }) {
            if (method !== 'GET') {
                return sendMethodNotAllowed(sendError, res, requestId);
            }
            try {
                return sendSuccess(res, requestId, await service.getDashboardSummary());
            } catch (e) {
                return toErrorResponse(res, requestId, 'DASHBOARD_SUMMARY_ERROR', '대시보드 요약 조회에 실패했습니다.', e);
            }
        },

        async dashboardLogs({ requestId, method, searchParams, res }) {
            if (method !== 'GET') {
                return sendMethodNotAllowed(sendError, res, requestId);
            }
            try {
                return sendSuccess(res, requestId, await service.getDashboardLogs({
                    limitRaw: searchParams?.get('limit')
                }));
            } catch (e) {
                return toErrorResponse(res, requestId, 'DASHBOARD_LOGS_ERROR', '대시보드 로그 조회에 실패했습니다.', e);
            }
        },

        async dashboardExternalContent({ requestId, method, searchParams, res }) {
            if (method !== 'GET') {
                return sendMethodNotAllowed(sendError, res, requestId);
            }
            try {
                return sendSuccess(res, requestId, await service.getDashboardExternalContent({
                    limitRaw: searchParams?.get('limit')
                }));
            } catch (e) {
                return toErrorResponse(res, requestId, 'DASHBOARD_EXTERNAL_CONTENT_ERROR', '외부 콘텐츠 조회에 실패했습니다.', e);
            }
        },

        async logsFiles({ requestId, method, res }) {
            if (method !== 'GET') {
                return sendMethodNotAllowed(sendError, res, requestId);
            }
            try {
                return sendSuccess(res, requestId, await service.getLogFiles());
            } catch (e) {
                return toErrorResponse(res, requestId, 'LOGS_FILES_ERROR', '로그 파일 목록 조회에 실패했습니다.', e);
            }
        },

        async logsRead({ requestId, method, searchParams, res }) {
            if (method !== 'GET') {
                return sendMethodNotAllowed(sendError, res, requestId);
            }
            try {
                return sendSuccess(res, requestId, await service.readLogFile({ filename: searchParams.get('file') }));
            } catch (e) {
                return toErrorResponse(res, requestId, 'LOGS_READ_ERROR', '로그 파일 읽기에 실패했습니다.', e);
            }
        },

        async configStatus({ requestId, method, res }) {
            if (method !== 'GET') {
                return sendMethodNotAllowed(sendError, res, requestId);
            }
            try {
                return sendSuccess(res, requestId, await service.getConfigStatus());
            } catch (e) {
                return toErrorResponse(res, requestId, 'CONFIG_STATUS_ERROR', '설정 상태 조회에 실패했습니다.', e);
            }
        },

        async sheetsEnsure({ requestId, method, searchParams, res }) {
            if (!['GET', 'POST'].includes(method)) {
                return sendMethodNotAllowed(sendError, res, requestId);
            }
            try {
                return sendSuccess(res, requestId, await service.ensureSheets({ forceRaw: searchParams.get('force') }));
            } catch (e) {
                return toErrorResponse(res, requestId, 'SHEETS_NOT_READY', '필수 시트 준비에 실패했습니다.', e);
            }
        }
    };
}

module.exports = {
    createSystemController
};
