function createLegacyApiRouteHandler(deps = {}) {
    const {
        APP_VERSION,
        Logger,
        Updater,
        Utils,
        fs,
        path,
        CONFIG,
        License,
        ShoppingManager,
        parseBoolQuery,
        ensureSheetsReadyForUi,
        toFeatureMap,
        getFeatureInt,
        resolveMaxBlogPostsPerRun,
        resolveMaxShoppingPostsPerRun,
        checkNaverSessionForUi,
        getNaverLoginStatus,
        getNaverLoginState,
        setNaverLoginState,
        runNaverLoginFlowForUi,
        SHOPPING_IMAGE_SLOT_MAP,
        parseBase64ImagePayload,
        resolveWritableConfigPath,
        tryResolveReadableConfigSource,
        readConfigRaw,
        buildDefaultConfigTemplate,
        applyConfigUpdates,
        parseConfigValue,
        applyRuntimeConfigFromMajor,
        parseMajorFieldsFromRequest,
        syncAutoRunnerWithConfig,
        syncShoppingAutoRunnerWithConfig,
        resolveLocalImagePathFromSource,
        getContentType,
        resolveRuntimePath,
        executeQuickPublish,
        executeShoppingQuickPublish,
        sortTopicItems,
        getBlogRuntimeLogMap,
        sortShoppingItems,
        getShoppingRuntimeLogMap,
        parseIntSafe,
        normalizeSortDir,
        executeBlogBatchRowsAction,
        executeBlogRowAction,
        executeShoppingBatchRowsAction,
        executeShoppingAutoManualAction,
        executeShoppingRowUpdate,
        executeBlogTopicUpdate,
        executeTrendCollectAction,
        executeTrendsToTopicsAction,
        executeKeywordsToTopicsAction,
        sendSuccess,
        sendError
    } = deps;

    return async function tryHandleLegacyApi(ctx = {}) {
        const { requestId, method, pathname, searchParams, requestBody, res } = ctx;

        if (pathname === '/api/v1/health') {
            if (method !== 'GET') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            return sendSuccess(res, requestId, { status: 'ok', version: APP_VERSION });
        }

        if (pathname === '/api/v1/system/update/check') {
            if (method !== 'GET') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            try {
                const updateInfo = await Updater.checkForUpdate();
                return sendSuccess(res, requestId, updateInfo || { hasUpdate: false });
            } catch (e) {
                return sendError(res, requestId, 500, 'UPDATE_CHECK_ERROR', e.message);
            }
        }

        if (pathname === '/api/v1/system/update/apply') {
            if (method !== 'POST') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            try {
                await Updater.applyUpdate(() => {});
                return sendSuccess(res, requestId, { success: true });
            } catch (e) {
                return sendError(res, requestId, 500, 'UPDATE_APPLY_ERROR', e.message);
            }
        }

        if (pathname === '/api/v1/system/update/restart') {
            if (method !== 'POST') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            sendSuccess(res, requestId, { success: true });
            setTimeout(() => {
                Updater.restart();
            }, 1000);
            return true;
        }

        if (pathname === '/api/v1/system/restart') {
            if (method !== 'POST') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            Logger.info('🔄 [System] UI에서 서버 재시작 요청');
            sendSuccess(res, requestId, { success: true, message: '서버를 재시작합니다.' });
            setTimeout(() => {
                Updater.restart();
            }, 1000);
            return true;
        }

        if (pathname === '/api/v1/system/stop') {
            if (method !== 'POST') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            Logger.info('🛑 [System] UI에서 서버 종료 요청');
            sendSuccess(res, requestId, { success: true, message: '서버를 종료합니다.' });
            setTimeout(() => {
                process.exit(0);
            }, 1000);
            return true;
        }

        if (pathname === '/api/v1/dashboard/summary') {
            if (method !== 'GET') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            try {
                const summary = await Utils.getDashboardSummary();
                return sendSuccess(res, requestId, summary);
            } catch (e) {
                return sendError(res, requestId, 500, 'DASHBOARD_SUMMARY_ERROR', e.message);
            }
        }

        if (pathname === '/api/v1/dashboard/logs') {
            if (method !== 'GET') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            try {
                const logs = Logger.getRecentLogs(20);
                return sendSuccess(res, requestId, { logs });
            } catch (e) {
                return sendError(res, requestId, 500, 'DASHBOARD_LOGS_ERROR', e.message);
            }
        }

        if (pathname === '/api/v1/logs/files') {
            if (method !== 'GET') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            try {
                const logDir = path.join(process.cwd(), 'logs');
                if (!fs.existsSync(logDir)) {
                    return sendSuccess(res, requestId, { files: [] });
                }
                const files = fs.readdirSync(logDir)
                    .filter(f => f.endsWith('.log'))
                    .sort((a, b) => b.localeCompare(a));
                return sendSuccess(res, requestId, { files });
            } catch (e) {
                return sendError(res, requestId, 500, 'LOGS_FILES_ERROR', e.message);
            }
        }

        if (pathname === '/api/v1/logs/read') {
            if (method !== 'GET') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            try {
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
            } catch (e) {
                return sendError(res, requestId, 500, 'LOGS_READ_ERROR', e.message);
            }
        }

        if (pathname === '/api/v1/config/status') {
            if (method !== 'GET') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
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
            if (!['GET', 'POST'].includes(method)) return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            const force = parseBoolQuery(searchParams.get('force'));
            try {
                const data = await ensureSheetsReadyForUi({ force });
                return sendSuccess(res, requestId, data);
            } catch (e) {
                return sendError(res, requestId, 400, 'SHEETS_NOT_READY', e.message || '필수 시트 준비에 실패했습니다.');
            }
        }

        if (pathname === '/api/v1/license/status') {
            if (method !== 'GET') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            const quiet = parseBoolQuery(searchParams.get('quiet'));
            const status = await License.checkLicenseStatus({ quiet });
            if (!status.success) {
                return sendError(res, requestId, 400, 'LICENSE_STATUS_FAILED', status.message);
            }
            return sendSuccess(res, requestId, {
                planCode: status.planCode || '',
                planName: status.planDisplayName || status.planCode || '',
                createdAt: status.createdAt || '',
                usageLimit: status.usageLimit,
                usageCount: status.usageCount,
                remaining: status.remaining,
                features: toFeatureMap(status.features)
            });
        }

        if (pathname === '/api/v1/capabilities') {
            if (method !== 'GET') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            const quiet = parseBoolQuery(searchParams.get('quiet'));
            const status = await License.checkLicenseStatus({ quiet });
            if (!status.success) {
                return sendError(res, requestId, 400, 'CAPABILITY_RESOLVE_FAILED', status.message);
            }
            const features = toFeatureMap(status.features);
            const maxBlogPosts = getFeatureInt(features, 'max_blog_posts_per_run', resolveMaxBlogPostsPerRun());
            const maxShoppingPosts = getFeatureInt(features, 'max_shopping_posts_per_run', resolveMaxShoppingPostsPerRun());

            return sendSuccess(res, requestId, {
                planCode: status.planCode || '',
                planName: status.planDisplayName || status.planCode || '',
                features,
                limits: {
                    max_blog_posts_per_run: maxBlogPosts,
                    max_shopping_posts_per_run: maxShoppingPosts
                }
            });
        }

        if (pathname === '/api/v1/session/naver') {
            if (method !== 'GET') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            const session = await checkNaverSessionForUi();
            return sendSuccess(res, requestId, {
                valid: Boolean(session.ok),
                reason: session.reason || '',
                message: session.message || '',
                checkedAt: new Date().toISOString()
            });
        }

        if (pathname === '/api/v1/session/naver-login') {
            if (method !== 'GET') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            return sendSuccess(res, requestId, getNaverLoginStatus());
        }

        if (pathname === '/api/v1/session/naver-login/start') {
            if (method !== 'POST') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');

            const naverLoginState = getNaverLoginState();
            if (naverLoginState.status === 'running') {
                return sendError(res, requestId, 409, 'NAVER_LOGIN_ALREADY_RUNNING', '이미 로그인 진행 중입니다. 브라우저 창을 확인해 주세요.');
            }

            Logger.info('🔐 [UI] 네이버 로그인 시작 요청 수신');
            setNaverLoginState({
                status: 'running',
                message: '로그인 프로세스를 시작합니다...',
                startedAt: new Date().toISOString(),
                finishedAt: null,
                detectedBy: '',
                error: ''
            });

            runNaverLoginFlowForUi().catch((e) => {
                setNaverLoginState({
                    status: 'failed',
                    message: '로그인 실패',
                    finishedAt: new Date().toISOString(),
                    error: String(e?.message || 'unknown error')
                });
            });

            return sendSuccess(res, requestId, getNaverLoginStatus(), 202);
        }

        if (pathname === '/api/v1/settings/shopping-image') {
            if (method !== 'POST') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            try {
                const slot = String(requestBody?.slot || '').trim().toLowerCase();
                const slotInfo = SHOPPING_IMAGE_SLOT_MAP[slot];
                if (!slotInfo) {
                    return sendError(res, requestId, 400, 'INVALID_SLOT', 'slot은 ftc, cta1, cta2, cta3 중 하나여야 합니다.');
                }

                const { buffer, ext } = parseBase64ImagePayload(requestBody || {});
                const writablePath = resolveWritableConfigPath();
                const configDir = path.dirname(writablePath);
                const imageDir = path.join(configDir, 'images');
                fs.mkdirSync(imageDir, { recursive: true });

                const filename = `${slotInfo.fileBase}${ext}`;
                const filePath = path.join(imageDir, filename);
                fs.writeFileSync(filePath, buffer);

                const configValue = `./config/images/${filename}`;

                const configSource = tryResolveReadableConfigSource();
                const raw = configSource ? readConfigRaw(configSource) : buildDefaultConfigTemplate();
                const nextRaw = applyConfigUpdates(raw, {
                    [slotInfo.key]: configValue
                });
                fs.writeFileSync(writablePath, nextRaw, 'utf-8');

                const mergedFields = {
                    LISTEN_HOST: parseConfigValue(nextRaw, 'LISTEN_HOST') || CONFIG.LISTEN_HOST,
                    LISTEN_PORT: parseConfigValue(nextRaw, 'LISTEN_PORT') || CONFIG.LISTEN_PORT,
                    NAVER_ID: parseConfigValue(nextRaw, 'NAVER_ID') || CONFIG.NAVER_ID,
                    GEMINI_API_KEY: parseConfigValue(nextRaw, 'GEMINI_API_KEY') || CONFIG.GEMINI_API_KEY,
                    GOOGLE_SHEET_URL: parseConfigValue(nextRaw, 'GOOGLE_SHEET_URL') || CONFIG.GOOGLE_SHEET_URL,
                    HEADLESS: parseConfigValue(nextRaw, 'HEADLESS'),
                    TYPING_SPEED: parseConfigValue(nextRaw, 'TYPING_SPEED'),
                    FTC_DISCLOSURE_IMAGE_URL: parseConfigValue(nextRaw, 'FTC_DISCLOSURE_IMAGE_URL') || CONFIG.FTC_DISCLOSURE_IMAGE_URL,
                    SHOPPING_CTA_IMAGE_URL1: parseConfigValue(nextRaw, 'SHOPPING_CTA_IMAGE_URL1') || CONFIG.SHOPPING_CTA_IMAGE_URL1,
                    SHOPPING_CTA_IMAGE_URL2: parseConfigValue(nextRaw, 'SHOPPING_CTA_IMAGE_URL2') || CONFIG.SHOPPING_CTA_IMAGE_URL2,
                    SHOPPING_CTA_IMAGE_URL3: parseConfigValue(nextRaw, 'SHOPPING_CTA_IMAGE_URL3') || CONFIG.SHOPPING_CTA_IMAGE_URL3
                };
                applyRuntimeConfigFromMajor(parseMajorFieldsFromRequest(mergedFields));
                syncAutoRunnerWithConfig();
                syncShoppingAutoRunnerWithConfig();
                CONFIG.CONFIG_READY = true;
                CONFIG.CONFIG_SOURCE_TYPE = 'config';
                CONFIG.CONFIG_SOURCE_PATH = writablePath;
                CONFIG.CONFIG_ERROR_MESSAGE = '';

                return sendSuccess(res, requestId, {
                    slot,
                    key: slotInfo.key,
                    value: configValue,
                    savedPath: filePath,
                    configPath: writablePath,
                    message: '쇼핑 이미지 등록 완료'
                });
            } catch (e) {
                return sendError(res, requestId, 400, 'SHOPPING_IMAGE_SAVE_FAILED', e.message || '쇼핑 이미지 저장에 실패했습니다.');
            }
        }

        if (pathname === '/api/v1/settings/shopping-image/preview') {
            if (method !== 'GET') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            const slot = String(searchParams.get('slot') || '').trim().toLowerCase();
            const slotInfo = SHOPPING_IMAGE_SLOT_MAP[slot];
            if (!slotInfo) {
                return sendError(res, requestId, 400, 'INVALID_SLOT', 'slot은 ftc, cta1, cta2, cta3 중 하나여야 합니다.');
            }

            const sourceOverride = String(searchParams.get('source') || '').trim();
            let source = sourceOverride;
            if (!source) {
                const configSource = tryResolveReadableConfigSource();
                const raw = configSource ? readConfigRaw(configSource) : buildDefaultConfigTemplate();
                const fields = deps.buildMajorSettings(raw, configSource || { path: resolveWritableConfigPath(), sourceType: 'generated' }).fields;
                source = String(fields[slotInfo.key] || '').trim();
            }
            if (!source) {
                return sendError(res, requestId, 404, 'IMAGE_SOURCE_EMPTY', '설정된 이미지가 없습니다.');
            }
            if (/^https?:\/\//i.test(source)) {
                return sendError(res, requestId, 400, 'INVALID_PREVIEW_SOURCE', '원격 URL 이미지는 브라우저가 직접 표시합니다.');
            }

            const localPath = resolveLocalImagePathFromSource(source);
            if (!localPath || !fs.existsSync(localPath)) {
                return sendError(res, requestId, 404, 'IMAGE_FILE_NOT_FOUND', '로컬 이미지를 찾을 수 없습니다.');
            }

            const body = fs.readFileSync(localPath);
            res.writeHead(200, {
                'Content-Type': getContentType(localPath),
                'Cache-Control': 'no-store'
            });
            res.end(body);
            return true;
        }

        if (pathname === '/api/v1/settings/google-auth/status') {
            if (method !== 'GET') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            try {
                const rawPath = CONFIG.GOOGLE_AUTH_JSON;
                const keyFilePath = CONFIG.GOOGLE_AUTH_JSON_PATH || resolveRuntimePath(rawPath, { mustExist: false });

                if (fs.existsSync(keyFilePath)) {
                    const fileContent = fs.readFileSync(keyFilePath, 'utf-8');
                    const credentials = JSON.parse(fileContent);
                    return sendSuccess(res, requestId, {
                        configured: true,
                        clientEmail: credentials.client_email || '알 수 없음',
                        projectId: credentials.project_id || '알 수 없음',
                        path: keyFilePath
                    });
                } else {
                    return sendSuccess(res, requestId, {
                        configured: false,
                        message: '설정된 Google Auth JSON 파일을 찾을 수 없습니다.'
                    });
                }
            } catch (e) {
                return sendSuccess(res, requestId, {
                    configured: false,
                    message: `오류: ${e.message}`
                });
            }
        }

        if (pathname === '/api/v1/settings/google-auth') {
            if (method !== 'POST') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            try {
                const content = String(requestBody?.content || '').trim();
                if (!content) {
                    return sendError(res, requestId, 400, 'INVALID_CONTENT', 'Google Auth JSON 내용이 없습니다.');
                }

                let parsed;
                try {
                    parsed = JSON.parse(content);
                } catch (_e) {
                    return sendError(res, requestId, 400, 'INVALID_JSON', '올바른 JSON 형식이 아닙니다.');
                }

                if (parsed.type !== 'service_account' || !parsed.project_id || !parsed.private_key || !parsed.client_email) {
                    return sendError(res, requestId, 400, 'INVALID_SERVICE_ACCOUNT', '유효한 Google Service Account JSON 형식이 아닙니다. (type, project_id, private_key, client_email 필수)');
                }

                const rawPath = CONFIG.GOOGLE_AUTH_JSON;
                const keyFilePath = CONFIG.GOOGLE_AUTH_JSON_PATH || resolveRuntimePath(rawPath, { mustExist: false });
                const authDir = path.dirname(keyFilePath);
                if (!fs.existsSync(authDir)) {
                    fs.mkdirSync(authDir, { recursive: true });
                }

                fs.writeFileSync(keyFilePath, JSON.stringify(parsed, null, 2), 'utf-8');
                Utils.clearGoogleAuthCache();

                return sendSuccess(res, requestId, {
                    savedPath: keyFilePath,
                    clientEmail: parsed.client_email,
                    projectId: parsed.project_id,
                    message: 'Google Service Account JSON 저장 완료 및 캐시 초기화 성공'
                });
            } catch (e) {
                return sendError(res, requestId, 400, 'SAVE_FAILED', e.message || '저장 중 오류가 발생했습니다.');
            }
        }

        if (pathname === '/api/v1/blog/quick-publish') {
            if (method !== 'POST') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            const result = await executeQuickPublish(requestBody || {});
            if (!result.success) {
                return sendError(res, requestId, 400, result.code || 'QUICK_PUBLISH_FAILED', result.message || '빠른발행 요청에 실패했습니다.');
            }
            return sendSuccess(res, requestId, result.data);
        }

        if (pathname === '/api/v1/shopping/quick-publish') {
            if (method !== 'POST') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            const result = await executeShoppingQuickPublish(requestBody || {});
            if (!result.success) {
                return sendError(res, requestId, 400, result.code || 'SHOPPING_QUICK_PUBLISH_FAILED', result.message || '쇼핑 빠른발행 요청에 실패했습니다.');
            }
            return sendSuccess(res, requestId, result.data);
        }

        if (pathname === '/api/v1/shopping/preview') {
            if (method !== 'GET') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            const shortUrl = String(searchParams.get('url') || '').trim();
            if (!shortUrl) {
                return sendError(res, requestId, 400, 'INVALID_SHOPPING_URL', '쇼핑 URL은 필수입니다.');
            }
            if (!/^https?:\/\//i.test(shortUrl)) {
                return sendError(res, requestId, 400, 'INVALID_SHOPPING_URL', '쇼핑 URL 형식이 올바르지 않습니다. (http/https)');
            }

            try {
                const preview = await ShoppingManager.previewFromShortUrl(shortUrl);
                return sendSuccess(res, requestId, preview);
            } catch (e) {
                return sendError(res, requestId, 400, 'SHOPPING_PREVIEW_FAILED', e.message || '쇼핑 미리보기에 실패했습니다.');
            }
        }

        if (pathname === '/api/v1/blog/topics') {
            if (method !== 'GET') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            try {
                await ensureSheetsReadyForUi();
            } catch (e) {
                return sendError(res, requestId, 400, 'SHEETS_NOT_READY', e.message || '필수 시트 준비에 실패했습니다.');
            }
            const status = String(searchParams.get('status') || '').trim();
            const q = String(searchParams.get('q') || '').trim();
            const limit = parseIntSafe(searchParams.get('limit'), 50, 1) || 50;
            const offset = parseIntSafe(searchParams.get('offset'), 0, 0) || 0;
            const sortBy = String(searchParams.get('sortBy') || 'rowNumber').trim();
            const sortDir = normalizeSortDir(searchParams.get('sortDir'), 'desc');
            const result = await Utils.readGoogleSheetTopicsAll({ status, q, limit, offset, sortBy, sortDir });
            const runtimeLogMap = getBlogRuntimeLogMap();
            let items = Array.isArray(result.items) ? [...result.items] : [];

            if (runtimeLogMap.size > 0) {
                const existing = new Set(items.map(item => item.rowIndex));
                const missingRuntimeRowIndices = Array.from(runtimeLogMap.keys()).filter(rowIndex => !existing.has(rowIndex));
                if (missingRuntimeRowIndices.length > 0) {
                    const allTopics = await Utils.readGoogleSheetTopicsAll({ limit: 100000, offset: 0, sortBy, sortDir });
                    const allItems = Array.isArray(allTopics.items) ? allTopics.items : [];
                    const byRowIndex = new Map(allItems.map(item => [item.rowIndex, item]));
                    for (const rowIndex of missingRuntimeRowIndices) {
                        const found = byRowIndex.get(rowIndex);
                        if (found) items.push(found);
                    }
                    items = sortTopicItems(items, sortBy, sortDir);
                }
            }

            items = items.map(item => ({
                ...item,
                runtimeLog: runtimeLogMap.get(item.rowIndex) || ''
            }));
            items = sortTopicItems(items, sortBy, sortDir);
            return sendSuccess(res, requestId, {
                ...result,
                total: Math.max(Number(result.total || 0), items.length),
                items
            });
        }

        if (pathname === '/api/v1/shopping/items') {
            if (method !== 'GET') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            try {
                await ensureSheetsReadyForUi();
            } catch (e) {
                return sendError(res, requestId, 400, 'SHEETS_NOT_READY', e.message || '필수 시트 준비에 실패했습니다.');
            }
            const status = String(searchParams.get('status') || '').trim();
            const q = String(searchParams.get('q') || '').trim();
            const limit = parseIntSafe(searchParams.get('limit'), 50, 1) || 50;
            const offset = parseIntSafe(searchParams.get('offset'), 0, 0) || 0;
            const sortBy = String(searchParams.get('sortBy') || 'rowNumber').trim();
            const sortDir = normalizeSortDir(searchParams.get('sortDir'), 'desc');
            const result = await Utils.readGoogleSheetShoppingAll({ status, q, limit, offset, sortBy, sortDir });
            const runtimeLogMap = getShoppingRuntimeLogMap();
            let items = Array.isArray(result.items) ? [...result.items] : [];

            if (runtimeLogMap.size > 0) {
                const existing = new Set(items.map(item => item.rowIndex));
                const missingRuntimeRowIndices = Array.from(runtimeLogMap.keys()).filter(rowIndex => !existing.has(rowIndex));
                if (missingRuntimeRowIndices.length > 0) {
                    const allShopping = await Utils.readGoogleSheetShoppingAll({ limit: 100000, offset: 0, sortBy, sortDir });
                    const allItems = Array.isArray(allShopping.items) ? allShopping.items : [];
                    const byRowIndex = new Map(allItems.map(item => [item.rowIndex, item]));
                    for (const rowIndex of missingRuntimeRowIndices) {
                        const found = byRowIndex.get(rowIndex);
                        if (found) items.push(found);
                    }
                }
            }

            items = items.map(item => ({
                ...item,
                runtimeLog: runtimeLogMap.get(item.rowIndex) || ''
            }));
            items = sortShoppingItems(items, sortBy, sortDir);
            return sendSuccess(res, requestId, {
                ...result,
                total: Math.max(Number(result.total || 0), items.length),
                items
            });
        }

        if (pathname === '/api/v1/blog/action') {
            if (method !== 'POST') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            const body = requestBody || {};
            const action = String(body.action || '').trim().toLowerCase();
            const result = (action === 'batch' && Array.isArray(body.rowIndices))
                ? await executeBlogBatchRowsAction(body)
                : await executeBlogRowAction(body);
            if (!result.success) {
                return sendError(res, requestId, 400, result.code || 'BLOG_ACTION_FAILED', result.message || '블로그 작업 요청에 실패했습니다.');
            }
            return sendSuccess(res, requestId, result.data);
        }

        if (pathname === '/api/v1/shopping/action') {
            if (method !== 'POST') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            const body = requestBody || {};
            const action = String(body.action || '').trim().toLowerCase();
            if (action !== 'batch' || !Array.isArray(body.rowIndices)) {
                return sendError(res, requestId, 400, 'INVALID_ACTION', 'shopping action은 batch만 지원합니다.');
            }
            const result = await executeShoppingBatchRowsAction(body);
            if (!result.success) {
                return sendError(res, requestId, 400, result.code || 'SHOPPING_ACTION_FAILED', result.message || '쇼핑 작업 요청에 실패했습니다.');
            }
            return sendSuccess(res, requestId, result.data);
        }

        if (pathname === '/api/v1/shopping/auto/run-manual') {
            if (method !== 'POST') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            Logger.info('🚀 [UI][SHOPPING_AUTO] 수동 실행 요청 수신');
            const result = await executeShoppingAutoManualAction(requestBody || {});
            if (!result.success) {
                Logger.warn(`⚠️ [UI][SHOPPING_AUTO] 수동 실행 실패: ${result.message || result.code || 'unknown'}`);
                return sendError(res, requestId, 400, result.code || 'SHOPPING_AUTO_MANUAL_FAILED', result.message || '쇼핑 자동발행 수동 실행에 실패했습니다.');
            }
            const summary = result?.data?.summary || {};
            Logger.info(`✅ [UI][SHOPPING_AUTO] 수동 실행 완료 (shopping: ${Number(summary?.shoppingSuccess || 0)}/${Number(summary?.shoppingAttempted || 0)})`);
            return sendSuccess(res, requestId, result.data);
        }

        if (pathname === '/api/v1/shopping/row/update') {
            if (method !== 'POST') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            const result = await executeShoppingRowUpdate(requestBody || {});
            if (!result.success) {
                return sendError(res, requestId, 400, result.code || 'SHOPPING_ROW_UPDATE_FAILED', result.message || '쇼핑 행 수정에 실패했습니다.');
            }
            return sendSuccess(res, requestId, result.data);
        }

        if (pathname === '/api/v1/blog/topic/update') {
            if (method !== 'POST') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            const result = await executeBlogTopicUpdate(requestBody || {});
            if (!result.success) {
                return sendError(res, requestId, 400, result.code || 'TOPIC_UPDATE_FAILED', result.message || '토픽 수정에 실패했습니다.');
            }
            return sendSuccess(res, requestId, result.data);
        }

        if (pathname === '/api/v1/trends/collect') {
            if (method !== 'POST') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            const result = await executeTrendCollectAction(requestBody || {});
            if (!result.success) {
                return sendError(res, requestId, 400, result.code || 'TRENDS_COLLECT_FAILED', result.message || '트렌드 수집에 실패했습니다.');
            }
            return sendSuccess(res, requestId, result.data);
        }

        if (pathname === '/api/v1/trends/items') {
            if (method !== 'GET') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            try {
                await ensureSheetsReadyForUi();
            } catch (e) {
                return sendError(res, requestId, 400, 'SHEETS_NOT_READY', e.message || '필수 시트 준비에 실패했습니다.');
            }
            const status = String(searchParams.get('status') || '').trim();
            const q = String(searchParams.get('q') || '').trim();
            const limit = parseIntSafe(searchParams.get('limit'), 100, 1) || 100;
            const offset = parseIntSafe(searchParams.get('offset'), 0, 0) || 0;
            const sortBy = String(searchParams.get('sortBy') || 'rowNumber').trim();
            const sortDir = normalizeSortDir(searchParams.get('sortDir'), 'desc');
            const result = await Utils.readGoogleSheetTrendsAll({ status, q, limit, offset, sortBy, sortDir });
            return sendSuccess(res, requestId, result);
        }

        if (pathname === '/api/v1/keywords/items') {
            if (method !== 'GET') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            try {
                await ensureSheetsReadyForUi();
            } catch (e) {
                return sendError(res, requestId, 400, 'SHEETS_NOT_READY', e.message || '필수 시트 준비에 실패했습니다.');
            }
            const status = String(searchParams.get('status') || '').trim();
            const q = String(searchParams.get('q') || '').trim();
            const limit = parseIntSafe(searchParams.get('limit'), 100, 1) || 100;
            const offset = parseIntSafe(searchParams.get('offset'), 0, 0) || 0;
            const result = await Utils.readGoogleSheetKeywordsAll({ status, q, limit, offset });
            return sendSuccess(res, requestId, result);
        }

        if (pathname === '/api/v1/trends/to-topics') {
            if (method !== 'POST') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            const result = await executeTrendsToTopicsAction(requestBody || {});
            if (!result.success) {
                return sendError(res, requestId, 400, result.code || 'TRENDS_TO_TOPICS_FAILED', result.message || 'trends→topics 처리에 실패했습니다.');
            }
            return sendSuccess(res, requestId, result.data);
        }

        if (pathname === '/api/v1/keywords/to-topics') {
            if (method !== 'POST') return sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 메서드입니다.');
            const result = await executeKeywordsToTopicsAction(requestBody || {});
            if (!result.success) {
                return sendError(res, requestId, 400, result.code || 'KEYWORDS_TO_TOPICS_FAILED', result.message || 'keywords→topics 처리에 실패했습니다.');
            }
            return sendSuccess(res, requestId, result.data);
        }

        return false;
    };
}

module.exports = {
    createLegacyApiRouteHandler
};
