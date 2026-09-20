const { createApiError } = require('../errors');
const { buildLocalMarkdownPreview } = require('../../content/local-markdown-preview');
const {
    parseBlogImageMode,
    generatesBlogImages,
    stripBlogImagePromptBlocks
} = require('../../content/blog-image-mode');
const { recordDashboardActivity } = require('../../activity/dashboard-activity-store');
const { isCommandEnabled, getEnableRelatedPostsAutoLink } = require('../../runtime-feature-flags');
const { createNaverSmartCommentCollector } = require('../../naver/smart-comment-candidate-collector');
const {
    generateSmartCommentDraftBatch,
    generateSmartCommentDrafts
} = require('../../naver/smart-comment-draft-generator');
const { createBlogNextExecutionCoordinator } = require('../../blog-next/execution-coordinator');
const { buildCompletionLinks } = require('../../continuous-publishing/presentation');
const { createManuscriptDraftService } = require('../../content/manuscript-draft-service');
const { buildSetupReadiness } = require('../../account/setup-readiness');

function createContentService(deps = {}) {
    const {
        Utils,
        fs,
        path,
        axios,
        CONFIG,
        License,
        GoogleOAuth,
        BrowserLauncher,
        ShoppingManager,
        Logger,
        checkNaverSessionForUi,
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
        resolveLocalImagePathFromSource,
        getContentType,
        resolveRuntimePath,
        buildMajorSettings,
        ensureSheetsReadyForUi,
        executeQuickPublish,
        executeQuickPreviewPublish,
        getQuickPreviewImagePayload,
        deleteQuickPublishPreviewSession,
        executeLocalMarkdownPublish,
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
        executeShoppingRowUpdate,
        executeBlogTopicUpdate,
        executeBlogTopicsDelete,
        executeShoppingTopicsDelete
    } = deps;
    const blogNextExecutionCoordinator = deps.blogNextExecutionCoordinator
        || createBlogNextExecutionCoordinator();
    let manuscriptDraftService = deps.manuscriptDraftService || null;
    function getManuscriptDraftService() {
        if (!manuscriptDraftService) {
            manuscriptDraftService = createManuscriptDraftService({
                fs,
                path,
                Utils,
                Logger,
                workspaceDir: CONFIG?.WORKSPACE_DIR,
                callWritingImage: typeof Utils?.callWritingImage === 'function' ? Utils.callWritingImage.bind(Utils) : null,
                relatedPosts: {
                    fetchPosts: typeof Utils?.fetchOwnBlogRelatedPosts === 'function'
                        ? ({ title, content }) => Utils.fetchOwnBlogRelatedPosts({ title, content, keywords: [] }, 3)
                        : null,
                    pickHeading: typeof Utils?.pickRelatedPostsHeading === 'function'
                        ? () => Utils.pickRelatedPostsHeading()
                        : null
                }
            });
        }
        return manuscriptDraftService;
    }

    async function resolveRelatedPostsEnabled() {
        try {
            if (typeof License?.checkLicenseStatus !== 'function') return undefined;
            const status = await License.checkLicenseStatus({ quiet: true });
            if (!status?.success) return undefined;
            return getEnableRelatedPostsAutoLink(status.features);
        } catch (_) {
            return undefined;
        }
    }

    async function refreshManuscriptRelatedPosts(draft, enabled, { force = false } = {}) {
        if (enabled !== true || !draft?.draftId) return draft;
        const service = getManuscriptDraftService();
        if (typeof service.refreshDraftRelatedPosts !== 'function') return draft;
        return service.refreshDraftRelatedPosts({
            draftId: draft.draftId,
            revision: draft.revision,
            enabled: true,
            force
        });
    }

    async function runBlogNextExecution(input, task) {
        const lease = blogNextExecutionCoordinator.acquire(input);
        if (!lease) {
            throw createApiError(409, 'BLOG_NEXT_EXECUTION_BUSY', '다른 블로그 작업을 처리하고 있습니다. 현재 실행이 끝난 뒤 다시 시도해 주세요.');
        }
        try {
            return await task();
        } finally {
            lease.release();
        }
    }

    async function executeCompletedLocalMarkdownPublish(requestBody = {}) {
        const result = await executeLocalMarkdownPublish(requestBody);
        if (!result.success) {
            throw createApiError(400, result.code || 'LOCAL_MARKDOWN_PUBLISH_FAILED', result.message || '원고 포스팅에 실패했습니다.');
        }
        return {
            ...result.data,
            completionLinks: buildCompletionLinks({
                postStatus: result.data?.postStatus || requestBody?.postStatus,
                results: result.data?.results,
                config: CONFIG
            })
        };
    }

    async function requireShoppingExecution() {
        const status = await License.checkLicenseStatus({ quiet: true });
        if (!status.success) {
            throw createApiError(400, status.code || 'LICENSE_STATUS_FAILED', status.message);
        }
        if (!isCommandEnabled(status.features, 'shopping')) {
            throw createApiError(403, 'FEATURE_DISABLED', '현재 플랜에서 쇼핑커넥트 실행 기능을 사용할 수 없습니다.');
        }
    }

    let wordpressCategoryConfigLogState = '';
    let smartCommentCollector = deps.smartCommentCollector || null;
    let smartCommentProgress = {
        state: 'idle',
        phase: 'idle',
        message: '대기 중',
        completedCount: 0,
        totalCount: 0,
        batchIndex: 0,
        batchTotal: 0,
        retryAt: '',
        updatedAt: new Date().toISOString()
    };

    function updateSmartCommentProgress(patch = {}) {
        smartCommentProgress = {
            ...smartCommentProgress,
            ...patch,
            updatedAt: new Date().toISOString()
        };
        return smartCommentProgress;
    }

    function getSmartCommentProgressSnapshot() {
        const progress = { ...smartCommentProgress };
        if (progress.phase === 'rate_limited' && progress.retryAt) {
            const remainingSeconds = Math.max(0, Math.ceil((Date.parse(progress.retryAt) - Date.now()) / 1000));
            progress.retryRemainingSeconds = remainingSeconds;
            progress.message = `AI 요청 한도 대기 중 · 약 ${remainingSeconds}초 후 재시도`;
        }
        return progress;
    }

    function markSmartCommentFailed(error) {
        updateSmartCommentProgress({
            state: 'failed',
            phase: 'failed',
            retryAt: '',
            message: `오류: ${error?.message || '스마트 댓글 실행에 실패했습니다.'}`
        });
        return error;
    }

    function getSmartCommentCollector() {
        if (!smartCommentCollector) {
            smartCommentCollector = createNaverSmartCommentCollector({
                BrowserLauncher,
                CONFIG,
                Logger
            });
        }
        return smartCommentCollector;
    }

    const COMMENT_DRAFT_DEFAULTS = {
        aiMode: 'default',
        fetchLimit: 3,
        maxChars: 60,
        headless: true
    };

    function normalizeCommentDraftAiMode(value) {
        return String(value || 'default').trim().toLowerCase() === 'custom' ? 'custom' : 'default';
    }

    function normalizeCommentDraftSettings(input = {}) {
        const fetchLimit = parseInt(input.fetchLimit ?? input.fetch_limit ?? CONFIG.NAVER_COMMENT_DRAFT_FETCH_LIMIT ?? COMMENT_DRAFT_DEFAULTS.fetchLimit, 10);
        const maxChars = parseInt(input.maxChars ?? input.max_chars ?? CONFIG.NAVER_COMMENT_DRAFT_MAX_CHARS ?? COMMENT_DRAFT_DEFAULTS.maxChars, 10);
        return {
            aiMode: normalizeCommentDraftAiMode(input.aiMode ?? input.ai_mode ?? CONFIG.NAVER_COMMENT_DRAFT_AI_MODE ?? COMMENT_DRAFT_DEFAULTS.aiMode),
            fetchLimit: Number.isFinite(fetchLimit) ? Math.min(10, Math.max(1, fetchLimit)) : COMMENT_DRAFT_DEFAULTS.fetchLimit,
            maxChars: Number.isFinite(maxChars) ? Math.min(200, Math.max(20, maxChars)) : COMMENT_DRAFT_DEFAULTS.maxChars,
            headless: typeof input.headless === 'boolean'
                ? input.headless
                : (input.headless === undefined ? (CONFIG.NAVER_COMMENT_DRAFT_HEADLESS ?? COMMENT_DRAFT_DEFAULTS.headless) : Boolean(input.headless))
        };
    }

    function updateCommentDraftRuntimeConfig(settings = {}) {
        CONFIG.NAVER_COMMENT_DRAFT_AI_MODE = settings.aiMode;
        CONFIG.NAVER_COMMENT_DRAFT_FETCH_LIMIT = settings.fetchLimit;
        CONFIG.NAVER_COMMENT_DRAFT_MAX_CHARS = settings.maxChars;
        CONFIG.NAVER_COMMENT_DRAFT_HEADLESS = settings.headless;
    }

    function callCommentDraftModel(mode, prompt, maxTokens = 768) {
        return Utils.callTextModelByMode(mode, prompt, 3, {
            usageLabel: mode === 'custom' ? 'Chat Model' : '글쓰기 모델',
            maxTokens,
            temperature: 0.6,
            responseMimeType: 'application/json',
            reasoningEffort: 'low',
            logStart: false,
            onRetry: ({ delayMs = 0 } = {}) => {
                updateSmartCommentProgress({
                    phase: 'rate_limited',
                    retryAt: new Date(Date.now() + Math.max(0, Number(delayMs) || 0)).toISOString()
                });
            }
        });
    }

    async function generateCommentDrafts({ aiMode, authorName, title, excerpt, maxChars }) {
        return generateSmartCommentDrafts({
            aiMode,
            authorName,
            title,
            excerpt,
            maxChars,
            logger: Logger,
            callModel: callCommentDraftModel
        });
    }

    async function generateCommentDraftBatch({ aiMode, candidates, maxChars }) {
        return generateSmartCommentDraftBatch({
            aiMode,
            items: candidates,
            maxChars,
            logger: Logger,
            callModel: callCommentDraftModel
        });
    }

    function buildLocalMarkdownPreviewPayload(requestBody = {}) {
        const imageMode = parseBlogImageMode(requestBody?.imageMode, {
            legacyGenerate: typeof requestBody?.imageGeneration === 'boolean'
                ? requestBody.imageGeneration : undefined,
            fallback: 'prompt_only'
        });
        const withoutImages = imageMode === 'none';
        const selectedFiles = Array.isArray(requestBody?.selectedFiles)
            ? requestBody.selectedFiles.map((entry) => ({
                ...entry,
                textContent: withoutImages && typeof entry?.textContent === 'string'
                    ? stripBlogImagePromptBlocks(entry.textContent)
                    : entry?.textContent
            }))
            : requestBody?.selectedFiles;
        return buildLocalMarkdownPreview({
            folderName: requestBody?.folderName,
            selectedFiles,
            ...(Object.prototype.hasOwnProperty.call(requestBody, 'markdownText')
                ? { markdownText: withoutImages
                    ? stripBlogImagePromptBlocks(requestBody.markdownText)
                    : requestBody.markdownText }
                : {}),
            targets: requestBody?.targets,
            postStatus: requestBody?.postStatus,
            scheduleDate: requestBody?.scheduleDate,
            imageGeneration: generatesBlogImages(imageMode)
        }, {
            fs,
            path,
            Utils
        });
    }

    async function hydrateTopicItemsWithRuntimeLogs(result, sortBy, sortDir) {
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
        return {
            ...result,
            total: Math.max(Number(result.total || 0), items.length),
            items
        };
    }

    async function hydrateShoppingItemsWithRuntimeLogs(result, sortBy, sortDir) {
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
        return {
            ...result,
            total: Math.max(Number(result.total || 0), items.length),
            items
        };
    }

    if (!manuscriptDraftService && fs && path && Utils?.parseMarkdown && Utils?.findImageByPrefix) {
        getManuscriptDraftService();
    }

    return {
        async saveShoppingImage(requestBody = {}) {
            const slot = String(requestBody?.slot || '').trim().toLowerCase();
            const slotInfo = SHOPPING_IMAGE_SLOT_MAP[slot];
            if (!slotInfo) {
                throw createApiError(400, 'INVALID_SLOT', 'slot은 ftc, cta1, cta2, cta3 중 하나여야 합니다.');
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
                GOOGLE_SHEET_URL: parseConfigValue(nextRaw, 'GOOGLE_SHEET_URL') || CONFIG.GOOGLE_SHEET_URL,
                HEADLESS: parseConfigValue(nextRaw, 'HEADLESS'),
                TYPING_SPEED: parseConfigValue(nextRaw, 'TYPING_SPEED'),
                FTC_DISCLOSURE_IMAGE_URL: parseConfigValue(nextRaw, 'FTC_DISCLOSURE_IMAGE_URL') || CONFIG.FTC_DISCLOSURE_IMAGE_URL,
                SHOPPING_CTA_IMAGE_URL1: parseConfigValue(nextRaw, 'SHOPPING_CTA_IMAGE_URL1') || CONFIG.SHOPPING_CTA_IMAGE_URL1,
                SHOPPING_CTA_IMAGE_URL2: parseConfigValue(nextRaw, 'SHOPPING_CTA_IMAGE_URL2') || CONFIG.SHOPPING_CTA_IMAGE_URL2,
                SHOPPING_CTA_IMAGE_URL3: parseConfigValue(nextRaw, 'SHOPPING_CTA_IMAGE_URL3') || CONFIG.SHOPPING_CTA_IMAGE_URL3,
                WORDPRESS_URL: parseConfigValue(nextRaw, 'WORDPRESS_URL') || CONFIG.WORDPRESS_URL,
                WORDPRESS_USER_ID: parseConfigValue(nextRaw, 'WORDPRESS_USER_ID') || CONFIG.WORDPRESS_USER_ID,
                WORDPRESS_APP_PASSWORD: parseConfigValue(nextRaw, 'WORDPRESS_APP_PASSWORD') || CONFIG.WORDPRESS_APP_PASSWORD
            };
            mergedFields[slotInfo.key] = configValue;
            applyRuntimeConfigFromMajor(parseMajorFieldsFromRequest(mergedFields));
            syncAutoRunnerWithConfig();
            CONFIG.CONFIG_READY = true;
            CONFIG.CONFIG_SOURCE_TYPE = 'config';
            CONFIG.CONFIG_SOURCE_PATH = writablePath;
            CONFIG.CONFIG_ERROR_MESSAGE = '';

            return {
                slot,
                key: slotInfo.key,
                value: configValue,
                savedPath: filePath,
                configPath: writablePath,
                message: '쇼핑 이미지 등록 완료'
            };
        },

        async getShoppingImagePreview({ slotRaw, sourceRaw }) {
            const slot = String(slotRaw || '').trim().toLowerCase();
            const slotInfo = SHOPPING_IMAGE_SLOT_MAP[slot];
            if (!slotInfo) {
                throw createApiError(400, 'INVALID_SLOT', 'slot은 ftc, cta1, cta2, cta3 중 하나여야 합니다.');
            }

            const sourceOverride = String(sourceRaw || '').trim();
            let source = sourceOverride;
            if (!source) {
                const configSource = tryResolveReadableConfigSource();
                const raw = configSource ? readConfigRaw(configSource) : buildDefaultConfigTemplate();
                const fields = buildMajorSettings(raw, configSource || { path: resolveWritableConfigPath(), sourceType: 'generated' }).fields;
                source = String(fields[slotInfo.key] || '').trim();
            }
            if (!source) {
                throw createApiError(404, 'IMAGE_SOURCE_EMPTY', '설정된 이미지가 없습니다.');
            }
            if (/^https?:\/\//i.test(source)) {
                throw createApiError(400, 'INVALID_PREVIEW_SOURCE', '원격 URL 이미지는 브라우저가 직접 표시합니다.');
            }

            const localPath = resolveLocalImagePathFromSource(source);
            if (!localPath || !fs.existsSync(localPath)) {
                throw createApiError(404, 'IMAGE_FILE_NOT_FOUND', '로컬 이미지를 찾을 수 없습니다.');
            }

            const body = fs.readFileSync(localPath);
            return {
                binary: true,
                body,
                contentType: getContentType(localPath)
            };
        },

        async getGoogleOauthStatus() {
            return GoogleOAuth.getStatus();
        },

        async startGoogleOauth() {
            const configuration = GoogleOAuth.getConfigurationStatus();
            if (!configuration.configured) {
                throw createApiError(
                    400,
                    'GOOGLE_OAUTH_CLIENT_NOT_READY',
                    'Google OAuth 앱 설정이 준비되지 않았습니다. BlogGenius 앱 설정 또는 버전을 확인해 주세요.'
                );
            }
            const http = require('http');
            const callbackServer = http.createServer(async (req, res) => {
                try {
                    const requestUrl = new URL(req.url, redirectUri);
                    const code = requestUrl.searchParams.get('code');
                    const state = requestUrl.searchParams.get('state');
                    if (!code || !state) {
                        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
                        res.end(GoogleOAuth.renderCallbackHtml({ success: false, message: '인증 코드 또는 상태값이 없습니다.' }));
                        return;
                    }
                    const tokens = await GoogleOAuth.exchangeCode(code, state);
                    Utils.clearGoogleAuthCache();
                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end(GoogleOAuth.renderCallbackHtml({ success: true, email: String(tokens.connected_email || '') }));
                } catch (error) {
                    res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end(GoogleOAuth.renderCallbackHtml({ success: false, message: error.message }));
                } finally {
                    setTimeout(() => callbackServer.close(() => { }), 250);
                }
            });

            const redirectUri = await new Promise((resolve, reject) => {
                callbackServer.once('error', reject);
                callbackServer.listen(0, '127.0.0.1', () => {
                    const address = callbackServer.address();
                    if (!address || typeof address !== 'object' || !address.port) {
                        reject(new Error('Google OAuth callback 서버를 시작하지 못했습니다.'));
                        return;
                    }
                    resolve(`http://127.0.0.1:${address.port}`);
                });
            });

            callbackServer.setTimeout(10 * 60 * 1000, () => {
                callbackServer.close(() => { });
            });

            const { authUrl } = GoogleOAuth.buildAuthUrl({ redirectUri });
            return {
                authUrl,
                redirectUri,
                message: '브라우저에서 Google 로그인을 진행하세요.'
            };
        },

        async disconnectGoogleOauth() {
            GoogleOAuth.deleteTokens();
            Utils.clearGoogleAuthCache();
            return {
                message: 'Google 계정 연결을 해제했습니다.'
            };
        },

        async testGoogleOauthConnection() {
            const status = await GoogleOAuth.getStatus();
            if (status.state !== 'connected') {
                throw createApiError(400, 'GOOGLE_OAUTH_NOT_CONNECTED', status.message || 'Google 계정이 아직 연결되지 않았습니다.');
            }

            const sheetUrl = String(CONFIG.GOOGLE_SHEET_URL || '').trim();
            if (!sheetUrl) {
                return {
                    ok: true,
                    message: 'Google 계정 연결은 정상입니다. 이제 스프레드시트 주소를 입력하세요.',
                    status
                };
            }

            const spreadsheetId = String(CONFIG.GOOGLE_SHEET_ID || '').trim();
            if (!spreadsheetId) {
                throw createApiError(400, 'INVALID_SHEET_URL', '스프레드시트 주소를 다시 확인해 주세요.');
            }

            const accessToken = await Utils.getGoogleAccessToken(['https://www.googleapis.com/auth/spreadsheets.readonly']);
            const response = await axios.get(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=spreadsheetId,properties.title`, {
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            });

            return {
                ok: true,
                message: 'Google Spreadsheet 연결이 정상입니다.',
                spreadsheetId: String(response.data?.spreadsheetId || spreadsheetId),
                spreadsheetTitle: String(response.data?.properties?.title || ''),
                status
            };
        },

        async getNaverCommentDraftSettings() {
            return {
                settings: normalizeCommentDraftSettings(),
                runtime: {
                    environment: String(CONFIG.RUNTIME_ENVIRONMENT || '')
                }
            };
        },

        async getNaverCommentDraftProgress() {
            return {
                progress: getSmartCommentProgressSnapshot()
            };
        },

        async saveNaverCommentDraftSettings(requestBody = {}) {
            const settings = normalizeCommentDraftSettings(requestBody || {});
            const writablePath = resolveWritableConfigPath();
            let structuredConfig = {};
            try {
                if (fs.existsSync(writablePath)) {
                    structuredConfig = JSON.parse(fs.readFileSync(writablePath, 'utf8'));
                }
            } catch (_e) { }

            if (!structuredConfig.features) structuredConfig.features = {};
            if (!structuredConfig.features.naver) structuredConfig.features.naver = {};
            structuredConfig.features.naver.comment_draft = {
                ai_mode: settings.aiMode,
                fetch_limit: settings.fetchLimit,
                max_chars: settings.maxChars,
                headless: settings.headless
            };

            fs.mkdirSync(path.dirname(writablePath), { recursive: true });
            fs.writeFileSync(writablePath, JSON.stringify(structuredConfig, null, 2), 'utf-8');
            updateCommentDraftRuntimeConfig(settings);

            return {
                message: '스마트 댓글 설정 저장 완료',
                settings
            };
        },

        async runNaverCommentDraft(requestBody = {}) {
            if (smartCommentProgress.state === 'running') {
                throw createApiError(409, 'NAVER_COMMENT_DRAFT_BUSY', '다른 스마트 댓글 작업을 처리하고 있습니다. 현재 실행이 끝난 뒤 다시 시도해 주세요.');
            }
            const settings = normalizeCommentDraftSettings(requestBody || {});
            updateSmartCommentProgress({
                state: 'running',
                phase: 'session',
                message: '네이버 로그인 상태를 확인하고 있습니다.',
                completedCount: 0,
                totalCount: 0,
                batchIndex: 0,
                batchTotal: 0,
                retryAt: ''
            });
            if (settings.aiMode === 'custom' && !String(CONFIG.CHAT_MODEL_CONFIG?.code || '').trim()) {
                throw markSmartCommentFailed(createApiError(400, 'INVALID_CHAT_MODEL', 'Chat Model을 사용하려면 AI 설정에서 사용할 모델을 선택해야 합니다.'));
            }

            if (typeof checkNaverSessionForUi !== 'function') {
                throw markSmartCommentFailed(createApiError(500, 'NAVER_SESSION_CHECK_UNAVAILABLE', '네이버 로그인 상태를 확인할 수 없습니다.'));
            }
            let session;
            try {
                session = await checkNaverSessionForUi({ forceRefresh: true });
            } catch (error) {
                throw markSmartCommentFailed(error);
            }
            if (!session?.ok) {
                const reason = String(session?.reason || '').trim().toLowerCase();
                const message = reason === 'missing_auth'
                    ? '스마트 댓글을 사용하려면 설정에서 네이버 로그인을 먼저 진행해 주세요.'
                    : (reason === 'expired'
                        ? '네이버 로그인 세션이 만료되었습니다. 설정에서 다시 로그인해 주세요.'
                        : '네이버 로그인 상태를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.');
                const error = createApiError(401, 'NAVER_SESSION_INVALID', message);
                error.reason = reason || 'check_failed';
                throw markSmartCommentFailed(error);
            }

            updateSmartCommentProgress({
                phase: 'collecting',
                message: '이웃새글 후보를 수집하고 있습니다.'
            });
            let candidates;
            try {
                candidates = await getSmartCommentCollector().collect({
                    fetchLimit: settings.fetchLimit,
                    headless: settings.headless,
                    excludePostUrls: Array.isArray(requestBody?.excludePostUrls)
                        ? requestBody.excludePostUrls
                        : []
                });
            } catch (error) {
                throw markSmartCommentFailed(error);
            }

            if (candidates.length === 0) {
                Logger.info('ℹ️ [NaverCommentDraft] 조건에 맞는 이웃새글 후보가 없습니다.');
                updateSmartCommentProgress({
                    state: 'completed',
                    phase: 'completed',
                    message: '조건에 맞는 이웃새글 후보가 없습니다.'
                });
                return {
                    items: [],
                    settings,
                    summary: {
                        status: 'no_candidates',
                        candidateCount: 0,
                        successCount: 0,
                        failureCount: 0
                    }
                };
            }

            Logger.info(`📝 [NaverCommentDraft] 댓글 초안 생성 시작 (${candidates.length}건, AI: ${settings.aiMode === 'custom' ? 'Chat Model' : '글쓰기 모델'})`);
            const items = [];
            const batchSize = 3;
            const batchTotal = Math.ceil(candidates.length / batchSize);
            updateSmartCommentProgress({
                phase: 'generating',
                message: `댓글 초안 생성 준비 중 · 0/${candidates.length}건`,
                totalCount: candidates.length,
                batchTotal
            });
            let stoppedByRateLimit = false;
            for (let offset = 0; offset < candidates.length; offset += batchSize) {
                const batchIndex = Math.floor(offset / batchSize) + 1;
                updateSmartCommentProgress({
                    phase: 'generating',
                    retryAt: '',
                    batchIndex,
                    message: `댓글 초안 생성 중 · ${batchIndex}/${batchTotal} 배치 · ${offset}/${candidates.length}건 완료`
                });
                const batchCandidates = candidates.slice(offset, offset + batchSize)
                    .map((candidate, index) => ({ ...candidate, id: String(offset + index) }));
                try {
                    const batchResults = await generateCommentDraftBatch({
                        aiMode: settings.aiMode,
                        candidates: batchCandidates,
                        maxChars: settings.maxChars
                    });
                    batchCandidates.forEach((candidate, index) => {
                        const result = batchResults[index] || {};
                        const { id: _id, ...candidateWithoutId } = candidate;
                        items.push({
                            ...candidateWithoutId,
                            drafts: Array.isArray(result.drafts) ? result.drafts : [],
                            error: String(result.error || '')
                        });
                    });
                } catch (e) {
                    const rateLimited = e?.code === 'AI_RATE_LIMITED' || Number(e?.status) === 429;
                    const partialResults = Array.isArray(e?.partialResults) ? e.partialResults : [];
                    batchCandidates.forEach((candidate, index) => {
                        const { id: _id, ...candidateWithoutId } = candidate;
                        const partial = partialResults[index] || {};
                        items.push({
                            ...candidateWithoutId,
                            drafts: Array.isArray(partial.drafts) ? partial.drafts : [],
                            error: String(partial.error || e.message || '댓글 초안 생성 실패')
                        });
                    });
                    if (rateLimited) {
                        const remainingCandidates = candidates.slice(offset + batchCandidates.length);
                        remainingCandidates.forEach((candidate) => {
                            items.push({
                                ...candidate,
                                drafts: [],
                                error: 'AI 요청 한도로 인해 실행을 중단했습니다.'
                            });
                        });
                        stoppedByRateLimit = true;
                    }
                }
                const completedCount = stoppedByRateLimit
                    ? items.filter((item) => item.drafts.length > 0).length
                    : offset + batchCandidates.length;
                updateSmartCommentProgress({
                    phase: stoppedByRateLimit ? 'rate_limit_stopped' : 'generating',
                    retryAt: '',
                    completedCount,
                    message: stoppedByRateLimit
                        ? `AI 요청 한도로 실행 중단 · ${completedCount}/${candidates.length}건 생성`
                        : `댓글 초안 생성 중 · ${batchIndex}/${batchTotal} 배치 · ${completedCount}/${candidates.length}건 완료`
                });
                if (stoppedByRateLimit) break;
                if (completedCount < candidates.length) {
                    Logger.debug(`📝 [NaverCommentDraft] 댓글 초안 생성 진행 ${completedCount}/${candidates.length}`);
                }
            }
            const successCount = items.filter((item) => item.drafts.length > 0).length;
            const failureCount = items.length - successCount;
            const status = stoppedByRateLimit
                ? 'rate_limited'
                : (successCount === 0
                    ? 'draft_generation_failed'
                    : (failureCount > 0 ? 'partial_success' : 'success'));
            const log = failureCount > 0 ? Logger.warn.bind(Logger) : Logger.info.bind(Logger);
            log(`${failureCount > 0 ? '⚠️' : '✅'} [NaverCommentDraft] 댓글 초안 생성 완료 (성공 ${successCount}건, 실패 ${failureCount}건)`);
            updateSmartCommentProgress({
                state: 'completed',
                phase: 'completed',
                retryAt: '',
                message: stoppedByRateLimit
                    ? `AI 요청 한도로 실행 중단 · ${successCount}/${candidates.length}건 생성`
                    : (failureCount > 0
                        ? `일부 완료 · ${successCount}건 생성, ${failureCount}건 실패`
                    : `완료 · ${successCount}건의 댓글 초안을 생성했습니다.`
                    )
            });

            return {
                items,
                settings,
                summary: {
                    status,
                    candidateCount: candidates.length,
                    successCount,
                    failureCount
                }
            };
        },

        async redraftNaverCommentDraft(requestBody = {}) {
            const settings = normalizeCommentDraftSettings(requestBody || {});
            if (settings.aiMode === 'custom' && !String(CONFIG.CHAT_MODEL_CONFIG?.code || '').trim()) {
                throw createApiError(400, 'INVALID_CHAT_MODEL', 'Chat Model을 사용하려면 AI 설정에서 사용할 모델을 선택해야 합니다.');
            }

            const title = String(requestBody?.title || '').trim();
            const excerpt = String(requestBody?.excerpt || '').trim();
            const authorName = String(requestBody?.authorName || '').trim();
            if (!title || !excerpt) {
                throw createApiError(400, 'INVALID_REQUEST', '제목과 본문 일부가 필요합니다.');
            }

            const drafts = await generateCommentDrafts({
                aiMode: settings.aiMode,
                authorName,
                title,
                excerpt,
                maxChars: settings.maxChars
            });
            return { drafts };
        },

        async blogQuickPublish(requestBody = {}) {
            const result = await executeQuickPublish(requestBody || {});
            if (!result.success) {
                throw createApiError(400, result.code || 'QUICK_PUBLISH_FAILED', result.message || '빠른발행 요청에 실패했습니다.');
            }
            return result.data;
        },

        async blogQuickPreviewPublish(requestBody = {}) {
            const result = await executeQuickPreviewPublish(requestBody || {});
            if (!result.success) {
                throw createApiError(400, result.code || 'QUICK_PREVIEW_PUBLISH_FAILED', result.message || '빠른 포스팅 실행에 실패했습니다.');
            }
            return result.data;
        },

        async getBlogQuickPreviewImage({ previewIdRaw, targetRaw, indexRaw }) {
            try {
                return getQuickPreviewImagePayload({
                    previewId: previewIdRaw,
                    target: targetRaw,
                    index: indexRaw
                });
            } catch (e) {
                throw createApiError(404, 'QUICK_PREVIEW_IMAGE_FAILED', e.message || '빠른 포스팅 미리보기 이미지를 찾지 못했습니다.');
            }
        },

        async previewLocalMarkdown(requestBody = {}) {
            try {
                const preview = buildLocalMarkdownPreviewPayload(requestBody);
                recordDashboardActivity({
                    category: 'publish',
                    type: 'local_markdown_preview_generated',
                    title: '원고 포스팅 미리보기 생성 완료',
                    detail: [
                        String(preview?.title || '').trim(),
                        String(preview?.selectedMarkdown?.name || '').trim()
                    ].filter(Boolean).join(' · ') || '원고 미리보기를 생성했습니다.'
                });
                return preview;
            } catch (error) {
                recordDashboardActivity({
                    category: 'publish',
                    type: 'local_markdown_preview_failed',
                    level: 'error',
                    title: '원고 포스팅 미리보기 생성 실패',
                    detail: error.message || '원고 미리보기를 생성하지 못했습니다.'
                });
                throw error;
            }
        },

        async createFolderManuscriptDraft(requestBody = {}) {
            const created = getManuscriptDraftService().createFolderDraft(requestBody);
            return refreshManuscriptRelatedPosts(created, await resolveRelatedPostsEnabled(), { force: true });
        },

        async createPasteManuscriptDraft(requestBody = {}) {
            const created = getManuscriptDraftService().createPasteDraft(requestBody);
            return refreshManuscriptRelatedPosts(created, await resolveRelatedPostsEnabled(), { force: true });
        },

        async createAiManuscriptDraft(requestBody = {}) {
            const aiReadiness = buildSetupReadiness({ CONFIG }).ai;
            const imageMode = parseBlogImageMode(requestBody.imageMode ?? requestBody.image_mode, {
                legacyGenerate: typeof requestBody.imageGeneration === 'boolean'
                    ? requestBody.imageGeneration : undefined,
                fallback: 'prompt_only'
            });
            if (aiReadiness.configured !== true) {
                throw createApiError(400, 'AI_TEXT_MODEL_REQUIRED', 'AI 설정에서 글쓰기 모델을 먼저 설정해 주세요.');
            }
            if (generatesBlogImages(imageMode) && aiReadiness.image_configured !== true) {
                throw createApiError(400, 'AI_IMAGE_MODEL_REQUIRED', 'AI 설정에서 이미지 모델을 먼저 설정해 주세요.');
            }
            return runBlogNextExecution({
                source: 'manuscript_generation',
                subject: String(requestBody.subject || requestBody.title || '바로 생성 원고').trim(),
                message: 'AI로 원고를 만들고 있습니다.'
            }, async () => {
                const requestedTargets = Array.isArray(requestBody.targets)
                    ? requestBody.targets
                    : (Array.isArray(requestBody.platforms) ? requestBody.platforms : []);
                const targets = requestedTargets.length === 1 ? requestedTargets : ['naver'];
                // The canonical manuscript is platform-neutral. Use the non-browser generation
                // projection only as a transient workspace and apply the user's platform later.
                const generationTargets = ['wordpress'];
                const generated = await executeQuickPublish({
                    ...requestBody,
                    imageMode,
                    imageGeneration: generatesBlogImages(imageMode),
                    targets: generationTargets,
                    postStatus: 'draft',
                    scheduleDate: '',
                    publishMode: 'append_and_generate'
                }, { workspaceDraft: true });
                if (!generated?.success) {
                    throw createApiError(400, generated?.code || 'MANUSCRIPT_AI_GENERATE_FAILED', generated?.message || 'AI 원고를 만들지 못했습니다.');
                }
                const data = generated.data || {};
                const primaryTarget = String(data.primaryTarget || generationTargets[0] || '').trim();
                const preview = data.previews?.[primaryTarget];
                if (!preview?.rawMarkdown) {
                    throw createApiError(500, 'MANUSCRIPT_AI_PREVIEW_MISSING', '생성된 원고를 작업공간으로 가져오지 못했습니다.');
                }
                const images = [];
                for (const image of Array.isArray(preview.images) ? preview.images : []) {
                    if (!image?.exists) continue;
                    const payload = getQuickPreviewImagePayload({
                        previewId: data.previewId,
                        target: primaryTarget,
                        index: image.index
                    });
                    if (payload?.binary && Buffer.isBuffer(payload.body)) {
                        images.push({ index: image.index, buffer: payload.body });
                    }
                }
                const draft = getManuscriptDraftService().createAiDraft({
                    ...requestBody,
                    imageMode,
                    targets,
                    markdownText: imageMode === 'none'
                        ? stripBlogImagePromptBlocks(preview.rawMarkdown)
                        : preview.rawMarkdown,
                    images: imageMode === 'none' ? [] : images,
                    sourceLabel: preview.title || requestBody.title || requestBody.subject || '바로 생성 원고',
                    sourceMetadata: { generationProjection: primaryTarget }
                });
                if (typeof deleteQuickPublishPreviewSession === 'function') {
                    deleteQuickPublishPreviewSession(data.previewId);
                }
                return refreshManuscriptRelatedPosts(draft, await resolveRelatedPostsEnabled(), { force: true });
            });
        },

        async getManuscriptDraft({ draftId } = {}) {
            return getManuscriptDraftService().getDraft(draftId);
        },

        async updateManuscriptDraftSettings(requestBody = {}) {
            const updated = getManuscriptDraftService().updateSettings(requestBody);
            return refreshManuscriptRelatedPosts(updated, await resolveRelatedPostsEnabled());
        },

        async updateManuscriptDraftMarkdown(requestBody = {}) {
            const updated = getManuscriptDraftService().updateMarkdown(requestBody);
            return refreshManuscriptRelatedPosts(updated, await resolveRelatedPostsEnabled(), { force: true });
        },

        async importManuscriptDraftImage(requestBody = {}) {
            return getManuscriptDraftService().importLocalImage(requestBody);
        },

        async generateManuscriptDraftImage(requestBody = {}) {
            if (buildSetupReadiness({ CONFIG }).ai.image_configured !== true) {
                throw createApiError(400, 'AI_IMAGE_MODEL_REQUIRED', 'AI 설정에서 이미지 모델을 먼저 설정해 주세요.');
            }
            return getManuscriptDraftService().generateImage(requestBody);
        },

        async generateMissingManuscriptDraftImages(requestBody = {}) {
            if (buildSetupReadiness({ CONFIG }).ai.image_configured !== true) {
                throw createApiError(400, 'AI_IMAGE_MODEL_REQUIRED', 'AI 설정에서 이미지 모델을 먼저 설정해 주세요.');
            }
            return getManuscriptDraftService().generateMissingImages(requestBody);
        },

        async excludeManuscriptDraftImage(requestBody = {}) {
            return getManuscriptDraftService().excludeImage(requestBody);
        },

        async restoreManuscriptDraftImage(requestBody = {}) {
            return getManuscriptDraftService().restoreImage(requestBody);
        },

        async getManuscriptDraftImage(request = {}) {
            return getManuscriptDraftService().getImage(request);
        },

        async publishManuscriptDraft(requestBody = {}) {
            return runBlogNextExecution({
                source: 'local_markdown',
                subject: '원고 포스팅',
                message: '빈 이미지를 준비한 뒤 원고를 포스팅합니다.'
            }, async () => {
                const snapshot = await getManuscriptDraftService().preparePublishPayload(requestBody);
                const result = await executeCompletedLocalMarkdownPublish({
                    ...snapshot.settings,
                    ...snapshot,
                    operationId: requestBody.operationId
                });
                const draftService = getManuscriptDraftService();
                const manuscriptPreview = typeof draftService.markPublished === 'function'
                    ? draftService.markPublished({
                        draftId: requestBody.draftId,
                        revision: snapshot.publishPolicy.draftRevision
                    })
                    : draftService.getDraft(requestBody.draftId);
                return {
                    ...result,
                    revision: snapshot.publishPolicy.draftRevision,
                    publishPolicy: snapshot.publishPolicy,
                    manuscriptPreview
                };
            });
        },

        async localMarkdownPublish(requestBody = {}) {
            const pasted = Object.prototype.hasOwnProperty.call(requestBody || {}, 'markdownText');
            const generated = requestBody?.sourceKind === 'ai';
            return runBlogNextExecution({
                source: 'local_markdown',
                subject: generated ? '바로 생성 원고' : (pasted ? '원고 붙여넣기' : '원고 폴더'),
                message: '원고 포스팅을 처리하고 있습니다.'
            }, async () => {
                return executeCompletedLocalMarkdownPublish(requestBody || {});
            });
        },

        async shoppingQuickPublish(requestBody = {}) {
            const result = await executeShoppingQuickPublish(requestBody || {});
            if (!result.success) {
                throw createApiError(400, result.code || 'SHOPPING_QUICK_PUBLISH_FAILED', result.message || '쇼핑 빠른발행 요청에 실패했습니다.');
            }
            return result.data;
        },

        async shoppingPreview({ urlRaw }) {
            const shortUrl = String(urlRaw || '').trim();
            if (!shortUrl) {
                throw createApiError(400, 'INVALID_SHOPPING_URL', '쇼핑 URL은 필수입니다.');
            }
            if (!/^https?:\/\//i.test(shortUrl)) {
                throw createApiError(400, 'INVALID_SHOPPING_URL', '쇼핑 URL 형식이 올바르지 않습니다. (http/https)');
            }
            await requireShoppingExecution();
            try {
                return await ShoppingManager.previewFromShortUrl(shortUrl);
            } catch (e) {
                throw createApiError(400, 'SHOPPING_PREVIEW_FAILED', e.message || '쇼핑 미리보기에 실패했습니다.');
            }
        },

        async getBlogTopics({ searchParams }) {
            await ensureSheetsReadyForUi();
            const status = String(searchParams.get('status') || '').trim();
            const q = String(searchParams.get('q') || '').trim();
            const limit = parseIntSafe(searchParams.get('limit'), 50, 1) || 50;
            const offset = parseIntSafe(searchParams.get('offset'), 0, 0) || 0;
            const sortBy = String(searchParams.get('sortBy') || 'rowNumber').trim();
            const sortDir = normalizeSortDir(searchParams.get('sortDir'), 'desc');
            const result = await Utils.readGoogleSheetTopicsAll({ status, q, limit, offset, sortBy, sortDir });
            return hydrateTopicItemsWithRuntimeLogs(result, sortBy, sortDir);
        },

        async getShoppingItems({ searchParams }) {
            await ensureSheetsReadyForUi();
            const status = String(searchParams.get('status') || '').trim();
            const q = String(searchParams.get('q') || '').trim();
            const limit = parseIntSafe(searchParams.get('limit'), 50, 1) || 50;
            const offset = parseIntSafe(searchParams.get('offset'), 0, 0) || 0;
            const sortBy = String(searchParams.get('sortBy') || 'rowNumber').trim();
            const sortDir = normalizeSortDir(searchParams.get('sortDir'), 'desc');
            const result = await Utils.readGoogleSheetShoppingAll({ status, q, limit, offset, sortBy, sortDir });
            return hydrateShoppingItemsWithRuntimeLogs(result, sortBy, sortDir);
        },

        async deleteBlogTopics(requestBody = {}) {
            const result = await executeBlogTopicsDelete(requestBody || {});
            if (!result.success) {
                throw createApiError(400, result.code || 'TOPICS_DELETE_FAILED', result.message || '토픽 삭제에 실패했습니다.');
            }
            return result.data;
        },
        async runBlogAction(requestBody = {}) {
            const body = requestBody || {};
            const action = String(body.action || '').trim().toLowerCase();
            const result = (action === 'batch' && Array.isArray(body.rowIndices))
                ? await executeBlogBatchRowsAction(body)
                : await executeBlogRowAction(body);
            if (!result.success) {
                throw createApiError(400, result.code || 'BLOG_ACTION_FAILED', result.message || '블로그 작업 요청에 실패했습니다.');
            }
            return result.data;
        },

        async runShoppingAction(requestBody = {}) {
            const body = requestBody || {};
            const action = String(body.action || '').trim().toLowerCase();
            if (action !== 'batch' || !Array.isArray(body.rowIndices)) {
                throw createApiError(400, 'INVALID_ACTION', 'shopping action은 batch만 지원합니다.');
            }
            const result = await executeShoppingBatchRowsAction(body);
            if (!result.success) {
                throw createApiError(400, result.code || 'SHOPPING_ACTION_FAILED', result.message || '쇼핑 작업 요청에 실패했습니다.');
            }
            return result.data;
        },

        async deleteShoppingTopics(requestBody = {}) {
            const result = await executeShoppingTopicsDelete(requestBody || {});
            if (!result.success) {
                throw createApiError(400, result.code || 'SHOPPING_DELETE_FAILED', result.message || '쇼핑 데이터 삭제에 실패했습니다.');
            }
            return result.data;
        },

        async updateShoppingRow(requestBody = {}) {
            const result = await executeShoppingRowUpdate(requestBody || {});
            if (!result.success) {
                throw createApiError(400, result.code || 'SHOPPING_ROW_UPDATE_FAILED', result.message || '쇼핑 행 수정에 실패했습니다.');
            }
            return result.data;
        },

        async updateBlogTopic(requestBody = {}) {
            const result = await executeBlogTopicUpdate(requestBody || {});
            if (!result.success) {
                throw createApiError(400, result.code || 'TOPIC_UPDATE_FAILED', result.message || '토픽 수정에 실패했습니다.');
            }
            // 서버 캐시 무효화: 다음 조회 시 Google Sheets에서 최신 데이터를 읽어옴
            Utils.clearSheetCache('topics');
            return result.data;
        },

        async getWordPressCategories() {
            const Logger = require('../../logger');
            const WordPressClient = require('../../wordpress-client');

            // config 파일에서 최신값을 직접 읽어 사용 (메모리 캐시 우회)
            let wpUrl = String(CONFIG.WORDPRESS_URL || '').trim();
            let wpUserId = String(CONFIG.WORDPRESS_USER_ID || '').trim();
            let wpAppPassword = String(CONFIG.WORDPRESS_APP_PASSWORD || '').trim();
            try {
                const configSource = tryResolveReadableConfigSource();
                if (configSource) {
                    const raw = readConfigRaw(configSource);
                    wpUrl = parseConfigValue(raw, 'WORDPRESS_URL') || wpUrl;
                    wpUserId = parseConfigValue(raw, 'WORDPRESS_USER_ID') || wpUserId;
                    wpAppPassword = parseConfigValue(raw, 'WORDPRESS_APP_PASSWORD') || wpAppPassword;
                }
            } catch (readErr) {
                Logger.warn(`⚠️ WordPress 카테고리: config 파일 읽기 실패, 메모리 설정 사용 (${readErr.message})`);
            }

            const wpClient = new WordPressClient({
                url: wpUrl,
                userId: wpUserId,
                appPassword: wpAppPassword
            });

            if (!wpClient.isConfigured()) {
                if (CONFIG.CONFIG_IS_ESSENTIAL_SET) {
                    const nextLogState = `missing:${wpUrl}|${wpUserId}`;
                    if (wordpressCategoryConfigLogState !== nextLogState) {
                        Logger.info(`WordPress 설정 미비: URL="${wpUrl}", User="${wpUserId}" (필요 시 [설정 > 블로그] 탭에서 입력 가능)`);
                        wordpressCategoryConfigLogState = nextLogState;
                    }
                }
                throw createApiError(400, 'WP_NOT_CONFIGURED', '워드프레스 설정이 필요합니다. 설정 > 블로그 탭에서 저장 후 다시 시도해 주세요.');
            }

            wordpressCategoryConfigLogState = 'ready';
            const categories = await wpClient.listCategories();
            if (categories === null) {
                throw createApiError(500, 'WP_API_ERROR', '워드프레스 API 호출 중 오류가 발생했습니다. 터미널 로그를 확인해 주세요.');
            }
            return categories;
        }
    };
}

module.exports = {
    createContentService
};
