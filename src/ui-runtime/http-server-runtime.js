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
        composeUiStyles,
        composeUiScript,
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
        startCardNewsRssIntake,
        stopCardNewsRssIntake,
        startRecommendationDelivery,
        stopRecommendationDelivery,
        recordUiActivity,
        handleGoogleOAuthCallback,
        initTelegramBotService,
        stopTelegramBotService
    } = deps;

    let activeUiServer = null;
    let optionalStartupPromise = null;

    async function runOptionalStartupStep(name, operation) {
        try {
            await Promise.resolve().then(operation);
            Logger.debug(`[UI] Optional startup complete: ${name}`);
            return { name, ok: true };
        } catch (error) {
            Logger.error(`❌ [UI] 선택 백그라운드 기능 시작 실패 (${name}): ${error.message}`, error);
            return { name, ok: false, error: error.message };
        }
    }

    function startOptionalServices(options = {}) {
        const safeMode = options.safeMode === true;
        if (safeMode) return Promise.resolve([]);
        if (optionalStartupPromise) return optionalStartupPromise;
        optionalStartupPromise = (() => {
            const steps = [
                runOptionalStartupStep('auto-runners', () => syncAutoRunnerWithConfig()),
                runOptionalStartupStep('telegram', () => initTelegramBotService())
            ];
            if (typeof triggerSnsStartupDiscovery === 'function') {
                steps.push(runOptionalStartupStep('sns-discovery', () => triggerSnsStartupDiscovery()));
            }
            if (typeof startCardNewsRssIntake === 'function') {
                steps.push(runOptionalStartupStep('card-news-rss', () => startCardNewsRssIntake()));
            }
            if (typeof startRecommendationDelivery === 'function') {
                steps.push(runOptionalStartupStep('recommendation-delivery', () => startRecommendationDelivery()));
            }
            return Promise.all(steps);
        })();
        return optionalStartupPromise;
    }

    async function startUiServer(options = {}) {
        const safeMode = options.safeMode === true;
        const host = normalizeListenHost(options.host, normalizeListenHost(CONFIG.LISTEN_HOST, defaultHost));
        const port = options.allowEphemeralPort === true && Number(options.port) === 0
            ? 0
            : Number.isFinite(Number(options.port))
                ? normalizeListenPort(options.port, defaultPort)
            : normalizeListenPort(CONFIG.LISTEN_PORT, defaultPort);
        const uiRoot = resolveUiRoot();
        if (!uiRoot) {
            throw new Error('UI 정적 파일 폴더를 찾을 수 없습니다. (ui/)');
        }
        const composedUiShell = composeUiShell(uiRoot);
        const composedUiStyles = composeUiStyles(uiRoot);
        const composedUiScript = composeUiScript(uiRoot);

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
                    if (method === 'POST' || method === 'PUT') {
                        let limitBytes = 1024 * 1024;
                        if (
                            pathname === '/api/v1/settings/shopping-image'
                            || pathname === '/api/v1/card-news/images/import'
                            || /\/api\/v1\/blog\/manuscript-drafts\/[^/]+\/image-slots\/[^/]+\/import$/.test(pathname)
                        ) {
                            limitBytes = 15 * 1024 * 1024;
                        } else if (pathname === '/api/v1/social/manual/publish') {
                            limitBytes = 85 * 1024 * 1024;
                        } else if (
                            pathname === '/api/v1/card-news/zip/preview'
                            || pathname === '/api/v1/card-news/zip/import'
                        ) {
                            limitBytes = 55 * 1024 * 1024;
                        } else if (pathname === '/api/v1/blog/local-markdown/publish') {
                            limitBytes = 40 * 1024 * 1024;
                        } else if (pathname === '/api/v1/blog/manuscript-drafts/folder') {
                            limitBytes = 55 * 1024 * 1024;
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
                    : (requestedPath === 'styles.css'
                        ? composedUiStyles
                        : (requestedPath === 'app.js' ? composedUiScript : fs.readFileSync(fullPath)));
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

        const boundAddress = typeof server.address === 'function' ? server.address() : null;
        const boundPort = Number(boundAddress?.port || port);

        if (safeMode) {
            Logger.warn('[UI] 안전 모드: 자동 실행기와 Telegram 시작을 건너뜁니다.');
        }

        const openHost = host === '0.0.0.0' ? '127.0.0.1' : host;
        Logger.info(`✅ UI 서버가 성공적으로 시작되었습니다: http://${openHost}:${boundPort}`);
        try {
            recordUiActivity({
                category: 'system',
                type: 'ui_server_started',
                title: 'UI 서버 시작',
                detail: `http://${openHost}:${boundPort}`
            });
        } catch (error) {
            Logger.warn(`⚠️ [UI] 시작 활동 기록을 건너뜁니다: ${error.message}`);
        }

        const startOptional = () => startOptionalServices({ safeMode });
        if (options.deferOptionalStartup !== true) await startOptional();
        return { server, host, port: boundPort, openHost, startOptionalServices: startOptional };
    }

    async function reloadUiServer(newHost, newPort) {
        if (activeUiServer) {
            Logger.info('🔄 설정 변경 감지: 기존 UI 서버(포트)를 종료하고 재시작합니다...');
            if (typeof stopCardNewsRssIntake === 'function') stopCardNewsRssIntake();
            if (typeof stopRecommendationDelivery === 'function') stopRecommendationDelivery();
            await stopTelegramBotService();
            await new Promise((resolve) => {
                activeUiServer.close(() => {
                    activeUiServer = null;
                    optionalStartupPromise = null;
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
        startOptionalServices,
        startUiServer
    };
}

module.exports = {
    createUiHttpServerRuntime
};
