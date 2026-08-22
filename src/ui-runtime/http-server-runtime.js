function createUiHttpServerRuntime(deps = {}) {
    const {
        http,
        fs,
        path,
        Logger,
        CONFIG,
        defaultHost,
        defaultPort,
        resolveUiRoot,
        composeUiShell,
        normalizeListenHost,
        normalizeListenPort,
        createRequestId,
        readJsonBody,
        handleApi,
        sanitizePathname,
        shouldServeUiShell,
        sendError,
        getContentType,
        syncAutoRunnerWithConfig,
        triggerSnsStartupDiscovery,
        syncShoppingAutoRunnerWithConfig,
        recordUiActivity,
        handleGoogleOAuthCallback,
        initTelegramBotService,
        stopTelegramBotService
    } = deps;

    let activeUiServer = null;

    async function startUiServer(options = {}) {
        const host = normalizeListenHost(options.host, normalizeListenHost(CONFIG.LISTEN_HOST, defaultHost));
        const port = Number.isFinite(Number(options.port))
            ? normalizeListenPort(options.port, defaultPort)
            : normalizeListenPort(CONFIG.LISTEN_PORT, defaultPort);
        const uiRoot = resolveUiRoot();
        if (!uiRoot) {
            throw new Error('UI 정적 파일 폴더를 찾을 수 없습니다. (ui/)');
        }
        const composedUiShell = composeUiShell(uiRoot);

        const server = http.createServer(async (req, res) => {
            const requestId = createRequestId();
            const method = String(req.method || 'GET').toUpperCase();
            const url = new URL(String(req.url || '/'), `http://127.0.0.1:${port}`);
            const pathname = url.pathname;

            try {
                if (pathname === '/oauth/google/callback') {
                    const handled = await handleGoogleOAuthCallback({ url, res });
                    if (handled) return;
                }

                if (pathname.startsWith('/api/v1/')) {
                    const startTime = Date.now();
                    Logger.debug(`[API][${requestId}] Request: ${method} ${pathname}`);
                    let requestBody = {};
                    if (method === 'POST') {
                        let limitBytes = 1024 * 1024;
                        if (
                            pathname === '/api/v1/settings/shopping-image'
                            || pathname === '/api/v1/social/manual/publish'
                        ) {
                            limitBytes = 15 * 1024 * 1024;
                        } else if (pathname === '/api/v1/blog/local-markdown/publish') {
                            limitBytes = 40 * 1024 * 1024;
                        }
                        requestBody = await readJsonBody(req, limitBytes);
                    }
                    const apiHandled = await handleApi(requestId, method, pathname, url.searchParams, requestBody, res);
                    const duration = Date.now() - startTime;
                    if (apiHandled !== false) {
                        Logger.debug(`[API][${requestId}] Responded in ${duration}ms`);
                        return;
                    }
                    Logger.debug(`[API][${requestId}] Not found (${duration}ms)`);
                    return sendError(res, requestId, 404, 'NOT_FOUND', '요청한 API를 찾을 수 없습니다.');
                }

                if (method !== 'GET') {
                    return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
                }

                const safePath = sanitizePathname(pathname);
                const requestedPath = shouldServeUiShell(pathname, safePath)
                    ? 'index.html'
                    : safePath;
                const fullPath = path.join(uiRoot, requestedPath);
                const rootPrefix = `${uiRoot}${path.sep}`;
                if (!(fullPath === uiRoot || fullPath.startsWith(rootPrefix))) {
                    return sendError(res, requestId, 403, 'FORBIDDEN_PATH', '허용되지 않은 경로입니다.');
                }
                if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
                    return sendError(res, requestId, 404, 'NOT_FOUND', '요청한 리소스를 찾을 수 없습니다.');
                }

                const body = requestedPath === 'index.html'
                    ? composedUiShell
                    : fs.readFileSync(fullPath);
                res.writeHead(200, {
                    'Content-Type': getContentType(fullPath),
                    'Cache-Control': 'no-store'
                });
                res.end(body);
            } catch (error) {
                Logger.error(`❌ UI 서버 요청 처리 실패: ${error.message}`);
                sendError(res, requestId, 500, 'INTERNAL_ERROR', '서버 내부 오류가 발생했습니다.');
            }
        });

        Logger.debug('[UI] Starting HTTP server...');
        await new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen(port, host, () => {
                activeUiServer = server;
                resolve();
            });
        });
        Logger.debug(`[UI] Listening on ${host}:${port}`);

        Logger.debug('[UI] Syncing auto-runners...');
        syncAutoRunnerWithConfig();
        syncShoppingAutoRunnerWithConfig();

        Logger.debug('[UI] Initializing TelegramBotService (UI)...');
        await initTelegramBotService();

        const openHost = host === '0.0.0.0' ? '127.0.0.1' : host;
        Logger.info(`✅ UI 서버가 성공적으로 시작되었습니다: http://${openHost}:${port}`);
        recordUiActivity({
            category: 'system',
            type: 'ui_server_started',
            title: 'UI 서버 시작',
            detail: `http://${openHost}:${port}`
        });
        if (typeof triggerSnsStartupDiscovery === 'function') {
            triggerSnsStartupDiscovery().catch((error) => {
                Logger.error(`❌ [SNS] 앱 시작 시 RSS 확인 요청 실패: ${error.message}`);
            });
        }
        return { server, host, port, openHost };
    }

    async function reloadUiServer(newHost, newPort) {
        if (activeUiServer) {
            Logger.info('🔄 설정 변경 감지: 기존 UI 서버(포트)를 종료하고 재시작합니다...');
            await stopTelegramBotService();
            await new Promise((resolve) => {
                activeUiServer.close(() => {
                    activeUiServer = null;
                    resolve();
                });
            });
        }

        const started = await startUiServer({ host: newHost, port: newPort });
        Logger.info(`✅ UI 서버 재시작 완료: http://${started.openHost}:${started.port}`);
        recordUiActivity({
            category: 'system',
            type: 'ui_server_restarted',
            title: 'UI 서버 재시작 완료',
            detail: `http://${started.openHost}:${started.port}`
        });
        return started;
    }

    return {
        reloadUiServer,
        startUiServer
    };
}

module.exports = {
    createUiHttpServerRuntime
};
