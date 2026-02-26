const { createApiError } = require('../errors');

function createContentService(deps = {}) {
    const {
        Utils,
        fs,
        path,
        CONFIG,
        ShoppingManager,
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
        buildMajorSettings,
        ensureSheetsReadyForUi,
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
        executeBlogTopicUpdate
    } = deps;

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

        async getGoogleAuthStatus() {
            try {
                const rawPath = CONFIG.GOOGLE_AUTH_JSON;
                const keyFilePath = CONFIG.GOOGLE_AUTH_JSON_PATH || resolveRuntimePath(rawPath, { mustExist: false });
                if (fs.existsSync(keyFilePath)) {
                    const fileContent = fs.readFileSync(keyFilePath, 'utf-8');
                    const credentials = JSON.parse(fileContent);
                    return {
                        configured: true,
                        clientEmail: credentials.client_email || '알 수 없음',
                        projectId: credentials.project_id || '알 수 없음',
                        path: keyFilePath
                    };
                }
                return {
                    configured: false,
                    message: '설정된 Google Auth JSON 파일을 찾을 수 없습니다.'
                };
            } catch (e) {
                return {
                    configured: false,
                    message: `오류: ${e.message}`
                };
            }
        },

        async saveGoogleAuth(requestBody = {}) {
            const content = String(requestBody?.content || '').trim();
            if (!content) {
                throw createApiError(400, 'INVALID_CONTENT', 'Google Auth JSON 내용이 없습니다.');
            }

            let parsed;
            try {
                parsed = JSON.parse(content);
            } catch (_e) {
                throw createApiError(400, 'INVALID_JSON', '올바른 JSON 형식이 아닙니다.');
            }

            if (parsed.type !== 'service_account' || !parsed.project_id || !parsed.private_key || !parsed.client_email) {
                throw createApiError(400, 'INVALID_SERVICE_ACCOUNT', '유효한 Google Service Account JSON 형식이 아닙니다. (type, project_id, private_key, client_email 필수)');
            }

            const rawPath = CONFIG.GOOGLE_AUTH_JSON;
            const keyFilePath = CONFIG.GOOGLE_AUTH_JSON_PATH || resolveRuntimePath(rawPath, { mustExist: false });
            const authDir = path.dirname(keyFilePath);
            if (!fs.existsSync(authDir)) {
                fs.mkdirSync(authDir, { recursive: true });
            }

            fs.writeFileSync(keyFilePath, JSON.stringify(parsed, null, 2), 'utf-8');
            Utils.clearGoogleAuthCache();

            return {
                savedPath: keyFilePath,
                clientEmail: parsed.client_email,
                projectId: parsed.project_id,
                message: 'Google Service Account JSON 저장 완료 및 캐시 초기화 성공'
            };
        },

        async blogQuickPublish(requestBody = {}) {
            const result = await executeQuickPublish(requestBody || {});
            if (!result.success) {
                throw createApiError(400, result.code || 'QUICK_PUBLISH_FAILED', result.message || '빠른발행 요청에 실패했습니다.');
            }
            return result.data;
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

        async runShoppingAutoManual(requestBody = {}) {
            const result = await executeShoppingAutoManualAction(requestBody || {});
            if (!result.success) {
                throw createApiError(400, result.code || 'SHOPPING_AUTO_MANUAL_FAILED', result.message || '쇼핑 자동발행 수동 실행에 실패했습니다.');
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
            return result.data;
        }
    };
}

module.exports = {
    createContentService
};

