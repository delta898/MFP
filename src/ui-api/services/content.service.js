const { createApiError } = require('../errors');
const { buildLocalMarkdownPreview } = require('../../content/local-markdown-preview');
const { recordDashboardActivity } = require('../../activity/dashboard-activity-store');

function createContentService(deps = {}) {
    const {
        Utils,
        fs,
        path,
        axios,
        RuntimeConfig,
        CONFIG,
        GoogleOAuth,
        BrowserLauncher,
        ShoppingManager,
        Logger,
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
        executeQuickPreviewPublish,
        getQuickPreviewImagePayload,
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
        executeShoppingAutoManualAction,
        executeShoppingRowUpdate,
        executeBlogTopicUpdate,
        executeBlogTopicsDelete,
        executeShoppingTopicsDelete
    } = deps;

    let wordpressCategoryConfigLogState = '';

    const COMMENT_DRAFT_DEFAULTS = {
        aiMode: 'default',
        fetchLimit: 10,
        tone: 'empathetic',
        maxChars: 60,
        headless: true
    };

    function normalizeCommentDraftAiMode(value) {
        return String(value || 'default').trim().toLowerCase() === 'custom' ? 'custom' : 'default';
    }

    function normalizeCommentDraftTone(value) {
        const normalized = String(value || 'empathetic').trim().toLowerCase();
        if (['empathetic', 'friendly', 'calm'].includes(normalized)) return normalized;
        return COMMENT_DRAFT_DEFAULTS.tone;
    }

    function normalizeCommentDraftSettings(input = {}) {
        const fetchLimit = parseInt(input.fetchLimit ?? input.fetch_limit ?? CONFIG.NAVER_COMMENT_DRAFT_FETCH_LIMIT ?? COMMENT_DRAFT_DEFAULTS.fetchLimit, 10);
        const maxChars = parseInt(input.maxChars ?? input.max_chars ?? CONFIG.NAVER_COMMENT_DRAFT_MAX_CHARS ?? COMMENT_DRAFT_DEFAULTS.maxChars, 10);
        return {
            aiMode: normalizeCommentDraftAiMode(input.aiMode ?? input.ai_mode ?? CONFIG.NAVER_COMMENT_DRAFT_AI_MODE ?? COMMENT_DRAFT_DEFAULTS.aiMode),
            fetchLimit: Number.isFinite(fetchLimit) ? Math.min(10, Math.max(1, fetchLimit)) : COMMENT_DRAFT_DEFAULTS.fetchLimit,
            tone: normalizeCommentDraftTone(input.tone ?? CONFIG.NAVER_COMMENT_DRAFT_TONE ?? COMMENT_DRAFT_DEFAULTS.tone),
            maxChars: Number.isFinite(maxChars) ? Math.min(200, Math.max(20, maxChars)) : COMMENT_DRAFT_DEFAULTS.maxChars,
            headless: typeof input.headless === 'boolean'
                ? input.headless
                : (input.headless === undefined ? (CONFIG.NAVER_COMMENT_DRAFT_HEADLESS ?? COMMENT_DRAFT_DEFAULTS.headless) : Boolean(input.headless))
        };
    }

    function updateCommentDraftRuntimeConfig(settings = {}) {
        CONFIG.NAVER_COMMENT_DRAFT_AI_MODE = settings.aiMode;
        CONFIG.NAVER_COMMENT_DRAFT_FETCH_LIMIT = settings.fetchLimit;
        CONFIG.NAVER_COMMENT_DRAFT_TONE = settings.tone;
        CONFIG.NAVER_COMMENT_DRAFT_MAX_CHARS = settings.maxChars;
        CONFIG.NAVER_COMMENT_DRAFT_HEADLESS = settings.headless;
    }

    function stripCodeFence(raw) {
        return String(raw || '')
            .trim()
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();
    }

    function extractFirstJsonObject(raw) {
        const text = stripCodeFence(raw);
        const start = text.indexOf('{');
        if (start < 0) return '';

        let depth = 0;
        let inString = false;
        let escaped = false;

        for (let index = start; index < text.length; index += 1) {
            const char = text[index];

            if (inString) {
                if (escaped) {
                    escaped = false;
                    continue;
                }
                if (char === '\\') {
                    escaped = true;
                    continue;
                }
                if (char === '"') {
                    inString = false;
                }
                continue;
            }

            if (char === '"') {
                inString = true;
                continue;
            }

            if (char === '{') {
                depth += 1;
                continue;
            }

            if (char === '}') {
                depth -= 1;
                if (depth === 0) {
                    return text.slice(start, index + 1);
                }
            }
        }

        return '';
    }

    function sanitizeDraftText(raw, maxChars) {
        const text = String(raw || '')
            .replace(/^[\s"'`•\-–—*\d.)\]]+/, '')
            .replace(/[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        if (!text) return '';
        if (text.length <= maxChars) return text;

        const sliced = text.slice(0, maxChars).trim();
        const sentenceCut = Math.max(
            sliced.lastIndexOf('.'),
            sliced.lastIndexOf('!'),
            sliced.lastIndexOf('?'),
            sliced.lastIndexOf('。')
        );
        if (sentenceCut >= Math.floor(maxChars * 0.6)) {
            return sliced.slice(0, sentenceCut + 1).trim();
        }

        const wordCut = sliced.lastIndexOf(' ');
        if (wordCut >= Math.floor(maxChars * 0.6)) {
            return sliced.slice(0, wordCut).trim();
        }

        return sliced;
    }

    function fallbackDraftsFromText(raw, maxChars) {
        const text = String(raw || '');
        const quoted = [];
        const regex = /"((?:[^"\\]|\\.)*)"/g;
        let match;
        while ((match = regex.exec(text)) !== null) {
            const value = String(match[1] || '').trim();
            if (!value || value === 'drafts') continue;
            quoted.push(sanitizeDraftText(value, maxChars));
            if (quoted.length >= 3) break;
        }
        if (quoted.filter(Boolean).length > 0) {
            return quoted.filter(Boolean).slice(0, 3);
        }

        return text
            .split(/\r?\n+/)
            .map((line) => line.replace(/^drafts?\s*:\s*/i, '').trim())
            .map((line) => sanitizeDraftText(line, maxChars))
            .filter(Boolean)
            .filter((line) => !/^\{.*\}$/.test(line))
            .slice(0, 3);
    }

    function buildCommentDraftPrompt({ authorName = '', title = '', excerpt = '', tone = 'empathetic', maxChars = 60 }) {
        const excerptText = String(excerpt || '').replace(/\s+/g, ' ').trim().slice(0, 240);
        const toneLabelMap = {
            empathetic: '공감형',
            friendly: '친근형',
            calm: '담백형'
        };
        const toneLabel = toneLabelMap[tone] || toneLabelMap.empathetic;
        return [
            '당신은 네이버 블로그 글을 읽고 자연스럽고 짧은 댓글 초안을 제안하는 한국어 도우미입니다.',
            `댓글 톤: ${toneLabel}`,
            `최대 글자수: ${maxChars}자`,
            '조건:',
            '- 한국어 댓글 초안 3개를 만든다.',
            '- 모든 초안은 자연스러운 현대 한국어만 사용한다.',
            '- 한자, 일본어, 중국어, 영어 단어를 섞지 않는다. 꼭 필요한 고유명사만 예외로 한다.',
            '- 반말 금지, 과장 금지, 홍보성 금지, 자동화 티 금지.',
            '- 글을 실제로 읽은 느낌이 나야 한다.',
            '- 초안 3개는 서로 표현을 조금씩 다르게 한다.',
            '- 이모지는 넣지 않거나 최소화한다.',
            '- 반드시 JSON만 반환한다.',
            '- JSON 앞뒤에 설명, 주석, 코드블록, 추가 문장을 붙이지 않는다.',
            '- 각 초안은 1문장 또는 2문장으로 짧게 쓴다.',
            `- 각 초안은 반드시 ${maxChars}자 이내로 끝맺는다. 문장 중간에서 끊지 않는다.`,
            '반환 형식: {"drafts":["...","...","..."]}',
            '',
            `작성자: ${authorName}`,
            `제목: ${title}`,
            `본문 일부: ${excerptText}`
        ].join('\n');
    }

    async function generateCommentDrafts({ aiMode, authorName, title, excerpt, maxChars, tone }) {
        const prompt = buildCommentDraftPrompt({ authorName, title, excerpt, maxChars, tone });
        const raw = await Utils.callTextModelByMode(aiMode, prompt, 3, {
            usageLabel: aiMode === 'custom' ? 'Custom AI' : '기본 AI',
            maxTokens: 240,
            temperature: 0.6,
            logStart: false
        });
        let drafts = [];
        try {
            const jsonText = extractFirstJsonObject(raw) || stripCodeFence(raw);
            const parsed = JSON.parse(jsonText);
            drafts = Array.isArray(parsed?.drafts)
                ? parsed.drafts.map((item) => sanitizeDraftText(item, maxChars)).filter(Boolean).slice(0, 3)
                : [];
        } catch (parseError) {
            Logger.debug(`⚠️ [NaverCommentDraft] JSON 파싱 실패, 텍스트 복구 시도: ${parseError.message}`);
            try {
                const rawPreview = stripCodeFence(raw).replace(/\s+/g, ' ').trim().slice(0, 400);
                Logger.debug(`⚠️ [NaverCommentDraft] 원본 응답 일부: ${rawPreview}`);
            } catch (_ignore) { }
            drafts = fallbackDraftsFromText(raw, maxChars);
        }
        if (drafts.length === 0) {
            throw new Error('댓글 초안 생성 응답을 해석하지 못했습니다.');
        }
        return drafts.slice(0, 3);
    }

    function buildLocalMarkdownPreviewPayload(requestBody = {}) {
        return buildLocalMarkdownPreview({
            folderName: requestBody?.folderName,
            selectedFiles: requestBody?.selectedFiles,
            targets: requestBody?.targets,
            postStatus: requestBody?.postStatus,
            scheduleDate: requestBody?.scheduleDate,
            imageGeneration: requestBody?.imageGeneration === true
        }, {
            fs,
            path,
            Utils
        });
    }

    async function collectNaverCommentDraftCandidates({ fetchLimit, headless }) {
        let browser = null;
        try {
            browser = await BrowserLauncher.launchBrowser({ headless });
            const context = await browser.newContext({
                userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            });
            const page = await context.newPage();
            await page.goto('https://blog.naver.com', { waitUntil: 'domcontentloaded', timeout: 45000 });
            await page.waitForTimeout(2500);

            const rawItems = await page.evaluate((maxCount) => {
                const textOf = (el) => String(el?.textContent || '').replace(/\s+/g, ' ').trim();
                const imageUrlOf = (node) => {
                    const normalizeUrl = (rawValue) => {
                        const value = String(rawValue || '').trim();
                        if (!value) return '';
                        try {
                            return new URL(value, document.baseURI).toString();
                        } catch (_e) {
                            return value;
                        }
                    };
                    const candidates = [
                        node.querySelector('.thumbnail_post img[bg-image]'),
                        node.querySelector('.thumbnail_post img[data-src]'),
                        node.querySelector('.thumbnail_post img[data-lazy-src]'),
                        node.querySelector('.thumbnail_post img'),
                        node.querySelector('.thumbnail_inner img[bg-image]'),
                        node.querySelector('.thumbnail_inner img[data-src]'),
                        node.querySelector('.thumbnail_inner img[data-lazy-src]'),
                        node.querySelector('.thumbnail_inner img'),
                        node.querySelector('img[src]'),
                        node.querySelector('img[bg-image]')
                    ].filter(Boolean);

                    for (const img of candidates) {
                        const bgImage = normalizeUrl(img.getAttribute('bg-image'));
                        const dataSrc = normalizeUrl(img.getAttribute('data-src'));
                        const lazySrc = normalizeUrl(img.getAttribute('data-lazy-src'));
                        const currentSrc = normalizeUrl(img.currentSrc);
                        const src = normalizeUrl(img.getAttribute('src'));
                        const picked = bgImage || dataSrc || lazySrc || currentSrc || src;
                        if (picked) return picked;
                    }

                    const thumbArea = node.querySelector('.thumbnail_area, .thumbnail_post, .thumbnail_inner');
                    const style = String(thumbArea?.getAttribute('style') || '').trim();
                    const match = style.match(/background-image\s*:\s*url\((['"]?)(.*?)\1\)/i);
                    return normalizeUrl(match?.[2] || '');
                };
                const containers = Array.from(document.querySelectorAll('article, li, div'));
                const results = [];
                const seen = new Set();

                for (const node of containers) {
                    const linkEl = node.querySelector('a[href*="blog.naver.com"], a[href*="PostView.naver"]');
                    if (!linkEl) continue;
                    const href = linkEl.getAttribute('href') || '';
                    if (!href || seen.has(href)) continue;

                    const titleEl = node.querySelector('strong, h2, h3, [class*="title"], [class*="tit"]');
                    const excerptEl = node.querySelector('p, [class*="text"], [class*="desc"], [class*="summary"], [class*="content"]');
                    const authorEl = node.querySelector('[class*="nick"], [class*="name"], [class*="author"]');
                    const title = textOf(titleEl);
                    const excerpt = textOf(excerptEl);
                    const authorName = textOf(authorEl);
                    const combined = textOf(node);
                    const thumbnailUrl = imageUrlOf(node);
                    const commentLinkEl = node.querySelector('a[href*="open=1"], a[ng-href*="open=1"]');
                    const commentHref = commentLinkEl?.getAttribute('href') || commentLinkEl?.getAttribute('ng-href') || '';
                    if (!title || combined.length < 20) continue;

                    let liked = false;
                    let likedStateKnown = false;
                    const likeButtonEl = node.querySelector('.u_likeit_button[aria-pressed], [aria-pressed], button[class*="sympathy"], button[class*="like"], a[class*="sympathy"], a[class*="like"]');
                    const likeIconEl = node.querySelector('.u_likeit_icon[class*="__reaction__"], .u_likeit_icon');

                    if (likeButtonEl) {
                        const ariaPressed = String(likeButtonEl.getAttribute('aria-pressed') || '').trim().toLowerCase();
                        const buttonClassName = String(likeButtonEl.className || '').toLowerCase();
                        if (ariaPressed === 'true' || ariaPressed === 'false') {
                            likedStateKnown = true;
                            liked = ariaPressed === 'true';
                        } else if (/\b_face\s+on\b|\bon\b|\bactive\b|\bselected\b|\bchecked\b|likeon|sympathyon/.test(buttonClassName)) {
                            likedStateKnown = true;
                            liked = true;
                        } else if (/\b_face\s+off\b|\boff\b/.test(buttonClassName)) {
                            likedStateKnown = true;
                            liked = false;
                        }
                    }

                    if (!likedStateKnown && likeIconEl) {
                        const iconClassName = String(likeIconEl.className || '').toLowerCase();
                        if (iconClassName.includes('__reaction__like')) {
                            likedStateKnown = true;
                            liked = true;
                        } else if (iconClassName.includes('__reaction__zeroface')) {
                            likedStateKnown = true;
                            liked = false;
                        }
                    }

                    seen.add(href);
                    results.push({
                        href,
                        commentHref,
                        thumbnailUrl,
                        authorName,
                        title,
                        excerpt: excerpt || combined.slice(0, 200),
                        liked,
                        likedStateKnown
                    });

                    if (results.length >= maxCount * 4) break;
                }

                return results;
            }, fetchLimit);

            await context.close();
            await browser.close();
            browser = null;

            const deduped = [];
            const seenUrls = new Set();
            for (const item of (Array.isArray(rawItems) ? rawItems : [])) {
                const normalizedUrl = Utils._normalizeNaverBlogPostUrl(item?.href || '', CONFIG.NAVER_ID || '');
                if (!normalizedUrl || seenUrls.has(normalizedUrl)) continue;
                seenUrls.add(normalizedUrl);
                const rawCommentHref = String(item?.commentHref || '').trim();
                const commentUrl = rawCommentHref
                    ? new URL(rawCommentHref.replace('open=1', 'copen=1'), 'https://blog.naver.com').toString()
                    : `${normalizedUrl}?copen=1`;
                const thumbnailUrl = String(item?.thumbnailUrl || '').trim();
                deduped.push({
                    authorName: String(item?.authorName || '').trim() || '작성자 미상',
                    title: String(item?.title || '').trim(),
                    excerpt: String(item?.excerpt || '').trim(),
                    postUrl: normalizedUrl,
                    commentUrl,
                    thumbnailUrl,
                    liked: item?.liked === true,
                    likedStateKnown: item?.likedStateKnown === true
                });
            }

            return deduped
                .filter((item) => !(item.likedStateKnown && item.liked))
                .slice(0, fetchLimit);
        } catch (e) {
            if (browser) {
                try { await browser.close(); } catch (_ignore) { }
            }
            throw e;
        }
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
                SHOPPING_CTA_IMAGE_URL3: parseConfigValue(nextRaw, 'SHOPPING_CTA_IMAGE_URL3') || CONFIG.SHOPPING_CTA_IMAGE_URL3,
                WORDPRESS_URL: parseConfigValue(nextRaw, 'WORDPRESS_URL') || CONFIG.WORDPRESS_URL,
                WORDPRESS_USER_ID: parseConfigValue(nextRaw, 'WORDPRESS_USER_ID') || CONFIG.WORDPRESS_USER_ID,
                WORDPRESS_APP_PASSWORD: parseConfigValue(nextRaw, 'WORDPRESS_APP_PASSWORD') || CONFIG.WORDPRESS_APP_PASSWORD
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

        async getGoogleOauthStatus() {
            if (RuntimeConfig?.ensureGoogleOauthClientConfig) {
                await RuntimeConfig.ensureGoogleOauthClientConfig();
            }
            return GoogleOAuth.getStatus();
        },

        async startGoogleOauth() {
            if (RuntimeConfig?.ensureGoogleOauthClientConfig) {
                const ready = await RuntimeConfig.ensureGoogleOauthClientConfig(true);
                if (!ready) {
                    throw createApiError(400, 'GOOGLE_OAUTH_CLIENT_NOT_READY', 'Google OAuth 클라이언트가 아직 구성되지 않았습니다.');
                }
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
            if (RuntimeConfig?.ensureGoogleOauthClientConfig) {
                await RuntimeConfig.ensureGoogleOauthClientConfig();
            }
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
                settings: normalizeCommentDraftSettings()
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
                tone: settings.tone,
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
            const settings = normalizeCommentDraftSettings(requestBody || {});
            if (settings.aiMode === 'custom' && (!String(CONFIG.CUSTOM_AI_BASE_URL || '').trim() || !String(CONFIG.CUSTOM_AI_MODEL || '').trim())) {
                throw createApiError(400, 'INVALID_CUSTOM_AI', 'Custom AI를 사용하려면 AI 탭에서 Base URL과 Model을 입력해야 합니다.');
            }

            const candidates = await collectNaverCommentDraftCandidates({
                fetchLimit: settings.fetchLimit,
                headless: settings.headless
            });

            Logger.info(`📝 [NaverCommentDraft] 댓글 초안 생성 시작 (${candidates.length}건, AI: ${settings.aiMode === 'custom' ? 'Custom AI' : '기본 AI'})`);
            const items = [];
            for (let index = 0; index < candidates.length; index += 1) {
                const candidate = candidates[index];
                try {
                    const drafts = await generateCommentDrafts({
                        aiMode: settings.aiMode,
                        authorName: candidate.authorName,
                        title: candidate.title,
                        excerpt: candidate.excerpt,
                        maxChars: settings.maxChars,
                        tone: settings.tone
                    });
                    items.push({ ...candidate, drafts, error: '' });
                } catch (e) {
                    items.push({ ...candidate, drafts: [], error: e.message || '댓글 초안 생성 실패' });
                }
                if ((index + 1) < candidates.length) {
                    Logger.debug(`📝 [NaverCommentDraft] 댓글 초안 생성 진행 ${index + 1}/${candidates.length}`);
                }
            }
            Logger.info(`✅ [NaverCommentDraft] 댓글 초안 생성 완료 (${items.length}건)`);

            return { items, settings };
        },

        async redraftNaverCommentDraft(requestBody = {}) {
            const settings = normalizeCommentDraftSettings(requestBody || {});
            if (settings.aiMode === 'custom' && (!String(CONFIG.CUSTOM_AI_BASE_URL || '').trim() || !String(CONFIG.CUSTOM_AI_MODEL || '').trim())) {
                throw createApiError(400, 'INVALID_CUSTOM_AI', 'Custom AI를 사용하려면 AI 탭에서 Base URL과 Model을 입력해야 합니다.');
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
                maxChars: settings.maxChars,
                tone: settings.tone
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

        async localMarkdownPublish(requestBody = {}) {
            const result = await executeLocalMarkdownPublish(requestBody || {});
            if (!result.success) {
                throw createApiError(400, result.code || 'LOCAL_MARKDOWN_PUBLISH_FAILED', result.message || '원고 포스팅에 실패했습니다.');
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
