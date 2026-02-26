const { ensureMethod, withError } = require('./route-common');

function createSystemRouteHandler(deps = {}) {
    const {
        APP_VERSION,
        Logger,
        Updater,
        Utils,
        fs,
        path,
        CONFIG,
        parseBoolQuery,
        ensureSheetsReadyForUi,
        sendSuccess,
        sendError
    } = deps;

    return async function tryHandleSystemRoute(ctx = {}) {
        const { requestId, method, pathname, searchParams, res } = ctx;

        if (pathname === '/api/v1/health') {
            if (!ensureMethod({ method, allowed: 'GET', sendError, res, requestId })) return true;
            return sendSuccess(res, requestId, { status: 'ok', version: APP_VERSION });
        }

        if (pathname === '/api/v1/system/update/check') {
            if (!ensureMethod({ method, allowed: 'GET', sendError, res, requestId })) return true;
            return withError(
                { sendError, res, requestId, status: 500, code: 'UPDATE_CHECK_ERROR', defaultMessage: '업데이트 확인에 실패했습니다.' },
                async () => {
                    const updateInfo = await Updater.checkForUpdate();
                    return sendSuccess(res, requestId, updateInfo || { hasUpdate: false });
                }
            );
        }

        if (pathname === '/api/v1/system/update/apply') {
            if (!ensureMethod({ method, allowed: 'POST', sendError, res, requestId })) return true;
            return withError(
                { sendError, res, requestId, status: 500, code: 'UPDATE_APPLY_ERROR', defaultMessage: '업데이트 적용에 실패했습니다.' },
                async () => {
                    await Updater.applyUpdate(() => {});
                    return sendSuccess(res, requestId, { success: true });
                }
            );
        }

        if (pathname === '/api/v1/system/update/restart') {
            if (!ensureMethod({ method, allowed: 'POST', sendError, res, requestId })) return true;
            sendSuccess(res, requestId, { success: true });
            setTimeout(() => {
                Updater.restart();
            }, 1000);
            return true;
        }

        if (pathname === '/api/v1/system/restart') {
            if (!ensureMethod({ method, allowed: 'POST', sendError, res, requestId })) return true;
            Logger.info('🔄 [System] UI에서 서버 재시작 요청');
            sendSuccess(res, requestId, { success: true, message: '서버를 재시작합니다.' });
            setTimeout(() => {
                Updater.restart();
            }, 1000);
            return true;
        }

        if (pathname === '/api/v1/system/stop') {
            if (!ensureMethod({ method, allowed: 'POST', sendError, res, requestId })) return true;
            Logger.info('🛑 [System] UI에서 서버 종료 요청');
            sendSuccess(res, requestId, { success: true, message: '서버를 종료합니다.' });
            setTimeout(() => {
                process.exit(0);
            }, 1000);
            return true;
        }

        if (pathname === '/api/v1/dashboard/summary') {
            if (!ensureMethod({ method, allowed: 'GET', sendError, res, requestId })) return true;
            return withError(
                { sendError, res, requestId, status: 500, code: 'DASHBOARD_SUMMARY_ERROR', defaultMessage: '대시보드 요약 조회에 실패했습니다.' },
                async () => sendSuccess(res, requestId, await Utils.getDashboardSummary())
            );
        }

        if (pathname === '/api/v1/dashboard/logs') {
            if (!ensureMethod({ method, allowed: 'GET', sendError, res, requestId })) return true;
            return withError(
                { sendError, res, requestId, status: 500, code: 'DASHBOARD_LOGS_ERROR', defaultMessage: '대시보드 로그 조회에 실패했습니다.' },
                async () => sendSuccess(res, requestId, { logs: Logger.getRecentLogs(20) })
            );
        }

        if (pathname === '/api/v1/logs/files') {
            if (!ensureMethod({ method, allowed: 'GET', sendError, res, requestId })) return true;
            return withError(
                { sendError, res, requestId, status: 500, code: 'LOGS_FILES_ERROR', defaultMessage: '로그 파일 목록 조회에 실패했습니다.' },
                async () => {
                    const logDir = path.join(process.cwd(), 'logs');
                    if (!fs.existsSync(logDir)) {
                        return sendSuccess(res, requestId, { files: [] });
                    }
                    const files = fs.readdirSync(logDir)
                        .filter((f) => f.endsWith('.log'))
                        .sort((a, b) => b.localeCompare(a));
                    return sendSuccess(res, requestId, { files });
                }
            );
        }

        if (pathname === '/api/v1/logs/read') {
            if (!ensureMethod({ method, allowed: 'GET', sendError, res, requestId })) return true;
            return withError(
                { sendError, res, requestId, status: 500, code: 'LOGS_READ_ERROR', defaultMessage: '로그 파일 읽기에 실패했습니다.' },
                async () => {
                    const filename = searchParams.get('file');
                    if (!filename || !filename.endsWith('.log') || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
                        return sendError(res, requestId, 400, 'INVALID_FILE', '잘못된 파일 이름입니다.');
                    }
                    const logFile = path.join(process.cwd(), 'logs', filename);
                    if (!fs.existsSync(logFile)) {
                        return sendError(res, requestId, 404, 'FILE_NOT_FOUND', '로그 파일을 찾을 수 없습니다.');
                    }
                    const content = fs.readFileSync(logFile, 'utf-8');
                    return sendSuccess(res, requestId, { file: filename, content });
                }
            );
        }

        if (pathname === '/api/v1/config/status') {
            if (!ensureMethod({ method, allowed: 'GET', sendError, res, requestId })) return true;
            console.log(`[Status API] Reporting version: ${APP_VERSION}`);
            return sendSuccess(res, requestId, {
                ready: CONFIG.CONFIG_READY === true,
                sourceType: String(CONFIG.CONFIG_SOURCE_TYPE || ''),
                sourcePath: String(CONFIG.CONFIG_SOURCE_PATH || ''),
                message: String(CONFIG.CONFIG_ERROR_MESSAGE || ''),
                version: String(APP_VERSION || '0.0.0')
            });
        }

        if (pathname === '/api/v1/sheets/ensure') {
            if (!ensureMethod({ method, allowed: ['GET', 'POST'], sendError, res, requestId })) return true;
            return withError(
                { sendError, res, requestId, status: 400, code: 'SHEETS_NOT_READY', defaultMessage: '필수 시트 준비에 실패했습니다.' },
                async () => {
                    const force = parseBoolQuery(searchParams.get('force'));
                    const data = await ensureSheetsReadyForUi({ force });
                    return sendSuccess(res, requestId, data);
                }
            );
        }

        return false;
    };
}

module.exports = {
    createSystemRouteHandler
};

