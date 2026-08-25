const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const cheerio = require('cheerio');
const CONFIG = require('./config-loader');
const Logger = require('./logger');
const RuntimeConfig = require('./runtime-config');
const { getAgentEventStore } = require('./memory/store');
const GoogleOAuth = require('./google-oauth');
const {
    mergeShoppingSheetOptions,
    mergeTopicSheetOptions,
    resolveShoppingSheetState,
    resolveTopicSheetState,
    stringifySheetOptionsValue
} = require('./content/publish-sheet-options');
const {
    buildRelatedPostContext,
    selectRelatedPosts
} = require('./content/related-post-selection');
const {
    SNS_SHEET_NAME,
    SNS_SHEET_HEADERS,
    buildSnsStatusValidationRequest
} = require('./social/sns-sheet-schema');
const { parseFeedXml } = require('./social/feed-entry');
const {
    applyTextRuntimePolicy,
    buildOpenAiChatRequest,
    getModelRuntimeDefinition,
    resolveOpenAiImageRequest
} = require('./ai/model-runtime-policy');
const {
    extractKieOpenAiChatContent,
    getKieOpenAiChatEndpoint
} = require('./ai/kie-openai-chat');
const {
    extractGeminiText,
    resolveGeminiThinkingConfig,
    resolveGeminiTextEndpoint
} = require('./ai/gemini-response');
const { resolveAiRetryDecision } = require('./ai/request-retry-policy');
const {
    KIE_RESPONSES_ENDPOINT,
    buildKieResponsesRequest,
    extractKieResponsesText
} = require('./ai/kie-responses');
const { createAsyncJobStore } = require('./ai/async-job-store');
const {
    createKieMarketImageClient,
    createKieMarketImageProgressReporter
} = require('./ai/kie-market-image');

const asyncAiJobStore = createAsyncJobStore({
    filePath: path.join(CONFIG.APP_ROOT_DIR || process.cwd(), 'data', 'async-ai-jobs.json')
});

const REFERENCE_FETCH_MAX_CHARS = 2400;
const REFERENCE_FETCH_MAX_BLOCKS = 20;
const REFERENCE_FETCH_MAX_TITLE_CHARS = 160;
const REFERENCE_CONTENT_SELECTORS = [
    'article',
    'main',
    '[role="main"]',
    '.se-main-container',
    '.entry-content',
    '.post-content',
    '.article_view',
    '.article_body',
    '.article-body',
    '.articleBodyContents',
    '.post-body',
    '.post_body',
    '.content-body',
    '.content_body',
    '.tt_article_useless_p_margin',
    '.story-content',
    '.story-body',
    '.news_end',
    '.post-view',
    '.entry-body'
];
const REFERENCE_NOISE_SELECTORS = [
    'script',
    'style',
    'nav',
    'footer',
    'header',
    'iframe',
    'noscript',
    'form',
    'button',
    'svg',
    'canvas',
    'figure button',
    'aside',
    '[role="navigation"]',
    '[role="complementary"]',
    '[role="dialog"]',
    '[hidden]',
    '[aria-hidden="true"]',
    '.ad',
    '.ads',
    '.advertisement',
    '.banner',
    '.breadcrumbs',
    '.breadcrumb',
    '.comment',
    '.comments',
    '.comment-area',
    '.commentArea',
    '.comment-box',
    '.commentBox',
    '.reply',
    '.reply-area',
    '.trackback',
    '.social',
    '.share',
    '.sharing',
    '.sns',
    '.toolbar',
    '.toolbox',
    '.sidebar',
    '.related',
    '.related-posts',
    '.recommend',
    '.recommendations',
    '.tag',
    '.tags',
    '.author',
    '.profile',
    '.byline',
    '.newsletter',
    '.pagination',
    '.paging',
    '.copyright',
    '.subscribe',
    '.promotion',
    '.promo',
    '#comments',
    '#comment',
    '#comment-area',
    '#reply',
    '#trackback',
    '#sidebar',
    '#aside',
    '#footer',
    '#header',
    '#nav',
    '#related',
    '#recommend'
];
const REFERENCE_NOISE_LINE_PATTERNS = [
    /^(댓글|답글|공감|좋아요|공유|신고|복사|수정|삭제|목록|이전|다음)$/i,
    /^(leave a reply|comments?|share|copy link|related posts?)$/i,
    /^(facebook|instagram|twitter|x|threads|kakao|naver)$/i,
    /^(copyright|all rights reserved)$/i,
    /^(본문 바로가기|메뉴 바로가기|콘텐츠 바로가기)$/i
];

function normalizeOpenAiCompatibleBaseUrl(rawBaseUrl) {
    return String(rawBaseUrl || '').trim().replace(/\/+$/, '');
}

function formatReadableErrorMessage(error) {
    const raw = String(error?.message || error || '').trim();
    if (!raw) return '알 수 없는 오류';
    return raw.replace(/timeout of (\d+)ms exceeded/gi, (_, ms) => {
        const seconds = Math.max(1, Math.round(Number(ms) / 1000));
        return `timeout (${seconds}초 초과)`;
    });
}

function formatAiRemoteErrorMessage(error) {
    const responseData = error?.response?.data;
    const remoteMessage = responseData?.error?.message
        || responseData?.error
        || responseData?.message
        || responseData?.msg
        || (typeof responseData === 'string' ? responseData : '');
    const raw = typeof remoteMessage === 'object'
        ? JSON.stringify(remoteMessage)
        : String(remoteMessage || '').trim();
    const readable = formatReadableErrorMessage(raw || error);
    return readable.length > 500 ? `${readable.slice(0, 500)}…` : readable;
}

function extractOpenAIChatContent(data) {
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';

    return content
        .map((part) => {
            if (typeof part === 'string') return part;
            if (typeof part?.text === 'string') return part.text;
            return '';
        })
        .join('')
        .trim();
}

function extractOpenAIImageBuffer(data) {
    const item = Array.isArray(data?.data) ? data.data[0] : null;
    if (!item) return null;
    if (typeof item.b64_json === 'string' && item.b64_json.trim()) {
        return Buffer.from(item.b64_json, 'base64');
    }
    return null;
}

function normalizeTextWhitespace(value) {
    return String(value || '')
        .replace(/\u00a0/g, ' ')
        .replace(/[ \t\r\f\v]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function normalizeAspectRatio(value) {
    const raw = String(value || '').trim();
    return /^[0-9]+:[0-9]+$/.test(raw) ? raw : '';
}

function resolveWritingImageAspectRatio(options = {}) {
    const explicit = normalizeAspectRatio(options.aspectRatio);
    if (explicit) return explicit;

    const useCase = String(options.useCase || '').trim().toLowerCase();
    if (useCase === 'shopping') return '1:1';
    return '4:3';
}

function resolveWritingImageSize(options = {}) {
    const raw = String(options.imageSize || '').trim().toUpperCase();
    if (raw === '2K') return '2K';
    return '1K';
}

function truncateText(value, maxLength) {
    const text = String(value || '').trim();
    if (!text || text.length <= maxLength) return text;
    return text.slice(0, Math.max(0, maxLength - 1)).trimEnd() + '…';
}

function stripCodeFence(rawText) {
    return String(rawText || '')
        .replace(/^\s*```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim();
}

function extractBalancedJsonCandidate(rawText) {
    const text = stripCodeFence(rawText);
    if (!text) return '';

    const starts = [];
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '{' || ch === '[') starts.push(i);
    }

    for (const start of starts) {
        const opening = text[start];
        const closing = opening === '{' ? '}' : ']';
        let depth = 0;
        let inString = false;
        let escaped = false;

        for (let i = start; i < text.length; i++) {
            const ch = text[i];
            if (inString) {
                if (escaped) {
                    escaped = false;
                    continue;
                }
                if (ch === '\\') {
                    escaped = true;
                    continue;
                }
                if (ch === '"') {
                    inString = false;
                }
                continue;
            }

            if (ch === '"') {
                inString = true;
                continue;
            }

            if (ch === opening) {
                depth += 1;
                continue;
            }

            if (ch === closing) {
                depth -= 1;
                if (depth === 0) {
                    return text.slice(start, i + 1).trim();
                }
            }
        }
    }

    return text;
}

function parseStructuredJsonResponse(rawText) {
    const direct = stripCodeFence(rawText);
    if (!direct) {
        throw new Error('AI 응답이 비어 있습니다.');
    }

    try {
        return JSON.parse(direct);
    } catch (_ignore) { }

    const extracted = extractBalancedJsonCandidate(direct);
    if (!extracted) {
        throw new Error('AI 응답에서 JSON 블록을 찾지 못했습니다.');
    }

    return JSON.parse(extracted);
}

function cleanTitleText(value) {
    const raw = normalizeTextWhitespace(String(value || '').replace(/\s+/g, ' '));
    if (!raw) return '';
    const parts = raw.split(/\s+[|\-·•»]\s+/).map((part) => part.trim()).filter(Boolean);
    const picked = parts.length > 0 ? parts[0] : raw;
    return truncateText(picked, REFERENCE_FETCH_MAX_TITLE_CHARS);
}

function removeNoiseNodes($root) {
    for (const selector of REFERENCE_NOISE_SELECTORS) {
        try {
            $root.find(selector).remove();
        } catch (e) { }
    }
}

function extractTextBlocksFromNode($, $node) {
    if (!$node || $node.length === 0) return [];

    const html = String($node.html() || '')
        .replace(/<\s*br\s*\/?>/gi, '\n')
        .replace(/<\/\s*(p|div|section|article|li|ul|ol|blockquote|h1|h2|h3|h4|h5|h6|pre|tr|table)\s*>/gi, '$&\n');

    if (!html.trim()) return [];

    const $$ = cheerio.load(`<div id="__codex_ref_extract__">${html}</div>`);
    const text = $$('#__codex_ref_extract__').text();
    const blocks = String(text || '')
        .split(/\n+/)
        .map((line) => normalizeTextWhitespace(line))
        .filter(Boolean)
        .filter((line) => line.length >= 12)
        .filter((line) => !REFERENCE_NOISE_LINE_PATTERNS.some((pattern) => pattern.test(line)));

    const deduped = [];
    const seen = new Set();
    for (const block of blocks) {
        const key = block.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(block);
    }
    return deduped;
}

function scoreReferenceCandidate($, $node, blocks) {
    const joined = blocks.join('\n');
    const textLength = joined.length;
    if (textLength < 120) return -1;

    const attrs = `${String($node.attr('id') || '')} ${String($node.attr('class') || '')}`.toLowerCase();
    const tagName = String($node.get(0)?.tagName || '').toLowerCase();
    const paragraphCount = $node.find('p').length;
    const headingCount = $node.find('h1, h2, h3').length;

    let score = textLength;
    if (tagName === 'article') score += 1200;
    if (tagName === 'main') score += 900;
    if (attrs.includes('content')) score += 700;
    if (attrs.includes('article')) score += 700;
    if (attrs.includes('entry')) score += 650;
    if (attrs.includes('post')) score += 650;
    if (attrs.includes('main')) score += 500;
    if (attrs.includes('comment')) score -= 4000;
    if (attrs.includes('reply')) score -= 3000;
    if (attrs.includes('sidebar')) score -= 3000;
    if (attrs.includes('share')) score -= 2000;
    if (attrs.includes('footer')) score -= 2000;
    score += Math.min(paragraphCount, 12) * 120;
    score += Math.min(headingCount, 6) * 80;

    return score;
}

function extractReferenceContentFromHtml(html, url) {
    const $ = cheerio.load(html || '');
    const pageTitle =
        cleanTitleText($('meta[property="og:title"]').attr('content'))
        || cleanTitleText($('meta[name="twitter:title"]').attr('content'))
        || cleanTitleText($('title').first().text())
        || cleanTitleText($('h1').first().text());

    removeNoiseNodes($.root());

    const candidates = [];
    for (const selector of REFERENCE_CONTENT_SELECTORS) {
        const nodes = $(selector);
        if (!nodes || nodes.length === 0) continue;
        nodes.each((_, el) => {
            const $node = $(el);
            const blocks = extractTextBlocksFromNode($, $node);
            const score = scoreReferenceCandidate($, $node, blocks);
            if (score > 0) {
                candidates.push({ selector, score, blocks });
            }
        });
    }

    let picked = candidates.sort((a, b) => b.score - a.score)[0] || null;
    if (!picked) {
        const bodyBlocks = extractTextBlocksFromNode($, $('body').first());
        picked = {
            selector: 'body',
            score: bodyBlocks.join('\n').length,
            blocks: bodyBlocks
        };
    }

    const limitedBlocks = [];
    let totalLength = 0;
    for (const block of picked.blocks) {
        if (limitedBlocks.length >= REFERENCE_FETCH_MAX_BLOCKS) break;
        const nextLength = totalLength + block.length + 1;
        if (limitedBlocks.length > 0 && nextLength > REFERENCE_FETCH_MAX_CHARS) break;
        limitedBlocks.push(block);
        totalLength = nextLength;
    }

    let bodyText = limitedBlocks.join('\n\n').trim();
    if (!bodyText && picked.blocks.length > 0) {
        bodyText = truncateText(picked.blocks.join('\n\n'), REFERENCE_FETCH_MAX_CHARS);
    }

    const finalText = [pageTitle ? `[제목] ${pageTitle}` : '', bodyText]
        .filter(Boolean)
        .join('\n\n')
        .trim();

    return {
        title: pageTitle,
        text: truncateText(finalText, REFERENCE_FETCH_MAX_CHARS),
        bodyLength: bodyText.length,
        selector: picked.selector || 'body',
        url: String(url || '').trim()
    };
}

const Utils = {
    _sheetCache: {}, // { key: { data: any, expiry: number } }
    _headerCache: {}, // { key: { map: any, timestamp: number } }

    /**
     * 🛡️ 간단한 시간 기반 캐시 래퍼 (5초 TTL)
     */
    withSimpleCache: async function (key, fn, ttlMs = 5000) {
        const now = Date.now();
        const entry = this._sheetCache[key];
        if (entry && entry.expiry > now) {
            return entry.data;
        }
        const data = await fn();
        this._sheetCache[key] = { data, expiry: now + ttlMs };
        return data;
    },

    /**
     * 🧹 캐시 강제 무효화
     */
    clearSheetCache: function (keyPrefix) {
        if (keyPrefix) {
            Object.keys(this._sheetCache).forEach(k => {
                if (k === keyPrefix || k.startsWith(keyPrefix + '_') || k.startsWith(keyPrefix)) {
                    delete this._sheetCache[k];
                }
            });
        } else {
            this._sheetCache = {};
        }
    },

    formatKstDateTime: function (date = new Date()) {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Seoul',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        }).formatToParts(date);
        const get = (type) => parts.find((p) => p.type === type)?.value || '';
        const year = get('year');
        const month = get('month');
        const day = get('day');
        const hour = get('hour');
        const minute = get('minute');
        const second = get('second');
        if (!year || !month || !day || !hour || !minute || !second) {
            return new Date().toISOString().replace('T', ' ').slice(0, 19);
        }
        return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
    },

    formatAxiosError: function (e) {
        const status = e?.response?.status;
        const data = e?.response?.data;
        const apiMessage =
            data?.error?.message ||
            data?.error_description ||
            (typeof data === 'string' ? data : '');
        const baseMessage = String(e?.message || '요청 실패');
        if (status) {
            return apiMessage ? `status=${status} ${apiMessage}` : `status=${status} ${baseMessage}`;
        }
        return apiMessage || baseMessage;
    },

    sanitizeFileName: function (str) {
        if (!str) return "untitled";
        // 🔧 [Fixed] 파일명 길이 제한 추가 (파일 시스템 에러 방지)
        let cleaned = str.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "_");
        // 파일명 최대 200자로 제한 (확장자 및 경로 고려)
        if (cleaned.length > 200) {
            cleaned = cleaned.substring(0, 200);
        }
        return cleaned;
    },

    sleep: (ms) => new Promise(res => setTimeout(res, ms)),

    runWithHeartbeat: async function (taskLabel, fn, intervalMs = 7000) {
        const startedAt = Date.now();
        const timer = setInterval(() => {
            const elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
            Logger.info(`   ⏳ ${taskLabel} 진행 중... (${elapsedSec}초 경과)`);
        }, intervalMs);

        try {
            return await fn();
        } finally {
            clearInterval(timer);
        }
    },

    // 🔒 토큰 캐싱을 위한 변수
    _cachedAccessToken: null,
    _tokenExpiry: 0,
    _cachedScopeKey: '',
    _sheetsHealthLogState: {
        hasIssue: null,
        lastIssueMessage: '',
        updatedAt: null
    },

    clearGoogleAuthCache: function () {
        this._cachedAccessToken = null;
        this._tokenExpiry = 0;
        this._cachedScopeKey = '';
    },

    /**
     * 🔐 수동 구글 액세스 토큰 발급 (캐싱 적용)
     */
    getGoogleAccessToken: async function (scopes = []) {
        if (RuntimeConfig?.ensureGoogleOauthClientConfig) {
            const ready = await RuntimeConfig.ensureGoogleOauthClientConfig();
            if (!ready) {
                throw new Error('Google OAuth 클라이언트를 runtime config에서 불러오지 못했습니다. Supabase app_runtime_configs 또는 네트워크 상태를 확인해 주세요.');
            }
        }

        const normalizedScopes = (() => {
            const incoming = Array.isArray(scopes) ? scopes : [];
            const merged = incoming.length > 0
                ? incoming
                : ['https://www.googleapis.com/auth/spreadsheets'];
            return Array.from(new Set(merged.map(s => String(s || '').trim()).filter(Boolean))).sort();
        })();
        const scopeKey = normalizedScopes.join(' ');

        // 캐시된 토큰이 있고, 만료 시간(1시간)보다 5분 여유가 있다면 재사용
        const now = Math.floor(Date.now() / 1000);
        if (this._cachedAccessToken && this._tokenExpiry > now + 300 && this._cachedScopeKey === scopeKey) {
            return this._cachedAccessToken;
        }

        try {
            const { accessToken, tokens } = await GoogleOAuth.getAccessToken(normalizedScopes);
            this._cachedAccessToken = accessToken;
            this._tokenExpiry = Math.floor(Number(tokens.expiry_date || 0) / 1000);
            this._cachedScopeKey = scopeKey;
            return accessToken;
        } catch (e) {
            throw new Error(`Google OAuth 토큰 발급 실패: ${e.message}`);
        }
    },

    /**
     * 🛡️ API 호출 래퍼 (Rate Limit 자동 재시도)
     */
    callWithRetry: async function (fn, retries = 5, delay = 2000) {
        for (let i = 0; i < retries; i++) {
            try {
                // 🛡️ [Fixed] 기본 타임아웃 15초 부여 (무한 대기 방지)
                return await fn();
            } catch (e) {
                // 429(Too Many Requests) 또는 5xx 에러인 경우 재시도
                if (i < retries - 1 && (e.response?.status === 429 || e.response?.status >= 500)) {
                    const wait = delay * Math.pow(2, i); // 지수 백오프
                    Logger.warn(`⚠️ Google Sheets API Rate Limit(${e.response?.status}). ${wait / 1000}초 후 재시도...`);
                    await new Promise(res => setTimeout(res, wait));
                } else {
                    throw new Error(this.formatAxiosError(e));
                }
            }
        }
    },

    /**
     * 🌐 Google Sheets API POST 요청 래퍼
     */
    googleSheetPost: async function (url, data) {
        const accessToken = await this.getGoogleAccessToken();
        return this.callWithRetry(() => axios.post(url, data, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        })).then(res => res.data);
    },

    /**
     * 🔍 시트 이름으로 sheetId 조회
     */
    getSheetIdByName: async function (spreadsheetId, sheetName) {
        const accessToken = await this.getGoogleAccessToken();
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`;
        const res = await this.callWithRetry(() => axios.get(url, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        }));

        const sheet = (res.data.sheets || []).find(s => s.properties.title === sheetName);
        return sheet ? sheet.properties.sheetId : null;
    },

    /**
     * 0. 초기화: 모든 필수 시트가 있는지 확인하고 없으면 생성
     */
    ensureAllSheetsExist: async function () {
        return this._ensureAllSheetsExistInternal({ spreadsheetId: CONFIG.GOOGLE_SHEET_ID, suppressError: true });
    },

    ensureAllSheetsExistStrict: async function (spreadsheetId) {
        return this._ensureAllSheetsExistInternal({ spreadsheetId, suppressError: false });
    },

    ensureSnsSheetReadyStrict: async function (spreadsheetId = CONFIG.GOOGLE_SHEET_ID) {
        const accessToken = await this.getGoogleAccessToken();
        const targetSpreadsheetId = String(spreadsheetId || '').trim();
        if (!targetSpreadsheetId) throw new Error('GOOGLE_SHEET_ID가 비어 있습니다.');

        await this._ensureSnsSheetReady(accessToken, targetSpreadsheetId, { suppressError: false });
        return {
            success: true,
            spreadsheetId: targetSpreadsheetId,
            sheetName: SNS_SHEET_NAME
        };
    },

    readGoogleSheetTrends: async function (options = {}) {
        const result = [];
        try {
            if (!options.silent) Logger.info("🌐 구글 트렌드 시트 전체 스캔 중...");
            const accessToken = await this.getGoogleAccessToken();
            const spreadsheetId = CONFIG.GOOGLE_SHEET_ID;
            const sheetName = CONFIG.GOOGLE_TRENDS_SHEET || 'trends';
            const targetSpreadsheetId = String(spreadsheetId || '').trim();
            if (!targetSpreadsheetId) throw new Error('GOOGLE_SHEET_ID가 비어 있습니다.');

            const url = `https://sheets.googleapis.com/v4/spreadsheets/${targetSpreadsheetId}/values/${encodeURIComponent(sheetName)}`;
            const res = await this.callWithRetry(() => axios.get(url, {
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
            }));

            const rows = res.data.values;
            if (!rows || rows.length === 0) return [];

            const headers = rows[0].map(h => h.toLowerCase().replace(/[\s\/_]/g, '').trim());
            const parsed = rows.slice(1).map((row, index) => {
                const entry = {};
                headers.forEach((h, i) => { entry[h] = row[i] !== undefined ? row[i] : ""; });
                const getVal = (cols) => {
                    for (const col of cols) {
                        const cleanCol = String(col).toLowerCase().replace(/[\s\/_]/g, '').trim();
                        if (Object.prototype.hasOwnProperty.call(entry, cleanCol) && String(entry[cleanCol]).trim() !== '') {
                            return String(entry[cleanCol]).trim();
                        }
                    }
                    return "";
                };

                const date = getVal(['날짜', 'date']);
                const subject = getVal(['주제', 'subject']);
                const keywords = getVal(['키워드', 'keyword']);
                const change = getVal(['증감', 'change']);
                const status = getVal(['동작상태', '동작/상태', 'status']);

                return {
                    rowIndex: index,
                    rowNumber: index + 2,
                    date: date || '',
                    subject: subject || '',
                    keywords: keywords ? keywords.split(',').map(k => k.trim()).filter(k => k) : [],
                    change: change || '',
                    status: status || ''
                };
            });

            return parsed;

        } catch (e) {
            if (CONFIG.CONFIG_IS_ESSENTIAL_SET) {
                Logger.info(`구글 트렌드 시트 읽기 실패: ${e.message} (미사용 시 무시 가능)`);
            }
            return [];
        }
    },

    _ensureAllSheetsExistInternal: async function ({ spreadsheetId, suppressError }) {
        try {
            const accessToken = await this.getGoogleAccessToken();
            const targetSpreadsheetId = String(spreadsheetId || '').trim();
            if (!targetSpreadsheetId) throw new Error('GOOGLE_SHEET_ID가 비어 있습니다.');

            // 현재 시트 목록 조회
            const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${targetSpreadsheetId}`;
            const metaRes = await this.callWithRetry(() => axios.get(metaUrl, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            }));

            const existingSheets = metaRes.data.sheets.map(s => s.properties.title);
            const requiredSheets = [
                // [REMOVED] trends, keywords 시트는 production에서 불필요하여 자동 생성에서 제외됨
                // { name: CONFIG.GOOGLE_TRENDS_SHEET || 'trends', type: 'trends' },
                // { name: CONFIG.GOOGLE_KEYWORDS_SHEET || 'keywords', type: 'keywords' },
                { name: CONFIG.GOOGLE_TOPICS_SHEET || 'topics', type: 'topics' },
                { name: CONFIG.GOOGLE_SHOPPING_SHEET || 'shopping', type: 'shopping' }
            ];

            for (const sheet of requiredSheets) {
                if (!existingSheets.includes(sheet.name)) {
                    Logger.info(`✨ '${sheet.name}' 시트가 없어서 생성을 시작합니다...`);
                    await this.createSheetIfMissing(accessToken, targetSpreadsheetId, sheet.name, sheet.type);
                } else {
                    // [Added] 이미 존재하는 시트에도 필수 헤더(특히 options)가 있는지 확인하고 동기화
                    await this._syncSheetHeadersIfMissing(accessToken, targetSpreadsheetId, sheet.name, sheet.type);
                }
            }

            // 이미 존재하는 shopping 시트도 상태 드롭다운(발행 중 포함)을 최신 규칙으로 보정
            const shoppingSheetName = CONFIG.GOOGLE_SHOPPING_SHEET || 'shopping';
            const latestMeta = await this.callWithRetry(() => axios.get(metaUrl, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            }));
            const shoppingSheet = (latestMeta.data.sheets || []).find(s => s.properties?.title === shoppingSheetName);
            if (shoppingSheet?.properties?.sheetId !== undefined) {
                await this.ensureShoppingSheetValidation(accessToken, targetSpreadsheetId, shoppingSheet.properties.sheetId, shoppingSheetName);
            }

            // SNS는 모든 플랜에 공통으로 준비하되, 준비 실패가 topics/shopping 사용을 막지는 않는다.
            // 실제 SNS 수집/발행 경로에서는 ensureSnsSheetReadyStrict()로 다시 확인한다.
            const snsResult = await this._ensureSnsSheetReady(accessToken, targetSpreadsheetId, { suppressError: true });

            if (this._sheetsHealthLogState?.hasIssue === true) {
                Logger.info("✅ 필수 시트 준비 이슈 해지");
            }
            this._sheetsHealthLogState = {
                hasIssue: false,
                lastIssueMessage: '',
                updatedAt: new Date().toISOString()
            };
            return {
                success: true,
                spreadsheetId: targetSpreadsheetId,
                snsReady: snsResult.success,
                snsMessage: snsResult.message || ''
            };

        } catch (e) {
            const errMessage = String(e?.message || e || 'unknown');
            const prevHasIssue = this._sheetsHealthLogState?.hasIssue === true;
            const prevMessage = String(this._sheetsHealthLogState?.lastIssueMessage || '');
            if (!prevHasIssue || prevMessage !== errMessage) {
                Logger.error(`❌ 필수 시트 준비 이슈: ${errMessage}`);
            }
            this._sheetsHealthLogState = {
                hasIssue: true,
                lastIssueMessage: errMessage,
                updatedAt: new Date().toISOString()
            };
            if (suppressError) {
                return { success: false, spreadsheetId: String(spreadsheetId || '').trim(), message: errMessage };
            }
            throw e;
        }
    },

    createSpreadsheetWithDefaultSheets: async function (options = {}) {
        const title = String(options.title || '').trim() || `BlogGenius ${new Date().toISOString().slice(0, 10)}`;
        const shareEmail = String(options.shareEmail || '').trim();
        const sheetsToken = await this.getGoogleAccessToken(['https://www.googleapis.com/auth/spreadsheets']);
        let createRes;
        try {
            createRes = await this.callWithRetry(() => axios.post(
                'https://sheets.googleapis.com/v4/spreadsheets',
                {
                    properties: { title }
                },
                {
                    headers: { 'Authorization': `Bearer ${sheetsToken}`, 'Content-Type': 'application/json' }
                }
            ));
        } catch (e) {
            throw new Error(`시트 생성 실패: ${this.formatAxiosError(e)}`);
        }

        const spreadsheetId = String(createRes?.data?.spreadsheetId || '').trim();
        const spreadsheetUrl = String(createRes?.data?.spreadsheetUrl || '').trim();
        if (!spreadsheetId) throw new Error('스프레드시트 생성에 실패했습니다. spreadsheetId를 받지 못했습니다.');

        try {
            await this.ensureAllSheetsExistStrict(spreadsheetId);
        } catch (e) {
            throw new Error(`기본 시트 초기화 실패: ${this.formatAxiosError(e)}`);
        }

        const shareResult = { attempted: false, success: false, message: '' };
        if (shareEmail) {
            shareResult.attempted = true;
            try {
                const driveToken = await this.getGoogleAccessToken(['https://www.googleapis.com/auth/drive']);
                await this.callWithRetry(() => axios.post(
                    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(spreadsheetId)}/permissions`,
                    {
                        role: 'writer',
                        type: 'user',
                        emailAddress: shareEmail
                    },
                    {
                        params: { sendNotificationEmail: true },
                        headers: { 'Authorization': `Bearer ${driveToken}`, 'Content-Type': 'application/json' }
                    }
                ));
                shareResult.success = true;
                shareResult.message = '공유 완료';
            } catch (e) {
                shareResult.success = false;
                shareResult.message = e?.response?.data?.error?.message || e.message || '공유 실패';
            }
        }

        return {
            spreadsheetId,
            spreadsheetUrl,
            title,
            share: shareResult
        };
    },

    ensureShoppingSheetValidation: async function (accessToken, spreadsheetId, sheetId, sheetName) {
        try {
            let wpStatusColIndex = -1;
            let generalStatusColIndex = -1;
            try {
                const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:1`;
                const headerRes = await this.callWithRetry(() => axios.get(readUrl, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                }));
                const headers = (headerRes.data.values && headerRes.data.values[0]) ? headerRes.data.values[0] : [];
                const cleanHeaders = headers.map(h => String(h || '').toLowerCase().replace(/[\s\/_]/g, ''));

                // 1. post_status (WP) 컬럼 찾기
                wpStatusColIndex = cleanHeaders.findIndex(h => h === 'poststatus' || h === '발행상태');

                // 2. 일반 상태 컬럼 찾기 (post_status 제외)
                generalStatusColIndex = cleanHeaders.findIndex((h, i) => i !== wpStatusColIndex && (h === '상태' || h === 'status'));

                // fallback for legacy
                if (generalStatusColIndex === -1 && wpStatusColIndex === -1) {
                    generalStatusColIndex = cleanHeaders.findIndex(h => h.includes('상태') || h.includes('status'));
                }
            } catch (e) {
                // 헤더 조회 실패 시 중단
                return;
            }

            const validationRequests = [];

            // WP 상태 드롭다운 (publish, draft, schedule)
            if (wpStatusColIndex >= 0) {
                validationRequests.push({
                    setDataValidation: {
                        range: { sheetId, startRowIndex: 1, startColumnIndex: wpStatusColIndex, endColumnIndex: wpStatusColIndex + 1 },
                        rule: {
                            condition: {
                                type: 'ONE_OF_LIST',
                                values: [{ userEnteredValue: 'publish' }, { userEnteredValue: 'draft' }, { userEnteredValue: 'schedule' }]
                            },
                            showCustomUi: true, strict: true
                        }
                    }
                });
            }

            // 일반 상태 드롭다운 (준비, 발행 중, ...)
            if (generalStatusColIndex >= 0) {
                validationRequests.push({
                    setDataValidation: {
                        range: { sheetId, startRowIndex: 1, startColumnIndex: generalStatusColIndex, endColumnIndex: generalStatusColIndex + 1 },
                        rule: {
                            condition: {
                                type: 'ONE_OF_LIST',
                                values: [
                                    { userEnteredValue: '준비' },
                                    { userEnteredValue: '발행 중' },
                                    { userEnteredValue: '발행 준비 완료' },
                                    { userEnteredValue: '발행 완료' },
                                    { userEnteredValue: '임시 저장 완료' },
                                    { userEnteredValue: '예약 포스팅 등록 완료' },
                                    { userEnteredValue: '실패' }
                                ]
                            },
                            showCustomUi: true, strict: true
                        }
                    }
                });
            }

            if (validationRequests.length > 0) {
                const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
                await this.callWithRetry(() => axios.post(updateUrl, { requests: validationRequests }, {
                    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
                }));
            }
        } catch (e) {
            Logger.warn(`⚠️ shopping 시트 검증 규칙 업데이트 실패: ${e.message}`);
        }
    },

    _ensureSnsSheetReady: async function (accessToken, spreadsheetId, options = {}) {
        const suppressError = options.suppressError !== false;
        try {
            const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
            let metaRes = await this.callWithRetry(() => axios.get(metaUrl, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            }));
            let snsSheet = (metaRes.data.sheets || []).find(
                (sheet) => sheet.properties?.title === SNS_SHEET_NAME
            );

            if (!snsSheet) {
                Logger.info(`✨ '${SNS_SHEET_NAME}' 시트가 없어서 생성을 시작합니다...`);
                await this.createSheetIfMissing(accessToken, spreadsheetId, SNS_SHEET_NAME, 'sns');
                metaRes = await this.callWithRetry(() => axios.get(metaUrl, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                }));
                snsSheet = (metaRes.data.sheets || []).find(
                    (sheet) => sheet.properties?.title === SNS_SHEET_NAME
                );
            }

            if (snsSheet?.properties?.sheetId === undefined) {
                throw new Error(`'${SNS_SHEET_NAME}' 시트의 sheetId를 확인하지 못했습니다.`);
            }

            await this.ensureSnsSheetValidation(
                accessToken,
                spreadsheetId,
                snsSheet.properties.sheetId,
                SNS_SHEET_NAME,
                { suppressError: false }
            );

            return { success: true, sheetName: SNS_SHEET_NAME };
        } catch (e) {
            const message = String(e?.message || e || 'unknown');
            Logger.warn(`⚠️ '${SNS_SHEET_NAME}' 시트 준비 실패: ${message}`);
            if (!suppressError) throw e;
            return { success: false, sheetName: SNS_SHEET_NAME, message };
        }
    },

    ensureSnsSheetValidation: async function (accessToken, spreadsheetId, sheetId, sheetName, options = {}) {
        const suppressError = options.suppressError !== false;
        try {
            const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:1`;
            const headerRes = await this.callWithRetry(() => axios.get(readUrl, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            }));
            const headers = Array.isArray(headerRes?.data?.values?.[0])
                ? headerRes.data.values[0]
                : [];
            const normalizedHeaders = new Set(
                headers.map((header) => String(header || '').toLowerCase().replace(/[\s/_]/g, '').trim())
            );
            const missingHeaders = SNS_SHEET_HEADERS.filter(
                (header) => !normalizedHeaders.has(
                    String(header || '').toLowerCase().replace(/[\s/_]/g, '').trim()
                )
            );
            if (missingHeaders.length > 0) {
                throw new Error(`'${sheetName}' 시트 필수 헤더가 없습니다: ${missingHeaders.join(', ')}`);
            }
            const statusColumnIndex = headers.findIndex(
                (header) => String(header || '').toLowerCase().replace(/[\s\/_]/g, '').trim() === '상태'
            );
            if (statusColumnIndex < 0) {
                throw new Error(`'${sheetName}' 시트에서 상태 컬럼을 찾지 못했습니다.`);
            }

            const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
            await this.callWithRetry(() => axios.post(
                updateUrl,
                { requests: [buildSnsStatusValidationRequest(sheetId, statusColumnIndex)] },
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            ));
        } catch (e) {
            if (!suppressError) throw e;
            Logger.warn(`⚠️ SNS 시트 검증 규칙 업데이트 실패: ${e.message}`);
        }
    },

    /**
     * 0-2. 기존 시트에 필수 헤더가 빠져있으면 추가 (Sync)
     */
    _syncSheetHeadersIfMissing: async function (accessToken, spreadsheetId, sheetName, type, options = {}) {
        const suppressError = options.suppressError !== false;
        try {
            const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:1`;
            const headerRes = await this.callWithRetry(() => axios.get(readUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } }));
            const currentHeaders = Array.isArray(headerRes?.data?.values?.[0]) ? headerRes.data.values[0] : [];
            const currentHeadersClean = currentHeaders.map(h => String(h || '').toLowerCase().replace(/[\s\/_]/g, '').trim());

            let requiredHeaders = [];
            if (type === 'topics') {
                requiredHeaders = [
                    'category', 'post_status', 'schedule_date', 'subject', 'keywords',
                    '참고/지시 사항', '상태', '이미지 생성', '외부 참고 여부', '참고 URL',
                    'options', '발행 시간', '로그', '추가일시', '소스', '트렌드일자'
                ];
            } else if (type === 'shopping') {
                requiredHeaders = [
                    'category', 'post_status', 'schedule_date', 'URL', '상품', '참고/지시 사항', '상태', '발행 시간', '로그', 'options'
                ];
            }

            const missingHeaders = requiredHeaders.filter(h => {
                const cleanH = h.toLowerCase().replace(/[\s\/_]/g, '').trim();
                return !currentHeadersClean.includes(cleanH);
            });

            if (missingHeaders.length > 0) {
                Logger.info(`   🔍 '${sheetName}' 시트에 누락된 헤더 발견: ${missingHeaders.join(', ')}. 추가를 시작합니다...`);
                const newHeaders = [...currentHeaders, ...missingHeaders];
                const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:1?valueInputOption=USER_ENTERED`;
                await this.callWithRetry(() => axios.put(updateUrl, {
                    range: `${sheetName}!1:1`,
                    majorDimension: 'ROWS',
                    values: [newHeaders]
                }, {
                    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
                }));
                Logger.info(`   ✅ '${sheetName}' 시트 헤더 동기화 완료`);
            }
        } catch (e) {
            if (!suppressError) throw e;
            Logger.warn(`⚠️ '${sheetName}' 헤더 동기화 중 오류 (무시 가능): ${e.message}`);
        }
    },

    /**
     * 0-1. 시트 생성 및 초기화 (헤더, 고정, 드롭다운)
     */
    createSheetIfMissing: async function (accessToken, spreadsheetId, sheetName, type) {
        try {
            // 1. 시트 생성 (1행 고정)
            const createUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
            const createRes = await this.callWithRetry(() => axios.post(createUrl, {
                requests: [{
                    addSheet: {
                        properties: {
                            title: sheetName,
                            gridProperties: { frozenRowCount: 1 }
                        }
                    }
                }]
            }, { headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }));

            const newSheetId = createRes.data.replies[0].addSheet.properties.sheetId;

            // 2. 헤더 및 데이터 유효성 검사 설정
            let headerRow = [];
            let validationRequests = [];

            if (type === 'keywords') {
                // 헤더: keyword, 동작 / 상태, 작업 시간
                headerRow = [['keyword', '동작 / 상태', '작업 시간']];

                // Dropdown: B열 (Index 1) -> 대기, 연관검색어 조사, 연관검색어 조사 완료
                validationRequests.push({
                    setDataValidation: {
                        range: { sheetId: newSheetId, startRowIndex: 1, startColumnIndex: 1, endColumnIndex: 2 },
                        rule: {
                            condition: {
                                type: 'ONE_OF_LIST',
                                values: [
                                    { userEnteredValue: '대기' },
                                    { userEnteredValue: '연관검색어 조사' },
                                    { userEnteredValue: '연관검색어 조사 완료' }
                                ]
                            },
                            showCustomUi: true, strict: true
                        }
                    }
                });
            } else if (type === 'topics') {
                // 헤더: category, post_status, schedule_date, subject, keywords, 참고/지시 사항, 상태, 이미지 생성, 외부 참고 여부, 참고 URL, 발행 시간, 로그, 추가일시, 소스, 트렌드일자
                headerRow = [[
                    'category',
                    'post_status',
                    'schedule_date',
                    'subject',
                    'keywords',
                    '참고/지시 사항',
                    '상태',
                    '이미지 생성',
                    '외부 참고 여부',
                    '참고 URL',
                    'options', // [Added] JSON 확장 옵션 컬럼
                    '발행 시간',
                    '로그',
                    '추가일시',
                    '소스',
                    '트렌드일자'
                ]];

                // Dropdown: B열 (Index 1) -> publish, draft, schedule (발행 옵션)
                validationRequests.push({
                    setDataValidation: {
                        range: { sheetId: newSheetId, startRowIndex: 1, startColumnIndex: 1, endColumnIndex: 2 },
                        rule: {
                            condition: {
                                type: 'ONE_OF_LIST',
                                values: [
                                    { userEnteredValue: 'publish' },
                                    { userEnteredValue: 'draft' },
                                    { userEnteredValue: 'schedule' }
                                ]
                            },
                            showCustomUi: true, strict: true
                        }
                    }
                });

                // Dropdown: G열 (Index 6) -> 대기, 발행 준비 완료, 발행 완료 (처리 상태)
                validationRequests.push({
                    setDataValidation: {
                        range: { sheetId: newSheetId, startRowIndex: 1, startColumnIndex: 6, endColumnIndex: 7 },
                        rule: {
                            condition: {
                                type: 'ONE_OF_LIST',
                                values: [
                                    { userEnteredValue: '대기' },
                                    { userEnteredValue: '발행 준비 완료' },
                                    { userEnteredValue: '발행 완료' },
                                    { userEnteredValue: '임시 저장 완료' },
                                    { userEnteredValue: '예약 포스팅 등록 완료' }
                                ]
                            },
                            showCustomUi: true, strict: true
                        }
                    }
                });

                // Dropdown: H열 (Index 7) -> Yes, No (이미지 생성 여부)
                validationRequests.push({
                    setDataValidation: {
                        range: { sheetId: newSheetId, startRowIndex: 1, startColumnIndex: 7, endColumnIndex: 8 },
                        rule: {
                            condition: {
                                type: 'ONE_OF_LIST',
                                values: [
                                    { userEnteredValue: 'Yes' },
                                    { userEnteredValue: 'No' }
                                ]
                            },
                            showCustomUi: true, strict: true
                        }
                    }
                });

                // Dropdown: I열 (Index 8) -> Yes, No (외부 참고 여부)
                validationRequests.push({
                    setDataValidation: {
                        range: { sheetId: newSheetId, startRowIndex: 1, startColumnIndex: 8, endColumnIndex: 9 },
                        rule: {
                            condition: {
                                type: 'ONE_OF_LIST',
                                values: [
                                    { userEnteredValue: 'Yes' },
                                    { userEnteredValue: 'No' }
                                ]
                            },
                            showCustomUi: true, strict: true
                        }
                    }
                });
            } else if (type === 'trends') {
                // 헤더: 날짜, 주제, 키워드, 증감, 동작/상태
                headerRow = [['날짜', '주제', '키워드', '증감', '동작/상태']];

                // Dropdown: E열 (Index 4) -> 대기, 키워드 목록에 추가
                validationRequests.push({
                    setDataValidation: {
                        range: { sheetId: newSheetId, startRowIndex: 1, startColumnIndex: 4, endColumnIndex: 5 },
                        rule: {
                            condition: {
                                type: 'ONE_OF_LIST',
                                values: [
                                    { userEnteredValue: '대기' },
                                    { userEnteredValue: '키워드 목록에 추가' },
                                    { userEnteredValue: '키워드 목록 추가 완료' },
                                    { userEnteredValue: '연관검색어 조사' },
                                    { userEnteredValue: '연관검색어 조사 완료' }
                                ]
                            },
                            showCustomUi: true, strict: true
                        }
                    }
                });
            } else if (type === 'shopping') {
                // 헤더: category, post_status, schedule_date, URL, 상품, 참고/지시 사항, 상태, 발행 시간, 로그, options
                headerRow = [['category', 'post_status', 'schedule_date', 'URL', '상품', '참고/지시 사항', '상태', '발행 시간', '로그', 'options']];

                // Dropdown: B열 (Index 1) -> publish, draft, schedule (발행 옵션)
                validationRequests.push({
                    setDataValidation: {
                        range: { sheetId: newSheetId, startRowIndex: 1, startColumnIndex: 1, endColumnIndex: 2 },
                        rule: {
                            condition: {
                                type: 'ONE_OF_LIST',
                                values: [
                                    { userEnteredValue: 'publish' },
                                    { userEnteredValue: 'draft' },
                                    { userEnteredValue: 'schedule' }
                                ]
                            },
                            showCustomUi: true, strict: true
                        }
                    }
                });

                // Dropdown: F열 (Index 5) -> 준비, 발행 중, 발행 준비 완료, 발행 완료, 실패 (상태)
                validationRequests.push({
                    setDataValidation: {
                        range: { sheetId: newSheetId, startRowIndex: 1, startColumnIndex: 5, endColumnIndex: 6 },
                        rule: {
                            condition: {
                                type: 'ONE_OF_LIST',
                                values: [
                                    { userEnteredValue: '준비' },
                                    { userEnteredValue: '발행 중' },
                                    { userEnteredValue: '발행 준비 완료' },
                                    { userEnteredValue: '발행 완료' },
                                    { userEnteredValue: '임시 저장 완료' },
                                    { userEnteredValue: '예약 포스팅 등록 완료' },
                                    { userEnteredValue: '실패' }
                                ]
                            },
                            showCustomUi: true, strict: true
                        }
                    }
                });
            } else if (type === 'sns') {
                headerRow = [[...SNS_SHEET_HEADERS]];
                validationRequests.push(buildSnsStatusValidationRequest(newSheetId));
            }

            // 3. 드롭다운 적용
            if (validationRequests.length > 0) {
                await this.callWithRetry(() => axios.post(createUrl, { requests: validationRequests }, {
                    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
                }));
            }

            // 4. 헤더 쓰기
            const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}:append?valueInputOption=USER_ENTERED`;
            await this.callWithRetry(() => axios.post(appendUrl, { range: sheetName, majorDimension: 'ROWS', values: headerRow }, {
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
            }));

            Logger.info(`   ✅ '${sheetName}' 시트 생성 및 초기화 완료`);

        } catch (e) {
            Logger.error(`   ❌ '${sheetName}' 시트 생성 중 오류: ${e.message}`);
            throw e;
        }
    },

    readGoogleSheetTopics: async function (options = {}) {
        try {
            if (!options.silent) Logger.info("🌐 구글 스프레드시트 읽기 (Native Auth Mode)");
            const accessToken = await this.getGoogleAccessToken();

            const sheetName = CONFIG.GOOGLE_TOPICS_SHEET || 'topics';
            const spreadsheetId = CONFIG.GOOGLE_SHEET_ID;
            const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}`;

            const res = await this.callWithRetry(() => axios.get(url, {
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
            }));

            const rows = res.data.values;
            if (!rows || rows.length === 0) return [];

            const headers = rows[0].map(h => h.toLowerCase().replace(/[\s\/_]/g, '').trim());
            const results = rows.slice(1).map((row, index) => {
                const entry = {};
                headers.forEach((h, i) => { entry[h] = row[i] !== undefined ? row[i] : ""; });
                const getVal = (cols) => {
                    for (let col of cols) {
                        const cleanCol = col.toLowerCase().replace(/[\s\/_]/g, '').trim();
                        if (entry[cleanCol]) return String(entry[cleanCol]).trim();
                    }
                    return "";
                };

                const subject = getVal(['subject', '주제', '제목']);
                const kwStr = getVal(['keywords', '키워드']);
                const instruction = getVal(['참고지시사항', '참고/지시사항', 'instruction', '지시사항', '내용']);
                const urlStr = getVal(['참고url', '참고/url', 'references', 'url']);
                const ctgRaw = getVal(['category', '카테고리']);
                const status = getVal(['상태', 'status']);
                const imgGenStr = getVal(['이미지생성', 'image_gen', 'img_gen']);
                const imgCountStr = getVal(['이미지개수', 'image_count', 'count']);
                const extRefStr = getVal(['외부참고여부', 'external_ref', 'ext_ref']);

                return {
                    rowIndex: index,
                    category: ctgRaw || '',
                    subject: subject || undefined,
                    keywords: kwStr ? kwStr.split(',').map(k => k.trim()).filter(k => k) : [],
                    content_guide: {
                        additional_instructions: instruction,
                        reference_urls: urlStr ? urlStr.split(',').map(u => u.trim()).filter(u => u) : []
                    },
                    status: status ? status.trim() : "",
                    use_external_ref: ['y', 'yes', 'true', 't', '예', '참', 'o'].includes(extRefStr.toLowerCase()),
                    image_options: {
                        generate: ['y', 'yes', 'true', 't', '예', '참', 'o'].includes(imgGenStr.toLowerCase()),
                        count: imgCountStr ? Number(imgCountStr) : undefined
                    }
                };
            });

            // 🔥 [수정됨] 주제, 키워드, URL 중 하나라도 있으면 OK
            return results.filter(item => {
                const hasData = item.subject ||
                    item.keywords.length > 0 ||
                    item.content_guide.reference_urls.length > 0; // 👈 여기 추가됨
                return hasData && (item.status === '발행 준비 완료');
            });

        } catch (e) {
            if (CONFIG.CONFIG_IS_ESSENTIAL_SET) {
                Logger.info(`구글 시트 읽기 실패: ${e.message}`);
            }
            return [];
        }
    },

    /**
     * UI/운영용: topics 시트 전체 조회 (상태/검색/페이징 지원)
     */
    readGoogleSheetTopicsAll: async function (options = {}) {
        const cacheKey = `topics_${options.status || 'all'}_${options.q || ''}_${options.limit || 'max'}_${options.offset || 0}_${options.sortBy || 'none'}_${options.sortDir || 'none'}`;
        return this.withSimpleCache(cacheKey, async () => {
            try {
                const accessToken = await this.getGoogleAccessToken();
                const sheetName = CONFIG.GOOGLE_TOPICS_SHEET || 'topics';
                const spreadsheetId = CONFIG.GOOGLE_SHEET_ID;
                const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}`;

                const res = await this.callWithRetry(() => axios.get(url, {
                    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
                }));

                const rows = res.data.values;
                if (!rows || rows.length === 0) {
                    return { items: [], total: 0, limit: 0, offset: 0 };
                }

                const headers = rows[0].map(h => h.toLowerCase().replace(/[\s\/_]/g, '').trim());
                const parsed = rows.slice(1).map((row, index) => {
                    const entry = {};
                    headers.forEach((h, i) => { entry[h] = row[i] !== undefined ? row[i] : ""; });
                    const getVal = (cols) => {
                        for (const col of cols) {
                            const cleanCol = String(col).toLowerCase().replace(/[\s\/_]/g, '').trim();
                            if (Object.prototype.hasOwnProperty.call(entry, cleanCol) && String(entry[cleanCol]).trim() !== '') {
                                return String(entry[cleanCol]).trim();
                            }
                        }
                        return "";
                    };

                    const subject = getVal(['subject', '주제', '제목']);
                    const kwStr = getVal(['keywords', '키워드']);
                    const instruction = getVal(['참고지시사항', '참고/지시사항', 'instruction', '지시사항', '내용']);
                    const urlStr = getVal(['참고url', '참고/url', 'references', 'url']);
                    const ctgRaw = getVal(['category', '카테고리']);
                    const postStatus = getVal(['poststatus', 'post_status', '발행옵션', '발행_옵션']);
                    const scheduleDate = getVal(['scheduledate', 'schedule_date', '예약일시', '예약_일시']);
                    const status = getVal(['상태', 'status']);
                    const imgGenStr = getVal(['이미지생성', 'image_gen', 'img_gen']);
                    const imgCountStr = getVal(['이미지개수', 'image_count', 'count']);
                    const extRefStr = getVal(['외부참고여부', 'external_ref', 'ext_ref']);
                    const optionsStr = getVal(['options', '옵션', 'extra_options']);
                    const logStr = getVal(['로그', 'log']);
                    const publishedAt = getVal(['발행시간', '발행 시간', 'publish_time', 'time']);
                    const addedAt = getVal(['추가일시', '추가 일시', 'addedat', 'createdat']);
                    const source = getVal(['소스', 'source']);
                    const trendDate = getVal(['트렌드일자', '트렌드 일자', 'trenddate']);

                    const explicitImgGen = imgGenStr ? ['y', 'yes', 'true', 't', '예', '참', 'o'].includes(String(imgGenStr).toLowerCase()) : undefined;
                    const explicitExtRef = extRefStr ? ['y', 'yes', 'true', 't', '예', '참', 'o'].includes(String(extRefStr).toLowerCase()) : undefined;
                    const resolvedState = resolveTopicSheetState({
                        subject,
                        keywords: kwStr ? kwStr.split(',').map(k => k.trim()).filter(k => k) : [],
                        instruction,
                        referenceUrls: urlStr ? urlStr.split(',').map(u => u.trim()).filter(u => u) : [],
                        category: ctgRaw || '',
                        postStatus: postStatus || 'publish',
                        scheduleDate: scheduleDate || '',
                        imageGeneration: explicitImgGen !== undefined ? explicitImgGen : false,
                        externalReference: explicitExtRef !== undefined ? explicitExtRef : true,
                        options: optionsStr
                    });

                    return {
                        rowIndex: index,
                        rowNumber: index + 2,
                        category: resolvedState.category || '',
                        postStatus: resolvedState.postStatus || 'publish',
                        scheduleDate: resolvedState.scheduleDate || '',
                        subject: resolvedState.subject || '',
                        keywords: resolvedState.keywords,
                        keywordsRaw: resolvedState.keywords.join(', ') || kwStr || '',
                        content_guide: {
                            additional_instructions: resolvedState.instruction || '',
                            reference_urls: resolvedState.referenceUrls
                        },
                        status: status || '',
                        image_gen: resolvedState.imageGeneration,
                        image_count: imgCountStr ? Number(imgCountStr) : resolvedState.imageCount,
                        external_reference: resolvedState.externalReference,
                        writing_strategy: resolvedState.writingStrategy,
                        options: resolvedState.options,
                        log: logStr || '',
                        published_at: publishedAt || '',
                        created_at: addedAt || '',
                        source: source || '',
                        trend_date: trendDate || ''
                    };
                });

                const statusFilter = String(options.status || '').trim();
                const q = String(options.q || '').trim().toLowerCase();
                let filtered = parsed;

                if (statusFilter) {
                    filtered = filtered.filter(item => String(item.status || '').trim() === statusFilter);
                }
                if (q) {
                    filtered = filtered.filter((item) => {
                        const haystack = [
                            item.subject,
                            item.keywordsRaw,
                            item.content_guide?.additional_instructions || '',
                            (item.content_guide?.reference_urls || []).join(' '),
                            item.status,
                            item.log,
                            item.addedAt,
                            item.source,
                            item.trendDate
                        ].join(' ').toLowerCase();
                        return haystack.includes(q);
                    });
                }

                const sortBy = String(options.sortBy || 'rowNumber').trim();
                const sortDir = String(options.sortDir || 'desc').trim().toLowerCase() === 'desc' ? 'desc' : 'asc';
                const compareValues = (a, b) => {
                    const aNull = a === null || a === undefined || a === '';
                    const bNull = b === null || b === undefined || b === '';
                    if (aNull && bNull) return 0;
                    if (aNull) return 1;
                    if (bNull) return -1;
                    if (typeof a === 'number' && typeof b === 'number') return a - b;
                    return String(a).localeCompare(String(b), 'ko', { numeric: true, sensitivity: 'base' });
                };
                const getSortValue = (item) => {
                    if (sortBy === 'rowNumber') return Number(item.rowNumber || 0);
                    if (sortBy === 'subject') return String(item.subject || '');
                    if (sortBy === 'keywords') return Array.isArray(item.keywords) ? item.keywords.join(', ') : '';
                    if (sortBy === 'instruction') return String(item.content_guide?.additional_instructions || '');
                    if (sortBy === 'referenceUrl') return Array.isArray(item.content_guide?.reference_urls) ? item.content_guide.reference_urls.join(', ') : '';
                    if (sortBy === 'imageGeneration') return item.image_options?.generate === true ? 1 : 0;
                    if (sortBy === 'externalReference') return item.use_external_ref === true ? 1 : 0;
                    if (sortBy === 'runtimeLog') return String(item.log || '');
                    if (sortBy === 'status') return String(item.status || '');
                    if (sortBy === 'addedAt') return String(item.addedAt || '');
                    if (sortBy === 'source') return String(item.source || '');
                    if (sortBy === 'trendDate') return String(item.trendDate || '');
                    return Number(item.rowNumber || 0);
                };
                filtered = filtered
                    .map((item, index) => ({ item, index }))
                    .sort((a, b) => {
                        const cmp = compareValues(getSortValue(a.item), getSortValue(b.item));
                        if (cmp !== 0) return sortDir === 'desc' ? -cmp : cmp;
                        return a.index - b.index;
                    })
                    .map(v => v.item);

                const total = filtered.length;
                const limit = Number.isFinite(Number(options.limit)) ? Math.max(1, parseInt(options.limit, 10)) : 50;
                const offset = Number.isFinite(Number(options.offset)) ? Math.max(0, parseInt(options.offset, 10)) : 0;
                const items = filtered.slice(offset, offset + limit);

                return { items, total, limit, offset };
            } catch (e) {
                Logger.error(`❌ topics 전체 조회 실패: ${e.message}`);
                return { items: [], total: 0, limit: 0, offset: 0 };
            }
        });
    },


    /**
     * 쇼핑 시트에 새로운 행 추가 (빠른발행/일괄발행용)
     */
    appendGoogleSheetShopping: async function (newItems, options = {}) {
        if (!Array.isArray(newItems) || newItems.length === 0) {
            return { success: true, addedCount: 0, rowNumbers: [], rowIndices: [] };
        }

        try {
            await this.ensureAllSheetsExist();

            const accessToken = await this.getGoogleAccessToken();
            const sheetName = CONFIG.GOOGLE_SHOPPING_SHEET || 'shopping';
            const spreadsheetId = CONFIG.GOOGLE_SHEET_ID;
            const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:1`;

            const headerRes = await this.callWithRetry(() => axios.get(readUrl, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            }));
            const headers = Array.isArray(headerRes?.data?.values?.[0]) ? headerRes.data.values[0] : [];
            if (headers.length === 0) {
                throw new Error('shopping 시트 헤더를 찾지 못했습니다.');
            }

            const map = {};
            headers.forEach((h, i) => {
                const clean = String(h || '').toLowerCase().replace(/[\s\/_]/g, '');
                if ((clean.includes('category') || clean.includes('카테고리')) && map.category === undefined) map.category = i;
                if ((clean.includes('poststatus') || clean.includes('발행옵션') || clean.includes('발행상태')) && map.postStatus === undefined) map.postStatus = i;
                if ((clean.includes('scheduledate') || clean.includes('예약')) && map.scheduleDate === undefined) map.scheduleDate = i;
                if ((clean.includes('url') || clean.includes('링크')) && map.shortUrl === undefined) map.shortUrl = i;
                if ((clean.includes('상품') || clean.includes('product')) && map.product === undefined) map.product = i;
                if ((clean.includes('참고지시사항') || clean.includes('instruction') || clean.includes('지시사항')) && map.instruction === undefined) map.instruction = i;
                if ((clean.includes('상태') && !clean.includes('발행상태') && !clean.includes('poststatus') || clean.includes('status') && !clean.includes('poststatus')) && map.status === undefined) map.status = i;
                if ((clean.includes('발행') || clean.includes('time') || clean.includes('date') || clean.includes('시간') || clean.includes('작업시간')) && !clean.includes('예약') && map.publishedAt === undefined) map.publishedAt = i;
                if ((clean.includes('로그') || clean.includes('log')) && map.log === undefined) map.log = i;
                if ((clean === 'options' || clean === '옵션') && map.options === undefined) map.options = i;
            });

            // Fallbacks for the default structure if not found
            if (map.category === undefined) map.category = 0;
            if (map.postStatus === undefined) map.postStatus = 1;
            if (map.scheduleDate === undefined) map.scheduleDate = 2;
            if (map.shortUrl === undefined) map.shortUrl = 3;
            if (map.product === undefined) map.product = 4;
            if (map.status === undefined) map.status = 5;
            if (map.publishedAt === undefined) map.publishedAt = 6;
            if (map.log === undefined) map.log = 7;

            const maxCol = Math.max(
                map.category,
                map.postStatus,
                map.scheduleDate,
                map.shortUrl,
                map.product,
                map.instruction ?? 0,
                map.status,
                map.publishedAt,
                map.log,
                map.options ?? 0
            );
            const defaultStatus = String(options.defaultStatus || '준비').trim() || '준비';

            const rowsToAdd = newItems.map((item) => {
                const row = new Array(maxCol + 1).fill('');

                const category = String(item?.category || item?.wp_category || '').trim();
                const postStatus = String(item?.postStatus || item?.post_status || 'publish').trim();
                const scheduleDate = String(item?.scheduleDate || item?.schedule_date || '').trim();
                const shortUrl = String(item?.shortUrl || item?.url || '').trim();
                const product = String(item?.product || '').trim();
                const instruction = String(item?.instruction || item?.options?.instruction || '').trim();
                const rowStatus = String(item?.status || defaultStatus).trim() || defaultStatus;
                const syncedOptions = mergeShoppingSheetOptions(item?.options, {
                    instruction,
                    category,
                    postStatus,
                    scheduleDate
                });

                row[map.category] = category;
                row[map.postStatus] = postStatus;
                row[map.scheduleDate] = scheduleDate;
                row[map.shortUrl] = shortUrl;
                row[map.product] = product;
                if (map.instruction !== undefined) row[map.instruction] = instruction;
                row[map.status] = rowStatus;
                if (map.publishedAt !== undefined) row[map.publishedAt] = '';
                if (map.log !== undefined) row[map.log] = '';
                if (map.options !== undefined) row[map.options] = stringifySheetOptionsValue(syncedOptions);

                return row;
            });

            const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}:append?valueInputOption=USER_ENTERED`;
            const appendRes = await this.callWithRetry(() => axios.post(appendUrl, {
                range: sheetName,
                majorDimension: 'ROWS',
                values: rowsToAdd
            }, {
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
            }));

            const updatedRange = appendRes?.data?.updates?.updatedRange || '';
            let rowNumbers = [];
            if (updatedRange) {
                const right = String(updatedRange).split('!')[1] || '';
                const m = right.match(/[A-Z]+(\d+):[A-Z]+(\d+)/i) || right.match(/[A-Z]+(\d+)/i);
                if (m) {
                    const startRow = parseInt(m[1], 10);
                    const endRow = m[2] ? parseInt(m[2], 10) : startRow;
                    if (!Number.isNaN(startRow) && !Number.isNaN(endRow)) {
                        for (let r = startRow; r <= endRow; r++) rowNumbers.push(r);
                    }
                }
            }
            const rowIndices = rowNumbers.map((rowNum) => rowNum - 2).filter((idx) => idx >= 0);

            await this.sleep(200);
            this.clearSheetCache('topics_all');
            this.clearSheetCache('shopping_all');

            // [Universal Memory] Kuzu DB에 쇼핑 아이템 기록
            for (const item of newItems) {
                try {
                    const kuzuData = {
                        name: item.product || item.name || '',
                        price: item.price || '',
                        mall: item.mall || '',
                        source: item.source || options.source || 'manual'
                    };
                    await getAgentEventStore().recordShoppingItem(
                        item.chatId || options.chatId || null,
                        kuzuData,
                        item.memory_provenance || options.memoryProvenance || {}
                    );
                } catch (kuzuErr) {
                    Logger.error(`⚠️ [Utils] Kuzu 쇼핑 기록 실패: ${kuzuErr.message}`);
                }
            }

            return {
                success: true,
                addedCount: rowsToAdd.length,
                rowNumbers,
                rowIndices
            };
        } catch (e) {
            Logger.error(`❌ 쇼핑 시트 append 실패: ${e.message}`);
            return {
                success: false,
                message: e.message
            };
        }
    },

    /**
     * Shopping 시트 읽기 ('발행 준비 완료' 상태만)
     */
    readGoogleSheetShopping: async function (options = {}) {
        try {
            if (!options.silent) Logger.info("🌐 구글 쇼핑 시트 읽기 (Target: 발행 준비 완료)");
            const accessToken = await this.getGoogleAccessToken();

            const sheetName = CONFIG.GOOGLE_SHOPPING_SHEET || 'shopping';
            const spreadsheetId = CONFIG.GOOGLE_SHEET_ID;
            const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}`;

            const res = await this.callWithRetry(() => axios.get(url, {
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
            }));

            const rows = res.data.values;
            if (!rows || rows.length === 0) return [];

            const headers = rows[0].map(h => h.toLowerCase().replace(/[\s\/_]/g, '').trim());
            let urlIdx = -1;
            let statusIdx = -1;

            headers.forEach((h, i) => {
                if (h.includes('url') || h.includes('링크')) urlIdx = i;
                if (
                    (h.includes('상태') && !h.includes('발행상태') && !h.includes('poststatus'))
                    || (h.includes('status') && !h.includes('poststatus'))
                ) statusIdx = i;
            });

            if (urlIdx === -1 || statusIdx === -1) {
                Logger.error("❌ 쇼핑 시트 헤더를 찾을 수 없습니다. (URL, 상태 필수)");
                return [];
            }

            const jobs = [];
            rows.slice(1).forEach((row, index) => {
                const shortUrl = row[urlIdx] ? String(row[urlIdx]).trim() : "";
                const status = row[statusIdx] ? String(row[statusIdx]).trim() : "";
                if (shortUrl && status === '발행 준비 완료') {
                    const headers = rows[0].map(h => h.toLowerCase().replace(/[\s\/_]/g, '').trim());
                    const entry = {};
                    headers.forEach((h, i) => { entry[h] = row[i] !== undefined ? row[i] : ""; });

                    const getVal = (cols) => {
                        for (const col of cols) {
                            const cleanCol = String(col).toLowerCase().replace(/[\s\/_]/g, '').trim();
                            if (Object.prototype.hasOwnProperty.call(entry, cleanCol) && String(entry[cleanCol]).trim() !== '') {
                                return String(entry[cleanCol]).trim();
                            }
                        }
                        return "";
                    };

                    jobs.push({
                        rowIndex: index,
                        shortUrl,
                        status,
                        ...(() => {
                            const resolvedState = resolveShoppingSheetState({
                                instruction: getVal(['참고지시사항', '참고/지시사항', 'instruction', '지시사항']),
                                category: getVal(['category', '카테고리']),
                                postStatus: getVal(['poststatus', 'post_status', '발행옵션', '발행상태']),
                                scheduleDate: getVal(['scheduledate', 'schedule_date', '예약일시']),
                                options: getVal(['options', '옵션', 'extra_options'])
                            });
                            return {
                                instruction: resolvedState.instruction || '',
                                category: resolvedState.category || '',
                                postStatus: resolvedState.postStatus || 'publish',
                                scheduleDate: resolvedState.scheduleDate || '',
                                options: resolvedState.options
                            };
                        })(),
                        log: getVal(['log', '로그'])
                    });
                }
            });

            return jobs;
        } catch (e) {
            if (CONFIG.CONFIG_IS_ESSENTIAL_SET) {
                Logger.info(`쇼핑 시트 읽기 실패: ${e.message} (미사용 시 무시 가능)`);
            }
            return [];
        }
    },

    /**
     * UI/운영용: shopping 시트 전체 조회 (상태/검색/페이징/정렬 지원)
     */
    readGoogleSheetShoppingAll: async function (options = {}) {
        const cacheKey = `shopping_${options.status || 'all'}_${options.q || ''}_${options.limit || 'max'}_${options.offset || 0}_${options.sortBy || 'none'}_${options.sortDir || 'none'}`;
        return this.withSimpleCache(cacheKey, async () => {
            try {
                const accessToken = await this.getGoogleAccessToken();
                const sheetName = CONFIG.GOOGLE_SHOPPING_SHEET || 'shopping';
                const spreadsheetId = CONFIG.GOOGLE_SHEET_ID;
                const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}`;

                const res = await this.callWithRetry(() => axios.get(url, {
                    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
                }));

                const rows = res.data.values;
                if (!rows || rows.length === 0) {
                    return { items: [], total: 0, limit: 0, offset: 0 };
                }

                const headers = rows[0].map(h => h.toLowerCase().replace(/[\s\/_]/g, '').trim());
                const parsed = rows.slice(1).map((row, index) => {
                    const entry = {};
                    headers.forEach((h, i) => { entry[h] = row[i] !== undefined ? row[i] : ""; });
                    const getVal = (cols) => {
                        for (const col of cols) {
                            const cleanCol = String(col).toLowerCase().replace(/[\s\/_]/g, '').trim();
                            if (Object.prototype.hasOwnProperty.call(entry, cleanCol) && String(entry[cleanCol]).trim() !== '') {
                                return String(entry[cleanCol]).trim();
                            }
                        }
                        return "";
                    };

                    const shortUrl = getVal(['url', '링크']);
                    const status = getVal(['상태', 'status']);
                    const publishedAt = getVal(['발행시간', '발행시간', 'publish_time', 'time', '작업시간', '작업시간']);
                    const product = getVal(['상품', 'product']);
                    const logStr = getVal(['로그', 'log']);
                    const resolvedState = resolveShoppingSheetState({
                        instruction: getVal(['참고지시사항', '참고/지시사항', 'instruction', '지시사항']),
                        category: getVal(['category', '카테고리']),
                        postStatus: getVal(['poststatus', 'post_status', '발행옵션', '발행상태']),
                        scheduleDate: getVal(['scheduledate', 'schedule_date', '예약일시']),
                        options: getVal(['options', '옵션', 'extra_options'])
                    });

                    return {
                        rowIndex: index,
                        rowNumber: index + 2,
                        shortUrl: shortUrl || '',
                        status: status || '',
                        publishedAt: publishedAt || '',
                        product: product || '',
                        log: logStr || '',
                        instruction: resolvedState.instruction || '',
                        category: resolvedState.category || '',
                        postStatus: resolvedState.postStatus || 'publish',
                        scheduleDate: resolvedState.scheduleDate || '',
                        options: resolvedState.options
                    };
                });

                const statusFilter = String(options.status || '').trim();
                const q = String(options.q || '').trim().toLowerCase();
                let filtered = parsed;

                if (statusFilter) {
                    filtered = filtered.filter(item => String(item.status || '').trim() === statusFilter);
                }
                if (q) {
                    filtered = filtered.filter((item) => {
                        const haystack = [
                            item.product,
                            item.shortUrl,
                            item.status,
                            item.publishedAt,
                            item.log,
                            item.instruction
                        ].join(' ').toLowerCase();
                        return haystack.includes(q);
                    });
                }

                const sortBy = String(options.sortBy || 'rowNumber').trim();
                const sortDir = String(options.sortDir || 'desc').trim().toLowerCase() === 'desc' ? 'desc' : 'asc';
                const compareValues = (a, b) => {
                    const aNull = a === null || a === undefined || a === '';
                    const bNull = b === null || b === undefined || b === '';
                    if (aNull && bNull) return 0;
                    if (aNull) return 1;
                    if (bNull) return -1;
                    if (typeof a === 'number' && typeof b === 'number') return a - b;
                    return String(a).localeCompare(String(b), 'ko', { numeric: true, sensitivity: 'base' });
                };
                const getSortValue = (item) => {
                    if (sortBy === 'rowNumber') return Number(item.rowNumber || 0);
                    if (sortBy === 'product') return String(item.product || '');
                    if (sortBy === 'shortUrl') return String(item.shortUrl || '');
                    if (sortBy === 'runtimeLog') return String(item.log || '');
                    if (sortBy === 'status') return String(item.status || '');
                    if (sortBy === 'publishedAt') return String(item.publishedAt || '');
                    return Number(item.rowNumber || 0);
                };
                filtered = filtered
                    .map((item, index) => ({ item, index }))
                    .sort((a, b) => {
                        const cmp = compareValues(getSortValue(a.item), getSortValue(b.item));
                        if (cmp !== 0) return sortDir === 'desc' ? -cmp : cmp;
                        return a.index - b.index;
                    })
                    .map(v => v.item);

                const total = filtered.length;
                const limit = Number.isFinite(Number(options.limit)) ? Math.max(1, parseInt(options.limit, 10)) : 50;
                const offset = Number.isFinite(Number(options.offset)) ? Math.max(0, parseInt(options.offset, 10)) : 0;
                const items = filtered.slice(offset, offset + limit);

                return { items, total, limit, offset };
            } catch (e) {
                Logger.error(`❌ readGoogleSheetShoppingAll 오류: ${e.message}`);
                throw e;
            }
        });
    },

    /**
     * Shopping 시트 상태 업데이트 (개별 row)
     */
    updateGoogleSheetShoppingStatus: async function (rowIndex, status, updateTime = true, logMessage = null) {
        try {
            const accessToken = await this.getGoogleAccessToken();
            const sheetName = CONFIG.GOOGLE_SHOPPING_SHEET || 'shopping';
            const spreadsheetId = CONFIG.GOOGLE_SHEET_ID;

            const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:1`;
            const headerRes = await this.callWithRetry(() => axios.get(readUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } }));

            const headers = headerRes.data.values[0];
            let statusColIndex = -1;
            let timeColIndex = -1;
            let logColIndex = -1;

            headers.forEach((h, i) => {
                const clean = h.toLowerCase().replace(/[\s\/_]/g, '');
                if (clean.includes('상태') || clean.includes('status')) statusColIndex = i;
                else if (clean.includes('발행') || clean.includes('time') || clean.includes('date') || clean.includes('시간')) timeColIndex = i;
                else if (clean.includes('로그') || clean.includes('log')) logColIndex = i;
            });

            if (statusColIndex === -1) return;

            const targetRow = rowIndex + 2;
            const toA1 = (colIdx) => {
                let letter = '';
                let num = colIdx;
                while (num >= 0) {
                    letter = String.fromCharCode((num % 26) + 65) + letter;
                    num = Math.floor(num / 26) - 1;
                }
                return letter;
            };

            const dataToUpdate = [];
            dataToUpdate.push({ range: `${sheetName}!${toA1(statusColIndex)}${targetRow}`, values: [[status]] });
            if (updateTime && timeColIndex !== -1) {
                dataToUpdate.push({ range: `${sheetName}!${toA1(timeColIndex)}${targetRow}`, values: [[new Date().toLocaleString()]] });
            }
            if (logMessage !== null && logColIndex !== -1) {
                dataToUpdate.push({ range: `${sheetName}!${toA1(logColIndex)}${targetRow}`, values: [[String(logMessage)]] });
            }

            const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;
            await this.callWithRetry(() => axios.post(updateUrl, { valueInputOption: 'USER_ENTERED', data: dataToUpdate }, {
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
            }));

            await this.sleep(500);
        } catch (e) {
            Logger.error(`❌ 쇼핑 상태 업데이트 실패 (Row ${rowIndex}): ${e.message}`);
        }
    },

    /**
     * shopping 시트 편집 가능 필드 업데이트 (상품/URL/상태)
     */
    updateGoogleSheetShoppingEditableFields: async function (rowIndex, fields = {}) {
        try {
            const accessToken = await this.getGoogleAccessToken();
            const sheetName = CONFIG.GOOGLE_SHOPPING_SHEET || 'shopping';
            const spreadsheetId = CONFIG.GOOGLE_SHEET_ID;

            const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:1`;
            const headerRes = await this.callWithRetry(() => axios.get(readUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } }));

            const headers = headerRes.data.values[0];
            let urlColIndex = -1;
            let statusColIndex = -1;
            let productColIndex = -1;
            let instructionColIndex = -1;
            let categoryColIndex = -1;
            let postStatusColIndex = -1;
            let scheduleDateColIndex = -1;
            let optionsColIndex = -1;

            headers.forEach((h, i) => {
                const clean = String(h || '').toLowerCase().replace(/[\s\/_]/g, '');
                if ((clean.includes('category') || clean.includes('카테고리')) && categoryColIndex === -1) categoryColIndex = i;
                if ((clean.includes('poststatus') || clean.includes('발행옵션') || clean.includes('발행상태')) && postStatusColIndex === -1) postStatusColIndex = i;
                if ((clean.includes('scheduledate') || clean.includes('예약')) && scheduleDateColIndex === -1) scheduleDateColIndex = i;
                if ((clean.includes('url') || clean.includes('링크')) && urlColIndex === -1) urlColIndex = i;
                if ((clean.includes('상태') && !clean.includes('발행상태') && !clean.includes('poststatus') || clean.includes('status') && !clean.includes('poststatus')) && statusColIndex === -1) statusColIndex = i;
                if ((clean.includes('상품') || clean.includes('product')) && productColIndex === -1) productColIndex = i;
                if ((clean.includes('참고지시사항') || clean.includes('instruction') || clean.includes('지시사항')) && instructionColIndex === -1) instructionColIndex = i;
                if ((clean === 'options' || clean === '옵션') && optionsColIndex === -1) optionsColIndex = i;
            });

            const targetRow = rowIndex + 2;
            const toA1 = (colIdx) => {
                let letter = '';
                let num = colIdx;
                while (num >= 0) {
                    letter = String.fromCharCode((num % 26) + 65) + letter;
                    num = Math.floor(num / 26) - 1;
                }
                return letter;
            };

            const dataToUpdate = [];
            let existingOptionsRaw = '';
            if (optionsColIndex !== -1) {
                const rowReadUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!${targetRow}:${targetRow}`;
                const rowRes = await this.callWithRetry(() => axios.get(rowReadUrl, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                }));
                const rowValues = Array.isArray(rowRes?.data?.values?.[0]) ? rowRes.data.values[0] : [];
                existingOptionsRaw = rowValues[optionsColIndex] !== undefined ? rowValues[optionsColIndex] : '';
            }
            if (fields.category !== undefined && categoryColIndex !== -1) {
                dataToUpdate.push({
                    range: `${sheetName}!${toA1(categoryColIndex)}${targetRow}`,
                    values: [[String(fields.category || '').trim()]]
                });
            }
            if (fields.postStatus !== undefined && postStatusColIndex !== -1) {
                dataToUpdate.push({
                    range: `${sheetName}!${toA1(postStatusColIndex)}${targetRow}`,
                    values: [[String(fields.postStatus || '').trim()]]
                });
            }
            if (fields.scheduleDate !== undefined && scheduleDateColIndex !== -1) {
                dataToUpdate.push({
                    range: `${sheetName}!${toA1(scheduleDateColIndex)}${targetRow}`,
                    values: [[String(fields.scheduleDate || '').trim()]]
                });
            }
            if (fields.product !== undefined && productColIndex !== -1) {
                dataToUpdate.push({
                    range: `${sheetName}!${toA1(productColIndex)}${targetRow}`,
                    values: [[String(fields.product || '').trim()]]
                });
            }
            if (fields.instruction !== undefined && instructionColIndex !== -1) {
                dataToUpdate.push({
                    range: `${sheetName}!${toA1(instructionColIndex)}${targetRow}`,
                    values: [[String(fields.instruction || '').trim()]]
                });
            }
            if (fields.shortUrl !== undefined && urlColIndex !== -1) {
                dataToUpdate.push({
                    range: `${sheetName}!${toA1(urlColIndex)}${targetRow}`,
                    values: [[String(fields.shortUrl || '').trim()]]
                });
            }
            if (fields.status !== undefined && statusColIndex !== -1) {
                dataToUpdate.push({
                    range: `${sheetName}!${toA1(statusColIndex)}${targetRow}`,
                    values: [[String(fields.status || '').trim()]]
                });
            }
            if (optionsColIndex !== -1) {
                const syncedOptions = mergeShoppingSheetOptions(existingOptionsRaw, {
                    instruction: fields.instruction,
                    category: fields.category,
                    postStatus: fields.postStatus,
                    scheduleDate: fields.scheduleDate
                });
                dataToUpdate.push({
                    range: `${sheetName}!${toA1(optionsColIndex)}${targetRow}`,
                    values: [[stringifySheetOptionsValue(syncedOptions)]]
                });
            }

            if (dataToUpdate.length === 0) {
                throw new Error('shopping 시트 편집 가능한 컬럼을 찾지 못했습니다.');
            }

            const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;
            await this.callWithRetry(() => axios.post(updateUrl, {
                valueInputOption: 'USER_ENTERED',
                data: dataToUpdate
            }, {
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
            }));

            await this.sleep(300);
        } catch (e) {
            Logger.error(`❌ 쇼핑 editable 필드 업데이트 실패 (Row ${rowIndex}): ${e.message}`);
            throw e;
        }
    },

    /**
     * 1-1. 키워드 시트 읽기 ('연관검색어 조사' 상태만)
     */
    readGoogleSheetKeywords: async function (options = {}) {
        try {
            if (!options.silent) Logger.info("🌐 구글 키워드 시트 읽기 (Target: 연관검색어 조사)");
            const accessToken = await this.getGoogleAccessToken();

            const sheetName = CONFIG.GOOGLE_KEYWORDS_SHEET || 'keywords';
            const spreadsheetId = CONFIG.GOOGLE_SHEET_ID;
            const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}`;

            let res;
            try {
                res = await this.callWithRetry(() => axios.get(url, {
                    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
                }));
            } catch (e) {
                // 400 Bad Request => 시트가 없을 가능성이 높음 -> 시트 생성 시도
                if (e.response && (e.response.status === 400 || e.response.data?.error?.status === 'INVALID_ARGUMENT')) {
                    Logger.info(`✨ '${sheetName}' 시트가 없어서 새로 생성합니다...`);

                    // 시트 생성 (1행 고정) & ID 획득
                    const createUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
                    const res = await this.callWithRetry(() => axios.post(createUrl, {
                        requests: [{
                            addSheet: {
                                properties: {
                                    title: sheetName,
                                    gridProperties: { frozenRowCount: 1 } // 1행 고정
                                }
                            }
                        }]
                    }, { headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }));

                    const newSheetId = res.data.replies[0].addSheet.properties.sheetId;

                    // 데이터 유효성 검사 (Dropdown)
                    // (readGoogleSheetKeywords) Status: B열 (Index 1) -> 대기, 연관검색어 조사, 연관검색어 조사 완료
                    const validationReq = {
                        requests: [{
                            setDataValidation: {
                                range: { sheetId: newSheetId, startRowIndex: 1, startColumnIndex: 1, endColumnIndex: 2 },
                                rule: {
                                    condition: {
                                        type: 'ONE_OF_LIST',
                                        values: [
                                            { userEnteredValue: '대기' },
                                            { userEnteredValue: '연관검색어 조사' },
                                            { userEnteredValue: '연관검색어 조사 완료' }
                                        ]
                                    },
                                    showCustomUi: true, strict: true
                                }
                            }
                        }]
                    };
                    await this.callWithRetry(() => axios.post(createUrl, validationReq, { headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }));

                    // 헤더 추가: keyword, 동작 / 상태, 작업 시간
                    const headerRow = [['keyword', '동작 / 상태', '작업 시간']];
                    const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}:append?valueInputOption=USER_ENTERED`;
                    await this.callWithRetry(() => axios.post(appendUrl, { range: sheetName, majorDimension: 'ROWS', values: headerRow }, {
                        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
                    }));

                    Logger.info(`   ✅ 시트 생성 및 헤더 추가 완료`);
                    return []; // 빈 시트이므로 빈 배열 반환
                } else {
                    throw e;
                }
            }

            const rows = res.data.values;
            if (!rows || rows.length === 0) return [];

            const headers = rows[0].map(h => h.toLowerCase().replace(/[\s\/_]/g, '').trim());

            // 인덱스 찾기
            let kwIdx = -1, statusIdx = -1;
            headers.forEach((h, i) => {
                const clean = h.toLowerCase().replace(/[\s\/_]/g, '');
                if (clean.includes('키워드') || clean.includes('keyword')) kwIdx = i;
                else if (clean.includes('상태') || clean.includes('status') || clean.includes('동작')) statusIdx = i;
            });

            if (kwIdx === -1 || statusIdx === -1) {
                Logger.error("❌ 키워드 시트 헤더를 찾을 수 없습니다. (키워드, 상태 필수)");
                return [];
            }

            const targets = [];
            rows.slice(1).forEach((row, index) => {
                const status = row[statusIdx] ? row[statusIdx].trim() : "";
                if (status === '연관검색어 조사') {
                    targets.push({
                        rowIndex: index, // 0-based index relative to data rows
                        keyword: row[kwIdx],
                        status: status
                    });
                }
            });

            return targets;

        } catch (e) {
            if (CONFIG.CONFIG_IS_ESSENTIAL_SET) {
                Logger.error(`❌ 키워드 시트 읽기 실패: ${e.message}`);
            }
            return [];
        }
    },

    /**
     * 1-2. 키워드 시트 상태 업데이트 (개별 row)
     */
    updateGoogleSheetKeywordStatus: async function (rowIndex, status) {
        try {
            const accessToken = await this.getGoogleAccessToken();
            const sheetName = CONFIG.GOOGLE_KEYWORDS_SHEET || 'keywords';
            const spreadsheetId = CONFIG.GOOGLE_SHEET_ID;

            // 헤더 찾기 (상태 컬럼 위치 확인용)
            const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:1`;
            const headerRes = await this.callWithRetry(() => axios.get(readUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } }));

            const headers = headerRes.data.values[0];
            let statusColIndex = -1, timeColIndex = -1;

            headers.forEach((h, i) => {
                const clean = h.toLowerCase().replace(/[\s\/_]/g, '');
                if (clean.includes('상태') || clean.includes('status') || clean.includes('동작')) statusColIndex = i;
                else if (clean.includes('시간') || clean.includes('time') || clean.includes('date') || clean.includes('작업')) timeColIndex = i;
            });

            if (statusColIndex === -1) return;

            const targetRow = rowIndex + 2; // Header(1) + 0-based index(1)
            const toA1 = (colIdx) => {
                let letter = '';
                let num = colIdx;
                while (num >= 0) {
                    letter = String.fromCharCode((num % 26) + 65) + letter;
                    num = Math.floor(num / 26) - 1;
                }
                return letter;
            };

            const dataToUpdate = [];
            dataToUpdate.push({ range: `${sheetName}!${toA1(statusColIndex)}${targetRow}`, values: [[status]] });
            if (timeColIndex !== -1) dataToUpdate.push({ range: `${sheetName}!${toA1(timeColIndex)}${targetRow}`, values: [[new Date().toLocaleString()]] });

            const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;
            await this.callWithRetry(() => axios.post(updateUrl, { valueInputOption: 'USER_ENTERED', data: dataToUpdate }, {
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
            }));

            // ⏳ 사용자 요청: API 호출 간 안전한 대기 시간 추가
            await this.sleep(500);

        } catch (e) {
            Logger.error(`❌ 키워드 상태 업데이트 실패 (Row ${rowIndex}): ${e.message}`);
        }
    },

    /**
     * 1-3. 토픽 시트에 새로운 행 추가 (Append)
     */
    appendGoogleSheetTopics: async function (newTopics, options = {}) {
        if (!newTopics || newTopics.length === 0) return;

        try {
            const accessToken = await this.getGoogleAccessToken();
            const sheetName = CONFIG.GOOGLE_TOPICS_SHEET || 'topics';
            const spreadsheetId = CONFIG.GOOGLE_SHEET_ID;

            // 순서: 주제, 키워드, 참고지시사항, 참고URL, 상태, 이미지생성, 이미지개수, 로그, 발행시간
            // (헤더 순서를 모르므로, 일반적인 순서로 값을 준비하고 append)
            // *중요*: 사용자의 헤더 순서와 맞지 않을 수 있지만, append endpoint는 컬럼 매핑 기능이 없음.
            // 따라서 3.0버전부터는 헤더를 읽어서 순서대로 정렬하는 로직 필요하나, 현재는 약속된 순서(또는 주요 컬럼만)로 추가 시도.
            // 여기서는 헤더를 먼저 읽어서 매핑하는 방식을 사용.

            const headerReadUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:1`;
            const headerRes = await this.callWithRetry(() => axios.get(headerReadUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } }));
            let headers = Array.isArray(headerRes?.data?.values?.[0]) ? headerRes.data.values[0] : [];
            const map = {};
            headers.forEach((h, i) => {
                const clean = h.toLowerCase().replace(/[\s\/_]/g, '');

                // 1. Specialized Metadata (Prioritize these to avoid overlap)
                if (clean.includes('category') || clean.includes('카테고리')) map.category = i;
                else if (clean.includes('poststatus') || clean.includes('발행옵션')) map.postStatus = i;
                else if (clean.includes('scheduledate') || clean.includes('예약일시')) map.scheduleDate = i;

                // 2. Core Fields
                else if (clean.includes('주제') || clean.includes('subject')) map.subject = i;
                else if (clean.includes('키워드') || clean.includes('keyword')) map.keyword = i;
                else if (clean.includes('참고지시사항') || clean.includes('instruction') || clean.includes('지시사항')) map.instruction = i;
                else if (clean.includes('외부참고') || clean.includes('extref') || clean.includes('external')) map.extRef = i;
                else if (clean.includes('참고url') || clean.includes('referenceurl') || clean === 'url') map.url = i;
                else if (clean.includes('상태') || clean.includes('status')) map.status = i;
                else if (clean.includes('이미지개수') || clean.includes('imagecount')) map.imgCount = i;
                else if (clean.includes('이미지생성') || clean.includes('gen')) map.imgGen = i;
                else if (clean.includes('추가일시') || clean.includes('addedat') || clean.includes('createdat')) map.addedAt = i;
                else if (clean === '소스' || clean.includes('source')) map.source = i;
                else if (clean.includes('트렌드일자') || clean.includes('trenddate')) map.trendDate = i;
                else if (clean === 'options' || clean === '옵션') map.options = i;
            });

            const missingHeaderLabels = [];
            if (map.addedAt === undefined) missingHeaderLabels.push('추가일시');
            if (map.source === undefined) missingHeaderLabels.push('소스');
            if (map.trendDate === undefined) missingHeaderLabels.push('트렌드일자');
            if (missingHeaderLabels.length > 0) {
                const nextHeaders = headers.slice();
                for (const label of missingHeaderLabels) {
                    nextHeaders.push(label);
                }
                const updateHeaderUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:1?valueInputOption=USER_ENTERED`;
                await this.callWithRetry(() => axios.put(updateHeaderUrl, {
                    range: `${sheetName}!1:1`,
                    majorDimension: 'ROWS',
                    values: [nextHeaders]
                }, {
                    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
                }));
                headers = nextHeaders;
                headers.forEach((h, i) => {
                    const clean = String(h || '').toLowerCase().replace(/[\s\/_]/g, '');

                    // Priority matching
                    if (clean.includes('category') || clean.includes('카테고리')) map.category = i;
                    else if (clean.includes('poststatus') || clean.includes('발행옵션')) map.postStatus = i;
                    else if (clean.includes('scheduledate') || clean.includes('예약일시')) map.scheduleDate = i;
                    else if (clean.includes('추가일시') || clean.includes('addedat') || clean.includes('createdat')) map.addedAt = i;
                    else if (clean === '소스' || clean.includes('source')) map.source = i;
                    else if (clean.includes('트렌드일자') || clean.includes('trenddate')) map.trendDate = i;
                });
            }

            // 헤더가 없거나 매핑이 안되면 기본값 사용 (최소 필수 필드들)
            if (map.subject === undefined) map.subject = 1;
            if (map.keyword === undefined) map.keyword = 2;

            const maxCol = Math.max(...Object.values(map));
            const defaultStatus = String(options.defaultStatus || '대기').trim() || '대기';
            const rowsToAdd = newTopics.map(topic => {
                const row = new Array(maxCol + 1).fill("");
                const keywordValue = Array.isArray(topic.keywords) ? topic.keywords.join(', ') : String(topic.keywords || '');
                const instructionValue = String(
                    topic.content_guide?.additional_instructions ||
                    topic.additional_instructions ||
                    topic.instruction ||
                    ''
                ).trim();
                const referenceUrlValue = Array.isArray(topic.content_guide?.reference_urls)
                    ? topic.content_guide.reference_urls.join(', ')
                    : (
                        Array.isArray(topic.reference_urls)
                            ? topic.reference_urls.join(', ')
                            : String(topic.reference_urls || topic.reference_url || '')
                    );
                const imageGenerate = (typeof topic.image_options?.generate === 'boolean')
                    ? topic.image_options.generate
                    : (
                        typeof topic.image_generation === 'boolean'
                            ? topic.image_generation
                            : (
                                typeof topic.options?.image_gen === 'boolean'
                                    ? topic.options.image_gen
                                    : false
                            )
                    );
                const sourceValue = String(
                    topic.source
                    || topic.topic_source
                    || topic.added_source
                    || options.source
                    || 'manual'
                ).trim();
                const trendDateValue = String(
                    topic.trendDate
                    || topic.trend_date
                    || options.trendDate
                    || ''
                ).trim();
                const addedAtValue = String(
                    topic.addedAt
                    || topic.added_at
                    || options.addedAt
                    || this.formatKstDateTime()
                ).trim();
                const externalReference = (typeof topic.use_external_ref === 'boolean')
                    ? topic.use_external_ref
                    : (
                        typeof topic.external_reference === 'boolean'
                            ? topic.external_reference
                            : (
                                typeof topic.options?.external_reference === 'boolean'
                                    ? topic.options.external_reference
                                    : true
                            )
                    );
                const rowStatus = String(topic.status || defaultStatus).trim() || defaultStatus;
                const rowCategory = topic.wp_category || topic.category || '';
                const rowPostStatus = topic.postStatus || topic.post_status || '';
                const rowScheduleDate = topic.scheduleDate || topic.schedule_date || '';
                const syncedOptions = mergeTopicSheetOptions(topic.options, {
                    subject: topic.subject,
                    keywords: Array.isArray(topic.keywords) ? topic.keywords : keywordValue,
                    instruction: instructionValue,
                    referenceUrls: Array.isArray(topic.content_guide?.reference_urls)
                        ? topic.content_guide.reference_urls
                        : (
                            Array.isArray(topic.reference_urls)
                                ? topic.reference_urls
                                : referenceUrlValue
                        ),
                    category: rowCategory,
                    postStatus: rowPostStatus,
                    scheduleDate: rowScheduleDate,
                    imageGeneration: imageGenerate,
                    imageCount: topic.image_options?.count ?? topic.image_count ?? topic.options?.image_count,
                    externalReference,
                    writingStrategy: topic.writing_strategy || topic.writingStrategy || topic.options?.writing_strategy,
                    platforms: topic.platforms || topic.targets || topic.options?.platforms
                });

                if (map.subject !== undefined) row[map.subject] = topic.subject;
                if (map.keyword !== undefined) row[map.keyword] = keywordValue;
                if (map.instruction !== undefined) row[map.instruction] = instructionValue;
                if (map.extRef !== undefined) row[map.extRef] = externalReference ? 'Yes' : 'No';
                if (map.url !== undefined) row[map.url] = referenceUrlValue || '';
                if (map.status !== undefined) row[map.status] = rowStatus;
                if (map.imgGen !== undefined) row[map.imgGen] = imageGenerate ? 'Yes' : 'No';
                if (map.imgCount !== undefined) {
                    const imageCount = topic.image_options?.count ?? topic.image_count ?? topic.options?.image_count;
                    row[map.imgCount] = imageCount === undefined || imageCount === null ? '' : imageCount;
                }
                if (map.addedAt !== undefined) row[map.addedAt] = addedAtValue;
                if (map.source !== undefined) row[map.source] = sourceValue;
                if (map.trendDate !== undefined) row[map.trendDate] = trendDateValue;
                if (map.options !== undefined) row[map.options] = stringifySheetOptionsValue(syncedOptions);

                // WP 전용 필드들
                if (map.category !== undefined) row[map.category] = rowCategory;
                if (map.postStatus !== undefined) row[map.postStatus] = rowPostStatus || syncedOptions.post_status || '';
                if (map.scheduleDate !== undefined) row[map.scheduleDate] = rowScheduleDate;

                return row;
            });

            const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}:append?valueInputOption=USER_ENTERED`;
            const appendRes = await this.callWithRetry(() => axios.post(appendUrl, { range: sheetName, majorDimension: 'ROWS', values: rowsToAdd }, {
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
            }));

            const updatedRange = appendRes?.data?.updates?.updatedRange || '';
            let rowNumbers = [];
            if (updatedRange) {
                // 예: topics!A12:J14
                const right = String(updatedRange).split('!')[1] || '';
                const m = right.match(/[A-Z]+(\d+):[A-Z]+(\d+)/i) || right.match(/[A-Z]+(\d+)/i);
                if (m) {
                    const startRow = parseInt(m[1], 10);
                    const endRow = m[2] ? parseInt(m[2], 10) : startRow;
                    if (!Number.isNaN(startRow) && !Number.isNaN(endRow)) {
                        for (let r = startRow; r <= endRow; r++) rowNumbers.push(r);
                    }
                }
            }
            if (rowNumbers.length === 0) {
                // 업데이트 범위를 못 읽은 경우 fallback (행 번호 미제공)
                rowNumbers = [];
            }
            const rowIndices = rowNumbers.map((rowNum) => rowNum - 2).filter((idx) => idx >= 0);

            // 연속 작업의 기존 안전 간격은 유지하되, 단건 UI 저장처럼 후속
            // Sheets 호출이 없는 경로는 명시적으로 생략할 수 있다.
            const postAppendDelayMs = options.postAppendDelayMs === undefined
                ? 1000
                : Math.max(0, Math.min(60000, Number(options.postAppendDelayMs) || 0));
            if (postAppendDelayMs > 0) {
                await this.sleep(postAppendDelayMs);
            }
            this.clearSheetCache('topics_all');

            // [Universal Memory] Kuzu DB에 토픽 기록
            for (const topic of newTopics) {
                try {
                    const instructionValue = String(
                        topic.instruction ||
                        topic.options?.instruction ||
                        topic.content_guide?.additional_instructions ||
                        topic.additional_instructions ||
                        ''
                    ).trim();
                    const kuzuData = {
                        subject: topic.subject || '',
                        platform: Array.isArray(topic.platforms) ? topic.platforms.join(', ') : (topic.options?.platforms ? topic.options.platforms.join(', ') : 'naver'),
                        category: topic.category || topic.options?.category || '',
                        keywords: Array.isArray(topic.keywords) ? topic.keywords.join(', ') : String(topic.keywords || ''),
                        instruction: instructionValue,
                        source: topic.source || options.source || 'manual'
                    };
                    await getAgentEventStore().recordTopic(
                        topic.chatId || options.chatId || null,
                        kuzuData,
                        topic.memory_provenance || options.memoryProvenance || {}
                    );
                } catch (kuzuErr) {
                    Logger.error(`⚠️ [Utils] Kuzu 토픽 기록 실패: ${kuzuErr.message}`);
                }
            }

            Logger.info(`   ✅ 토픽 시트에 ${rowsToAdd.length}건 추가 완료`);
            return {
                success: true,
                addedCount: rowsToAdd.length,
                rowNumbers,
                rowIndices
            };

        } catch (e) {
            Logger.error(`❌ 토픽 추가 실패: ${e.message}`);
            return {
                success: false,
                message: e.message
            };
        }
    },

    /**
     * 1-6. 트렌드 시트에 데이터 추가 (Date, Category, Keyword, Status)
     */
    appendGoogleSheetTrends: async function (trendData, dateOverride = null) {
        if (!trendData || trendData.length === 0) {
            return { success: true, addedCount: 0, skippedExisting: 0, skippedInBatch: 0 };
        }

        try {
            const accessToken = await this.getGoogleAccessToken();
            // 기본값 'trends', 설정 없으면 'trends'
            const sheetName = CONFIG.GOOGLE_TRENDS_SHEET || 'trends';
            const spreadsheetId = CONFIG.GOOGLE_SHEET_ID;

            // 1. 헤더 확인 및 매핑
            let headers = [];

            try {
                const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:1`;
                const headerRes = await this.callWithRetry(() => axios.get(readUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } }));
                headers = headerRes.data.values ? headerRes.data.values[0] : [];
            } catch (e) {
                // 400 Bad Request => 시트가 없을 가능성이 높음 -> 시트 생성 시도
                if (e.response && (e.response.status === 400 || e.response.data?.error?.status === 'INVALID_ARGUMENT')) {
                    Logger.info(`✨ '${sheetName}' 시트가 없어서 새로 생성합니다...`);

                    // 시트 생성 (1행 고정) & ID 획득
                    const createUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
                    const res = await this.callWithRetry(() => axios.post(createUrl, {
                        requests: [{
                            addSheet: {
                                properties: {
                                    title: sheetName,
                                    gridProperties: { frozenRowCount: 1 } // 1행 고정
                                }
                            }
                        }]
                    }, { headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }));

                    const newSheetId = res.data.replies[0].addSheet.properties.sheetId;

                    // 데이터 유효성 검사 (Dropdown)
                    // (appendGoogleSheetTrends) Status: E열 (Index 4) -> 대기, 키워드 목록에 추가
                    const validationReq = {
                        requests: [{
                            setDataValidation: {
                                range: { sheetId: newSheetId, startRowIndex: 1, startColumnIndex: 4, endColumnIndex: 5 },
                                rule: {
                                    condition: {
                                        type: 'ONE_OF_LIST',
                                        values: [
                                            { userEnteredValue: '대기' },
                                            { userEnteredValue: '키워드 목록에 추가' },
                                            { userEnteredValue: '키워드 목록 추가 완료' },
                                            { userEnteredValue: '연관검색어 조사' },
                                            { userEnteredValue: '연관검색어 조사 완료' }
                                        ]
                                    },
                                    showCustomUi: true, strict: true
                                }
                            }
                        }]
                    };
                    await this.callWithRetry(() => axios.post(createUrl, validationReq, { headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }));

                    // 헤더 추가
                    const headerRow = [['날짜', '주제', '키워드', '증감', '동작/상태']];
                    const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}:append?valueInputOption=USER_ENTERED`;
                    await this.callWithRetry(() => axios.post(appendUrl, { range: sheetName, majorDimension: 'ROWS', values: headerRow }, {
                        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
                    }));

                    headers = headerRow[0];
                    Logger.info(`   ✅ 시트 생성 및 헤더 추가 완료`);
                } else {
                    throw e; // 다른 에러는 throw
                }
            }

            const map = {};

            // 헤더가 비어있다면(새 시트), 기본 헤더를 먼저 써주는게 좋겠지만 복잡도를 낮추기 위해
            // 기존에 헤더가 있다고 가정하고 매핑 시도. 만약 헤더가 없으면 A,B,C,D 순서로 간주.

            if (headers.length > 0) {
                headers.forEach((h, i) => {
                    const clean = h.toLowerCase().replace(/[\s\/_]/g, '');
                    if (clean.includes('날짜') || clean.includes('date')) map.date = i;
                    else if (clean.includes('주제') || clean.includes('subject') || clean.includes('category')) map.category = i;
                    else if (clean.includes('키워드') || clean.includes('keyword')) map.keyword = i;
                    else if (clean.includes('증감') || clean.includes('변동') || clean.includes('variation') || clean.includes('rank')) map.variation = i;
                    else if (clean.includes('동작') || clean.includes('상태') || clean.includes('status')) map.status = i;
                });
            } else {
                // 헤더가 없으면 기본 매핑 (A=Date, B=Category, C=Keyword, D=Variation, E=Status)
                map.date = 0;
                map.category = 1;
                map.keyword = 2;
                map.variation = 3;
                map.status = 4;
            }

            const maxCol = Math.max(...Object.values(map));
            const today = new Date();
            const defaultDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            const dateStr = (typeof dateOverride === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateOverride))
                ? dateOverride
                : defaultDateStr;
            const normalizeDate = (raw) => {
                const text = String(raw || '').trim();
                if (!text) return '';
                const compact = text.match(/^(\d{4})(\d{2})(\d{2})$/);
                if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
                const dashed = text.match(/^(\d{4})[.\-/\s]+(\d{1,2})[.\-/\s]+(\d{1,2})$/);
                if (dashed) {
                    const y = dashed[1];
                    const m = String(parseInt(dashed[2], 10)).padStart(2, '0');
                    const d = String(parseInt(dashed[3], 10)).padStart(2, '0');
                    return `${y}-${m}-${d}`;
                }
                return text;
            };
            const trendKey = (dateVal, categoryVal, keywordVal) =>
                `${normalizeDate(dateVal).toLowerCase()}|${String(categoryVal || '').trim().toLowerCase()}|${String(keywordVal || '').trim().toLowerCase()}`;

            // 기존 데이터 기준 dedupe 세트 구축 (date+category+keyword)
            const existingRowsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}`;
            const existingRowsRes = await this.callWithRetry(() => axios.get(existingRowsUrl, {
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
            }));
            const existingRows = Array.isArray(existingRowsRes?.data?.values) ? existingRowsRes.data.values : [];
            const existingKeySet = new Set();
            if (existingRows.length > 1) {
                for (let i = 1; i < existingRows.length; i++) {
                    const row = existingRows[i] || [];
                    const rowDate = map.date !== undefined ? row[map.date] : '';
                    const rowCategory = map.category !== undefined ? row[map.category] : '';
                    const rowKeyword = map.keyword !== undefined ? row[map.keyword] : '';
                    const key = trendKey(rowDate, rowCategory, rowKeyword);
                    if (key && !key.startsWith('||')) existingKeySet.add(key);
                }
            }

            const inBatchKeySet = new Set();
            const rowsToAdd = [];
            let skippedExisting = 0;
            let skippedInBatch = 0;
            for (const item of trendData) {
                const category = String(item?.category || '').trim();
                const keyword = String(item?.keyword || '').trim();
                if (!category || !keyword) continue;
                const key = trendKey(dateStr, category, keyword);
                if (existingKeySet.has(key)) {
                    skippedExisting += 1;
                    continue;
                }
                if (inBatchKeySet.has(key)) {
                    skippedInBatch += 1;
                    continue;
                }
                inBatchKeySet.add(key);

                const row = new Array(maxCol + 1).fill("");
                if (map.date !== undefined) row[map.date] = dateStr;
                if (map.category !== undefined) row[map.category] = category;
                if (map.keyword !== undefined) row[map.keyword] = keyword;
                if (map.variation !== undefined) row[map.variation] = item.variation || '-';
                if (map.status !== undefined) row[map.status] = '대기';
                rowsToAdd.push(row);
            }

            if (rowsToAdd.length === 0) {
                Logger.info(`   ℹ️ 트렌드 시트(${sheetName}) 중복 검사 결과 신규 추가할 데이터가 없습니다. (기존중복 ${skippedExisting}건, 배치중복 ${skippedInBatch}건)`);
                return {
                    success: true,
                    addedCount: 0,
                    date: dateStr,
                    skippedExisting,
                    skippedInBatch
                };
            }

            const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}:append?valueInputOption=USER_ENTERED`;

            await this.callWithRetry(() => axios.post(appendUrl, { range: sheetName, majorDimension: 'ROWS', values: rowsToAdd }, {
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
            }));

            // ⏳ API 호출 간 안전 대기
            await this.sleep(1000);

            Logger.info(`   ✅ 트렌드 시트(${sheetName})에 ${rowsToAdd.length}건 추가 완료 (기존중복 ${skippedExisting}건, 배치중복 ${skippedInBatch}건 제외)`);
            return {
                success: true,
                addedCount: rowsToAdd.length,
                date: dateStr,
                skippedExisting,
                skippedInBatch
            };

        } catch (e) {
            // Trends 시트가 없는 경우 400 에러(Unable to parse range)가 발생할 수 있음 (미사용 시 무시)
            if (e.response?.status !== 400 && !String(e.message).includes('Unable to parse range')) {
                Logger.debug(`⚠️ trends 시트 읽기 실패: ${e.message}`);
            }
            return [];
        }
    },

    readGoogleSheetTrendsAll: async function (options = {}) {
        try {
            const accessToken = await this.getGoogleAccessToken();
            const sheetName = CONFIG.GOOGLE_TRENDS_SHEET || 'trends';
            const spreadsheetId = CONFIG.GOOGLE_SHEET_ID;
            const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}`;

            const res = await this.callWithRetry(() => axios.get(url, {
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
            }));
            const rows = res.data.values;
            if (!rows || rows.length === 0) {
                return { items: [], total: 0, limit: 0, offset: 0 };
            }

            const headers = rows[0].map(h => String(h || '').toLowerCase().replace(/[\s\/_]/g, '').trim());
            const parsed = rows.slice(1).map((row, index) => {
                const entry = {};
                headers.forEach((h, i) => { entry[h] = row[i] !== undefined ? row[i] : ""; });
                const getVal = (cols) => {
                    for (const col of cols) {
                        const cleanCol = String(col || '').toLowerCase().replace(/[\s\/_]/g, '').trim();
                        if (Object.prototype.hasOwnProperty.call(entry, cleanCol) && String(entry[cleanCol]).trim() !== '') {
                            return String(entry[cleanCol]).trim();
                        }
                    }
                    return "";
                };

                return {
                    rowIndex: index,
                    rowNumber: index + 2,
                    date: getVal(['날짜', 'date']),
                    category: getVal(['주제', 'category', 'subject']),
                    keyword: getVal(['키워드', 'keyword']),
                    variation: getVal(['증감', 'variation', 'rank']),
                    status: getVal(['동작상태', '동작/상태', '상태', 'status'])
                };
            });

            const statusFilter = String(options.status || '').trim();
            const q = String(options.q || '').trim().toLowerCase();
            let filtered = parsed;
            if (statusFilter) {
                filtered = filtered.filter(item => String(item.status || '').trim() === statusFilter);
            }
            if (q) {
                filtered = filtered.filter(item => {
                    const haystack = [
                        item.date,
                        item.category,
                        item.keyword,
                        item.variation,
                        item.status
                    ].join(' ').toLowerCase();
                    return haystack.includes(q);
                });
            }

            const sortBy = String(options.sortBy || 'rowNumber').trim();
            const sortDir = String(options.sortDir || 'desc').trim().toLowerCase() === 'desc' ? 'desc' : 'asc';
            const compareValues = (a, b) => {
                const aNull = a === null || a === undefined || a === '';
                const bNull = b === null || b === undefined || b === '';
                if (aNull && bNull) return 0;
                if (aNull) return 1;
                if (bNull) return -1;
                if (typeof a === 'number' && typeof b === 'number') return a - b;
                return String(a).localeCompare(String(b), 'ko', { numeric: true, sensitivity: 'base' });
            };
            const parseVariationValue = (raw) => {
                const text = String(raw || '').trim();
                if (!text) return 0;
                if (text.includes('▲')) {
                    const num = parseInt(text.replace(/[^\d-]/g, ''), 10);
                    return Number.isNaN(num) ? 0 : Math.abs(num);
                }
                if (text.includes('▼')) {
                    const num = parseInt(text.replace(/[^\d-]/g, ''), 10);
                    return Number.isNaN(num) ? 0 : -Math.abs(num);
                }
                const plain = parseInt(text.replace(/[^\d-]/g, ''), 10);
                return Number.isNaN(plain) ? 0 : plain;
            };
            const getSortValue = (item) => {
                if (sortBy === 'rowNumber') return Number(item.rowNumber || 0);
                if (sortBy === 'date') return String(item.date || '');
                if (sortBy === 'category') return String(item.category || '');
                if (sortBy === 'keyword') return String(item.keyword || '');
                if (sortBy === 'variation') return parseVariationValue(item.variation);
                if (sortBy === 'status') return String(item.status || '');
                return Number(item.rowNumber || 0);
            };
            filtered = filtered
                .map((item, index) => ({ item, index }))
                .sort((a, b) => {
                    const cmp = compareValues(getSortValue(a.item), getSortValue(b.item));
                    if (cmp !== 0) return sortDir === 'desc' ? -cmp : cmp;
                    return a.index - b.index;
                })
                .map(v => v.item);

            const total = filtered.length;
            const limit = Number.isFinite(Number(options.limit)) ? Math.max(1, parseInt(options.limit, 10)) : 100;
            const offset = Number.isFinite(Number(options.offset)) ? Math.max(0, parseInt(options.offset, 10)) : 0;
            const items = filtered.slice(offset, offset + limit);
            return { items, total, limit, offset };
        } catch (e) {
            //Trends 시트가 없는 경우 400 에러(Unable to parse range)가 발생할 수 있음
            //사용자가 트렌드 기능을 사용하지 않는 경우이므로 에러 로그 대신 디버그 로그로 처리
            if (e.response?.status === 400 || String(e.message).includes('Unable to parse range')) {
                Logger.debug(`[GoogleSheet] trends 시트 읽기 건너뜐 (미사용 혹은 시트 없음)`);
            } else {
                Logger.warn(`⚠️ trends 시트 조회 실패 (미사용 시 무시 가능): ${e.message}`);
            }
            return { items: [], total: 0, limit: 0, offset: 0 };
        }
    },

    readGoogleSheetKeywordsAll: async function (options = {}) {
        try {
            const accessToken = await this.getGoogleAccessToken();
            const sheetName = CONFIG.GOOGLE_KEYWORDS_SHEET || 'keywords';
            const spreadsheetId = CONFIG.GOOGLE_SHEET_ID;
            const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}`;

            const res = await this.callWithRetry(() => axios.get(url, {
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
            }));
            const rows = res.data.values;
            if (!rows || rows.length === 0) {
                return { items: [], total: 0, limit: 0, offset: 0 };
            }

            const headers = rows[0].map(h => String(h || '').toLowerCase().replace(/[\s\/_]/g, '').trim());
            const parsed = rows.slice(1).map((row, index) => {
                const entry = {};
                headers.forEach((h, i) => { entry[h] = row[i] !== undefined ? row[i] : ""; });
                const getVal = (cols) => {
                    for (const col of cols) {
                        const cleanCol = String(col || '').toLowerCase().replace(/[\s\/_]/g, '').trim();
                        if (Object.prototype.hasOwnProperty.call(entry, cleanCol) && String(entry[cleanCol]).trim() !== '') {
                            return String(entry[cleanCol]).trim();
                        }
                    }
                    return "";
                };

                return {
                    rowIndex: index,
                    rowNumber: index + 2,
                    keyword: getVal(['키워드', 'keyword']),
                    status: getVal(['동작상태', '동작/상태', '상태', 'status']),
                    updatedAt: getVal(['작업시간', '작업 시간', '시간', 'time', 'date'])
                };
            });

            const statusFilter = String(options.status || '').trim();
            const q = String(options.q || '').trim().toLowerCase();
            let filtered = parsed;
            if (statusFilter) {
                filtered = filtered.filter(item => String(item.status || '').trim() === statusFilter);
            }
            if (q) {
                filtered = filtered.filter(item => {
                    const haystack = [
                        item.keyword,
                        item.status,
                        item.updatedAt
                    ].join(' ').toLowerCase();
                    return haystack.includes(q);
                });
            }

            const total = filtered.length;
            const limit = Number.isFinite(Number(options.limit)) ? Math.max(1, parseInt(options.limit, 10)) : 100;
            const offset = Number.isFinite(Number(options.offset)) ? Math.max(0, parseInt(options.offset, 10)) : 0;
            const items = filtered.slice(offset, offset + limit);
            return { items, total, limit, offset };
        } catch (e) {
            Logger.error(`❌ keywords 전체 조회 실패: ${e.message}`);
            return { items: [], total: 0, limit: 0, offset: 0 };
        }
    },

    updateGoogleSheetTrendStatus: async function (rowIndex, status) {
        try {
            const accessToken = await this.getGoogleAccessToken();
            const sheetName = CONFIG.GOOGLE_TRENDS_SHEET || 'trends';
            const spreadsheetId = CONFIG.GOOGLE_SHEET_ID;

            const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:1`;
            const headerRes = await this.callWithRetry(() => axios.get(readUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } }));
            const headers = (headerRes.data.values && headerRes.data.values[0]) ? headerRes.data.values[0] : [];

            let statusColIndex = -1;
            headers.forEach((h, i) => {
                const clean = String(h || '').toLowerCase().replace(/[\s\/_]/g, '');
                if (clean.includes('동작상태') || clean.includes('동작') || clean.includes('상태') || clean.includes('status')) statusColIndex = i;
            });
            if (statusColIndex === -1) return;

            const targetRow = rowIndex + 2;
            const toA1 = (colIdx) => {
                let letter = '';
                let num = colIdx;
                while (num >= 0) {
                    letter = String.fromCharCode((num % 26) + 65) + letter;
                    num = Math.floor(num / 26) - 1;
                }
                return letter;
            };

            const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;
            await this.callWithRetry(() => axios.post(updateUrl, {
                valueInputOption: 'USER_ENTERED',
                data: [{ range: `${sheetName}!${toA1(statusColIndex)}${targetRow}`, values: [[status]] }]
            }, {
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
            }));
            await this.sleep(300);
        } catch (e) {
            Logger.error(`❌ 트렌드 상태 업데이트 실패 (Row ${rowIndex}): ${e.message}`);
        }
    },

    updateGoogleSheetTrendStatusBulk: async function (rowIndices = [], status) {
        try {
            const uniqueRows = Array.from(
                new Set(
                    (Array.isArray(rowIndices) ? rowIndices : [])
                        .map((v) => parseInt(v, 10))
                        .filter((v) => Number.isInteger(v) && v >= 0)
                )
            );
            if (uniqueRows.length === 0) return { success: true, updatedCount: 0 };

            const accessToken = await this.getGoogleAccessToken();
            const sheetName = CONFIG.GOOGLE_TRENDS_SHEET || 'trends';
            const spreadsheetId = CONFIG.GOOGLE_SHEET_ID;

            const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:1`;
            const headerRes = await this.callWithRetry(() => axios.get(readUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } }));
            const headers = (headerRes.data.values && headerRes.data.values[0]) ? headerRes.data.values[0] : [];

            let statusColIndex = -1;
            headers.forEach((h, i) => {
                const clean = String(h || '').toLowerCase().replace(/[\s\/_]/g, '');
                if (clean.includes('동작상태') || clean.includes('동작') || clean.includes('상태') || clean.includes('status')) statusColIndex = i;
            });
            if (statusColIndex === -1) return { success: false, updatedCount: 0, message: '상태 컬럼을 찾지 못했습니다.' };

            const toA1 = (colIdx) => {
                let letter = '';
                let num = colIdx;
                while (num >= 0) {
                    letter = String.fromCharCode((num % 26) + 65) + letter;
                    num = Math.floor(num / 26) - 1;
                }
                return letter;
            };

            const data = uniqueRows.map((rowIndex) => {
                const targetRow = rowIndex + 2;
                return {
                    range: `${sheetName}!${toA1(statusColIndex)}${targetRow}`,
                    values: [[status]]
                };
            });

            const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;
            await this.callWithRetry(() => axios.post(updateUrl, {
                valueInputOption: 'USER_ENTERED',
                data
            }, {
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
            }));

            return { success: true, updatedCount: uniqueRows.length };
        } catch (e) {
            Logger.error(`❌ 트렌드 상태 일괄 업데이트 실패: ${e.message}`);
            return { success: false, updatedCount: 0, message: e.message };
        }
    },

    /**
     * 1-3-1. 네이버 블로그 URL 모바일 변환 헬퍼 (스크래핑 성능 최적화)
     */
    convertToMobileNaverBlogUrl: function (url) {
        if (!url) return url;
        try {
            const trimmed = String(url).trim();
            if (!trimmed.includes('blog.naver.com')) return trimmed;

            // 이미 m.blog.naver.com 이면 통과
            if (trimmed.includes('m.blog.naver.com')) return trimmed;

            // PC URL 패턴 (blog.naver.com/id/logNo) -> (m.blog.naver.com/id/logNo)
            // http/https 모두 대응
            let converted = trimmed
                .replace(/^http:\/\/blog\.naver\.com/i, 'https://m.blog.naver.com')
                .replace(/^https:\/\/blog\.naver\.com/i, 'https://m.blog.naver.com');

            // 쿼리 파라미터가 있는 경우 (PostView.naver?blogId=... 등)
            // 사실 m.blog.naver.com 은 쿼리 파라미터 방식도 어느 정도 지원하지만, 
            // 가급적 경로 기반 주소인 경우가 스크래퍼에 유리함.
            return converted;
        } catch (e) {
            return url;
        }
    },

    /**
     * 1-4. 네이버 연관검색어 추출
     */
    fetchNaverRelatedKeywords: async function (keyword) {
        try {
            const url = `https://ac.search.naver.com/nx/ac?q=${encodeURIComponent(keyword)}&st=1000&frm=nv&ans=1`;
            const res = await axios.get(url);

            // items 배열 추출
            const items = res.data?.items?.[0];
            if (!items || !Array.isArray(items)) return [];

            // items는 [[keyword, ...], [keyword, ...]] 형태
            const keywords = items.map(item => item[0]);
            return keywords;

        } catch (e) {
            Logger.warn(`⚠️ 연관검색어 추출 실패 (${keyword}): ${e.message}`);
            return [];
        }
    },

    /**
     * 1-5. 네이버 블로그 검색 (참고 URL 수집)
     */
    fetchNaverBlogSearchResults: async function (keyword) {
        await RuntimeConfig.ensureNaverSearchCredentials();
        if (!CONFIG.NAVER_CLIENT_ID || !CONFIG.NAVER_CLIENT_SECRET) {
            Logger.warn("⚠️ 네이버 검색 API 서버 설정이 없어 블로그 검색을 건너뜁니다.");
            return [];
        }

        try {
            const url = `https://openapi.naver.com/v1/search/blog.json`;
            const res = await axios.get(url, {
                headers: {
                    'X-Naver-Client-Id': CONFIG.NAVER_CLIENT_ID,
                    'X-Naver-Client-Secret': CONFIG.NAVER_CLIENT_SECRET
                },
                params: {
                    query: keyword,
                    display: 5,
                    sort: 'sim' // 정확도순
                }
            });

            if (res.data && res.data.items) {
                // postdate 기준 내림차순 정렬 (최신순)
                const items = res.data.items.sort((a, b) => Number(b.postdate) - Number(a.postdate));

                // 가장 최신 글 1개의 링크만 리턴
                if (items.length > 0) {
                    let link = items[0].link;
                    return this.convertToMobileNaverBlogUrl(link);
                }
            }
            return "";

        } catch (e) {
            Logger.warn(`⚠️ 블로그 검색 API 실패 (${keyword}): ${e.message}`);
            return "";
        }
    },

    /**
     * 1-5-1. 네이버 블로그 인기글 상위 N개 URL 수집 (최신순)
     * - 외부 참고 여부가 Yes인 경우 batch 실행 시 호출
     * - 모든 로그는 DEBUG 레벨에서만 출력
     */
    fetchNaverBlogTopPosts: async function (keyword, count) {
        const Constants = require('./constants');
        const blogCount = count || Constants.REFERENCE_BLOG_COUNT || 3;

        await RuntimeConfig.ensureNaverSearchCredentials();
        if (!CONFIG.NAVER_CLIENT_ID || !CONFIG.NAVER_CLIENT_SECRET) {
            Logger.debug('🔍 [외부 참고] 네이버 검색 API 서버 설정이 없어 인기글 수집을 건너뜁니다.');
            return [];
        }

        try {
            const url = `https://openapi.naver.com/v1/search/blog.json`;
            const res = await axios.get(url, {
                headers: {
                    'X-Naver-Client-Id': CONFIG.NAVER_CLIENT_ID,
                    'X-Naver-Client-Secret': CONFIG.NAVER_CLIENT_SECRET
                },
                params: {
                    query: keyword,
                    display: Math.max(blogCount * 2, 10), // 여유를 두고 많이 가져와서 필터링
                    sort: 'sim' // 정확도순
                }
            });

            if (res.data && res.data.items && res.data.items.length > 0) {
                // postdate 기준 내림차순 정렬 (최신순)
                const sorted = res.data.items.sort((a, b) => Number(b.postdate) - Number(a.postdate));

                // 상위 N개만 선택 후 모바일 URL 변환
                const topPosts = sorted.slice(0, blogCount).map(item => {
                    return {
                        title: (item.title || '').replace(/<[^>]*>/g, ''), // HTML 태그 제거
                        link: this.convertToMobileNaverBlogUrl(item.link),
                        postdate: item.postdate || ''
                    };
                });

                Logger.debug(`🔍 [외부 참고] '${keyword}' 인기글 ${topPosts.length}개 수집 완료`);
                return topPosts;
            }

            Logger.debug(`🔍 [외부 참고] '${keyword}' 검색 결과 없음`);
            return [];

        } catch (e) {
            Logger.debug(`🔍 [외부 참고] 인기글 수집 실패 (${keyword}): ${e.message}`);
            return [];
        }
    },

    _resolveOwnBlogId: function () {
        const configured = String(CONFIG.NAVER_ID || '').trim();
        if (configured && !configured.includes('본인의_네이버_아이디')) return configured;

        const writeUrl = String(CONFIG.WRITE_URL || '').trim();
        if (!writeUrl) return '';
        try {
            const parsed = new URL(writeUrl);
            const chunks = parsed.pathname.split('/').filter(Boolean);
            return chunks[0] || '';
        } catch (e) {
            return '';
        }
    },

    _normalizeNaverBlogPostUrl: function (rawUrl, blogId = '') {
        const href = String(rawUrl || '').trim();
        if (!href) return '';

        try {
            const parsed = new URL(href, 'https://blog.naver.com');
            const host = parsed.hostname.toLowerCase();
            const pathChunks = parsed.pathname.split('/').filter(Boolean);

            if (parsed.pathname.includes('/PostView.naver')) {
                const id = parsed.searchParams.get('blogId') || blogId;
                const logNo = parsed.searchParams.get('logNo');
                if (id && logNo && /^\d{6,}$/.test(String(logNo))) {
                    return `https://blog.naver.com/${id}/${logNo}`;
                }
            }

            if ((host === 'blog.naver.com' || host === 'm.blog.naver.com') && pathChunks.length >= 2) {
                const id = pathChunks[0];
                const logNo = pathChunks[1];
                if (id && /^\d{6,}$/.test(String(logNo))) {
                    return `https://blog.naver.com/${id}/${logNo}`;
                }
            }
            return '';
        } catch (e) {
            return '';
        }
    },

    toMobileNaverBlogPostUrl: function (rawUrl) {
        const originalUrl = String(rawUrl || '').trim();
        if (!originalUrl) return '';

        const canonicalUrl = this._normalizeNaverBlogPostUrl(originalUrl);
        if (!canonicalUrl) return originalUrl;

        try {
            const parsed = new URL(canonicalUrl);
            const [blogId, logNo] = parsed.pathname.split('/').filter(Boolean);
            if (!blogId || !logNo) return originalUrl;
            return `https://m.blog.naver.com/${blogId}/${logNo}`;
        } catch (e) {
            return originalUrl;
        }
    },

    _shuffleArray: function (list) {
        const arr = Array.isArray(list) ? [...list] : [];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    },

    pickRelatedPostsHeading: function () {
        const headings = [
            '함께 보면 좋은 글',
            '같이 보면 좋은 글',
            '이어서 보면 좋은 글',
            '추천 포스팅',
            '관련 글 더 보기',
            '다른 글도 확인해 보세요'
        ];
        return headings[Math.floor(Math.random() * headings.length)];
    },

    fetchWordPressRandomPosts: async function (wpUrl, count = 3) {
        if (!wpUrl) return [];
        const targetCount = Math.max(1, Math.min(10, parseInt(count, 10) || 3));

        // WP RSS URL can be /feed or /?feed=rss2
        const rssUrl = wpUrl.replace(/\/$/, '') + '/feed';
        const collected = [];

        try {
            const cheerio = require('cheerio');
            const axios = require('axios');
            const rssRes = await this.runWithHeartbeat(
                'WP 관련 글 RSS 수집',
                () => axios.get(rssUrl, {
                    timeout: 10000,
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    validateStatus: () => true
                })
            );

            if (rssRes.status >= 200 && rssRes.status < 300 && typeof rssRes.data === 'string') {
                const $ = cheerio.load(rssRes.data, { xmlMode: true });
                $('item').each((_, el) => {
                    const title = $(el).find('title').first().text().trim();
                    const link = $(el).find('link').first().text().trim();
                    if (title && link) {
                        collected.push({ title, url: link, source: 'wordpress' });
                    }
                });
            }
        } catch (e) {
            Logger.debug(`🔎 [WP 관련글] RSS 수집 실패: ${e.message}`);
        }

        return this._shuffleArray(collected).slice(0, targetCount);
    },

    generateRelatedPostsMarkdown: function (posts) {
        if (!Array.isArray(posts) || posts.length === 0) return '';

        const heading = this.pickRelatedPostsHeading();
        let markdown = `\n\n## ${heading}\n\n`;

        posts.forEach(post => {
            const postUrl = this.toMobileNaverBlogPostUrl(post.url);
            markdown += `* [${post.title}](${postUrl})\n`;
        });

        return markdown;
    },

    fetchOwnBlogRelatedPosts: async function (context = {}, count = 3) {
        const targetCount = Math.max(1, Math.min(10, parseInt(count, 10) || 3));
        const blogId = this._resolveOwnBlogId();
        if (!blogId) return [];

        const collected = [];
        const seen = new Set();
        const addPost = (title, link, extra = {}) => {
            const cleanTitle = String(title || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
            const cleanLink = this._normalizeNaverBlogPostUrl(link, blogId);
            if (!cleanTitle || !cleanLink || seen.has(cleanLink)) return;
            seen.add(cleanLink);
            collected.push({
                title: cleanTitle,
                url: cleanLink,
                description: String(extra.description || extra.summary || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
                publishedAt: String(extra.publishedAt || extra.pubDate || '').trim()
            });
        };

        // 1) RSS 우선 수집
        try {
            const cheerio = require('cheerio');
            const rssUrl = `https://rss.blog.naver.com/${encodeURIComponent(blogId)}.xml`;
            const rssRes = await this.runWithHeartbeat(
                '관련 글 RSS 수집',
                () => axios.get(rssUrl, {
                    timeout: 10000,
                    maxRedirects: 3,
                    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/rss+xml, application/xml, text/xml, */*' },
                    validateStatus: () => true
                })
            );
            if (rssRes.status >= 200 && rssRes.status < 300 && typeof rssRes.data === 'string') {
                const $ = cheerio.load(rssRes.data, { xmlMode: true, decodeEntities: true });
                $('item').each((_, el) => {
                    const title = $(el).find('title').first().text();
                    const link = $(el).find('link').first().text();
                    const description = $(el).find('description').first().text();
                    const publishedAt = $(el).find('pubDate').first().text();
                    addPost(title, link, { description, publishedAt });
                });
            }
        } catch (e) {
            Logger.debug(`🔎 [관련글] RSS 수집 실패: ${e.message}`);
        }

        // 2) RSS가 부족하면 목록 페이지에서 보강
        if (collected.length < targetCount) {
            try {
                const cheerio = require('cheerio');
                const listUrl = `https://blog.naver.com/PostList.naver?blogId=${encodeURIComponent(blogId)}&from=postList&categoryNo=0&currentPage=1`;
                const listRes = await this.runWithHeartbeat(
                    '관련 글 목록 페이지 수집',
                    () => axios.get(listUrl, {
                        timeout: 12000,
                        maxRedirects: 3,
                        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html,application/xhtml+xml' },
                        validateStatus: () => true
                    })
                );
                if (listRes.status >= 200 && listRes.status < 300 && typeof listRes.data === 'string') {
                    const $ = cheerio.load(listRes.data);
                    $('a[href]').each((_, el) => {
                        const link = $(el).attr('href') || '';
                        const title = $(el).text() || '';
                        if (String(title).trim().length < 6) return;
                        if (/카테고리|메뉴|태그|이웃|프로필|공지|로그인/.test(String(title))) return;
                        addPost(title, link);
                    });
                }
            } catch (e) {
                Logger.debug(`🔎 [관련글] HTML 수집 실패: ${e.message}`);
            }
        }

        const selection = selectRelatedPosts(
            collected,
            buildRelatedPostContext(context),
            targetCount,
            { shuffle: (items) => this._shuffleArray(items) }
        );

        Logger.info(`🔎 [관련글] 후보 ${selection.totalCandidates}건 중 연관 선택 ${selection.heuristicCount}건, 랜덤 보강 ${selection.fallbackCount}건`);
        return selection.posts;
    },

    fetchOwnBlogRandomPosts: async function (count = 3) {
        return this.fetchOwnBlogRelatedPosts({}, count);
    },

    /**
     * 🌐 RSS/Atom 피드 수집 및 파싱
     */
    fetchAndParseRss: async function (url) {
        if (!url) return [];
        try {
            const res = await this.runWithHeartbeat(
                `RSS 수집 (${url})`,
                () => axios.get(url, {
                    timeout: 10000,
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    validateStatus: () => true
                })
            );

            if (res.status >= 200 && res.status < 300 && typeof res.data === 'string') {
                return parseFeedXml(res.data, { feedUrl: url });
            }
        } catch (e) {
            Logger.warn(`⚠️ RSS 수집 실패 (${url}): ${e.message}`);
        }
        return [];
    },

    /**
     * 2. 구글 시트 상태 업데이트
     * 🔧 [Fixed] 재시도 로직 추가 및 백업 로깅
     */
    /**
     * 2. 구글 시트 상태 업데이트
     * 🔧 [Refactored] callWithRetry 사용 및 백업 로깅 유지
     */
    updateGoogleSheetStatus: async function (rowIndex, status, logMessage) {
        try {
            const accessToken = await this.getGoogleAccessToken();
            const sheetName = CONFIG.GOOGLE_TOPICS_SHEET || 'topics';
            const spreadsheetId = CONFIG.GOOGLE_SHEET_ID;
            const cacheKey = `${spreadsheetId}_${sheetName}_headers`;
            const now = Date.now();

            let map = null;
            // 🔗 1분 이내 캐시된 헤더 매핑이 있으면 사용
            if (this._headerCache[cacheKey] && (now - this._headerCache[cacheKey].timestamp < 60000)) {
                map = this._headerCache[cacheKey].map;
            }

            if (!map) {
                // 헤더 읽기 (캐시 없거나 만료됨)
                const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:1`;
                const headerRes = await this.callWithRetry(() => axios.get(readUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } }));

                const headers = headerRes.data.values[0];
                map = { status: -1, log: -1, time: -1 };

                headers.forEach((h, i) => {
                    const clean = h.toLowerCase().replace(/[\s\/_]/g, '');
                    if (clean.includes('상태') || clean.includes('status')) map.status = i;
                    else if (clean.includes('로그') || clean.includes('log')) map.log = i;
                    else if (clean.includes('발행') || clean.includes('time')) map.time = i;
                });

                // 캐시 업데이트
                this._headerCache[cacheKey] = { map, timestamp: now };
            }

            const targetRow = rowIndex + 2;
            const toA1 = (colIdx) => {
                let letter = '';
                let num = colIdx;
                while (num >= 0) {
                    letter = String.fromCharCode((num % 26) + 65) + letter;
                    num = Math.floor(num / 26) - 1;
                    if (num < 0) break;
                }
                return letter;
            };

            const dataToUpdate = [];
            if (map.status !== -1) dataToUpdate.push({ range: `${sheetName}!${toA1(map.status)}${targetRow}`, values: [[status]] });
            if (map.log !== -1) dataToUpdate.push({ range: `${sheetName}!${toA1(map.log)}${targetRow}`, values: [[logMessage]] });
            if (map.time !== -1) dataToUpdate.push({ range: `${sheetName}!${toA1(map.time)}${targetRow}`, values: [[new Date().toLocaleString()]] });

            if (dataToUpdate.length === 0) return;

            const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;
            await this.callWithRetry(() => axios.post(updateUrl, { valueInputOption: 'USER_ENTERED', data: dataToUpdate }, {
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
            }));

            // ⏳ API 호출 간 안전 대기 (헤더 읽기를 건너뛰므로 요청 간격이 좁아질 수 있음)
            await this.sleep(300);

        } catch (e) {
            Logger.error(`❌ 구글 시트 업데이트 최종 실패 (Row ${rowIndex + 1}): ${e.message}`);
            // 🔧 [Backup] 로컬 파일에 백업 기록
            const backupLog = `${new Date().toISOString()} | Row ${rowIndex + 1} | ${status} | ${logMessage}\n`;
            try {
                fs.appendFileSync('failed_updates.log', backupLog);
                Logger.warn(`   💾 백업 로그에 기록됨: failed_updates.log`);
            } catch (fileErr) {
                Logger.error(`   ❌ 백업 로그 기록 실패: ${fileErr.message}`);
            }
        }
    },

    /**
     * UI 편집용: topics 시트에서 수정 가능한 필드만 업데이트
     * - subject, keywords, 참고/지시사항, 참고 URL, 상태, 이미지 생성 여부, 외부 참고 여부
     */
    updateGoogleSheetTopicEditableFields: async function (rowIndex, fields = {}) {
        const safeRowIndex = parseInt(rowIndex, 10);
        if (Number.isNaN(safeRowIndex) || safeRowIndex < 0) {
            throw new Error('rowIndex는 0 이상의 정수여야 합니다.');
        }

        const toYesNo = (value) => (value ? 'Yes' : 'No');
        const normalized = {
            category: String(fields.category || '').trim(),
            postStatus: String(fields.postStatus || '').trim(),
            scheduleDate: String(fields.scheduleDate || '').trim(),
            subject: String(fields.subject || '').trim(),
            keywords: Array.isArray(fields.keywords)
                ? fields.keywords.map(v => String(v || '').trim()).filter(Boolean).join(', ')
                : String(fields.keywords || '').trim(),
            instruction: String(fields.instruction || '').trim(),
            referenceUrl: Array.isArray(fields.referenceUrl)
                ? fields.referenceUrl.map(v => String(v || '').trim()).filter(Boolean).join(', ')
                : String(fields.referenceUrl || '').trim(),
            status: String(fields.status || '').trim(),
            imageGeneration: toYesNo(Boolean(fields.imageGeneration)),
            externalReference: toYesNo(Boolean(fields.externalReference)),
            writingStrategy: String(fields.writingStrategy || '').trim()
        };

        if (!normalized.subject) {
            throw new Error('Subject는 비워둘 수 없습니다.');
        }

        const accessToken = await this.getGoogleAccessToken();
        const sheetName = CONFIG.GOOGLE_TOPICS_SHEET || 'topics';
        const spreadsheetId = CONFIG.GOOGLE_SHEET_ID;

        const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:1`;
        const headerRes = await this.callWithRetry(() => axios.get(readUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        }));
        const headers = (headerRes.data.values && headerRes.data.values[0]) ? headerRes.data.values[0] : [];

        const map = {};
        headers.forEach((h, i) => {
            const clean = String(h || '').toLowerCase().replace(/[\s\/_]/g, '');
            if (clean === 'category' || clean === '카테고리') map.category = i;
            else if (
                clean === 'poststatus'
                || clean === 'post_status'
                || clean === '발행옵션'
            ) map.postStatus = i;
            else if (clean === 'scheduledate' || clean === 'schedule_date' || clean === '예약일시') map.scheduleDate = i;
            else if (clean.includes('주제') || clean.includes('subject')) map.subject = i;
            else if (clean.includes('키워드') || clean.includes('keyword')) map.keyword = i;
            else if (clean.includes('참고지시사항') || clean.includes('instruction') || clean.includes('지시사항')) map.instruction = i;
            else if (clean.includes('참고url') || clean.includes('referenceurl') || clean === 'url') map.url = i;
            else if (clean.includes('상태') || clean.includes('status')) map.status = i;
            else if (clean.includes('이미지생성') || clean.includes('imagegen') || clean.includes('imggen')) map.imgGen = i;
            else if (clean.includes('외부참고') || clean.includes('external') || clean.includes('extref')) map.extRef = i;
            else if (clean === 'options' || clean === '옵션') map.options = i;
        });

        if (map.subject === undefined) map.subject = 1;
        if (map.keyword === undefined) map.keyword = 2;

        const targetRow = safeRowIndex + 2;
        const toA1 = (colIdx) => {
            let letter = '';
            let num = colIdx;
            while (num >= 0) {
                letter = String.fromCharCode((num % 26) + 65) + letter;
                num = Math.floor(num / 26) - 1;
            }
            return letter;
        };

        const dataToUpdate = [];
        let existingOptionsRaw = '';
        if (map.options !== undefined) {
            const rowReadUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!${targetRow}:${targetRow}`;
            const rowRes = await this.callWithRetry(() => axios.get(rowReadUrl, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            }));
            const rowValues = Array.isArray(rowRes?.data?.values?.[0]) ? rowRes.data.values[0] : [];
            existingOptionsRaw = rowValues[map.options] !== undefined ? rowValues[map.options] : '';
        }
        if (map.category !== undefined) dataToUpdate.push({ range: `${sheetName}!${toA1(map.category)}${targetRow}`, values: [[normalized.category]] });
        if (map.postStatus !== undefined) dataToUpdate.push({ range: `${sheetName}!${toA1(map.postStatus)}${targetRow}`, values: [[normalized.postStatus]] });
        if (map.scheduleDate !== undefined) dataToUpdate.push({ range: `${sheetName}!${toA1(map.scheduleDate)}${targetRow}`, values: [[normalized.scheduleDate]] });
        if (map.subject !== undefined) dataToUpdate.push({ range: `${sheetName}!${toA1(map.subject)}${targetRow}`, values: [[normalized.subject]] });
        if (map.keyword !== undefined) dataToUpdate.push({ range: `${sheetName}!${toA1(map.keyword)}${targetRow}`, values: [[normalized.keywords]] });
        if (map.instruction !== undefined) dataToUpdate.push({ range: `${sheetName}!${toA1(map.instruction)}${targetRow}`, values: [[normalized.instruction]] });
        if (map.url !== undefined) dataToUpdate.push({ range: `${sheetName}!${toA1(map.url)}${targetRow}`, values: [[normalized.referenceUrl]] });
        if (map.status !== undefined) dataToUpdate.push({ range: `${sheetName}!${toA1(map.status)}${targetRow}`, values: [[normalized.status]] });
        if (map.imgGen !== undefined) dataToUpdate.push({ range: `${sheetName}!${toA1(map.imgGen)}${targetRow}`, values: [[normalized.imageGeneration]] });
        if (map.extRef !== undefined) dataToUpdate.push({ range: `${sheetName}!${toA1(map.extRef)}${targetRow}`, values: [[normalized.externalReference]] });
        if (map.options !== undefined) {
            const syncedOptions = mergeTopicSheetOptions(existingOptionsRaw, {
                subject: normalized.subject,
                keywords: normalized.keywords,
                instruction: normalized.instruction,
                referenceUrls: normalized.referenceUrl,
                category: normalized.category,
                postStatus: normalized.postStatus,
                scheduleDate: normalized.scheduleDate,
                imageGeneration: normalized.imageGeneration === 'Yes',
                externalReference: normalized.externalReference === 'Yes',
                writingStrategy: normalized.writingStrategy
            });
            dataToUpdate.push({
                range: `${sheetName}!${toA1(map.options)}${targetRow}`,
                values: [[stringifySheetOptionsValue(syncedOptions)]]
            });
        }

        if (dataToUpdate.length === 0) {
            throw new Error('수정 가능한 컬럼을 찾지 못했습니다.');
        }

        const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;
        await this.callWithRetry(() => axios.post(updateUrl, {
            valueInputOption: 'USER_ENTERED',
            data: dataToUpdate
        }, {
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
        }));
        await this.sleep(300);
    },

    /**
     * 3. 엑셀 읽기 (기존 유지 + 필터 수정)
     */
    // 3. (Deleted) Excel Support Removed
    // readExcelTopics & updateExcelStatus functions were removed.

    fetchReferenceContent: async function (url) {
        if (!url) return "";
        Logger.debug(`🌐 [참고자료 Fetch] 요청 시작: ${url}`);
        Logger.debug(`🌐 [Scraping] 접속 시도: ${url}`);
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
                },
                timeout: CONFIG.SCRAPING_TIMEOUT || 20000,
                maxRedirects: 5
            });
            const extracted = extractReferenceContentFromHtml(response.data, url);
            if (!extracted.text) {
                Logger.debug(`⚠️ [참고자료 Fetch] 본문 추출 결과 비어 있음: ${url}`);
                return "";
            }
            Logger.debug(
                `✅ [참고자료 Fetch] 완료: ${url} (제목: ${extracted.title || '없음'}, 본문 길이: ${extracted.bodyLength}자, 선택영역: ${extracted.selector})`
            );
            Logger.debug(`   ✅ 스크래핑 성공 (길이: ${extracted.text.length}자)`);
            return extracted.text;
        } catch (e) {
            Logger.debug(`⚠️ [참고자료 Fetch] 실패: ${url} (${e.message})`);
            Logger.debug(`⚠️ 스크래핑 실패 (${url}): ${e.message}`);
            return "";
        }
    },

    // 🔧 [Fixed] Gemini API 재시도 로직 추가 (지수 백오프)
    callGeminiText: async function (prompt, retries = 3, options = {}) {
        const apiKey = String(options?.apiKey || '').trim();
        if (!apiKey) throw new Error('API Key 누락');
        const usageLabel = String(options?.usageLabel || 'Gemini Text API').trim() || 'Gemini Text API';
        const maxTokens = Number.isFinite(Number(options?.maxTokens)) ? Math.max(32, parseInt(options.maxTokens, 10)) : null;
        const temperature = Number.isFinite(Number(options?.temperature)) ? Number(options.temperature) : null;
        const responseMimeType = String(options?.responseMimeType || '').trim();
        const responseJsonSchema = options?.responseJsonSchema && typeof options.responseJsonSchema === 'object'
            ? options.responseJsonSchema
            : null;
        const modelCode = String(options?.modelCode || '').trim();
        const thinkingConfig = resolveGeminiThinkingConfig(
            modelCode,
            options?.reasoningEffort,
            options?.modelCapabilities
        );
        const endpoint = resolveGeminiTextEndpoint(CONFIG.GEMINI_TEXT_ENDPOINT, modelCode);
        const logStart = options?.logStart !== false;

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                if (logStart) Logger.info(`🧠 [${usageLabel}] Gemini 호출 중... (시도 ${attempt}/${retries})`);
                const response = await this.runWithHeartbeat(
                    `(시도 ${attempt})`,
                    () => {
                        const body = { contents: [{ parts: [{ text: prompt }] }] };
                        if (maxTokens || temperature !== null || responseMimeType || responseJsonSchema || thinkingConfig) {
                            body.generationConfig = {};
                            if (maxTokens) body.generationConfig.maxOutputTokens = maxTokens;
                            if (temperature !== null) body.generationConfig.temperature = temperature;
                            if (responseMimeType) body.generationConfig.responseMimeType = responseMimeType;
                            if (responseJsonSchema) body.generationConfig.responseJsonSchema = responseJsonSchema;
                            if (thinkingConfig) body.generationConfig.thinkingConfig = thinkingConfig;
                        }
                        return axios.post(`${endpoint}?key=${apiKey}`,
                        body,
                        { headers: { 'Content-Type': 'application/json' }, timeout: 120000 }
                    );
                    }
                );
                const candidate = response.data?.candidates?.[0];
                if (options?.logTokenUsage === true && response.data?.usageMetadata) {
                    const usage = response.data.usageMetadata;
                    Logger.info(`📊 [${usageLabel}] 토큰 사용량: prompt=${Number(usage.promptTokenCount || 0)}, output=${Number(usage.candidatesTokenCount || 0)}, thoughts=${Number(usage.thoughtsTokenCount || 0)}, total=${Number(usage.totalTokenCount || 0)}`);
                }
                if (String(candidate?.finishReason || '').toUpperCase() === 'MAX_TOKENS') {
                    Logger.warn(`⚠️ [${usageLabel}] Gemini 응답이 최대 출력 토큰에서 중단되었습니다.`);
                }
                const text = extractGeminiText(response.data);
                if (!text) throw new Error('Empty response from Gemini');
                return text;
            } catch (e) {
                const readableError = formatAiRemoteErrorMessage(e);
                const retryDecision = resolveAiRetryDecision(e, attempt);
                Logger.warn(`⚠️ [${usageLabel}] Gemini 호출 실패 (시도 ${attempt}/${retries}): ${readableError}`);

                if (attempt === retries || !retryDecision.retryable) {
                    Logger.error(`❌ [${usageLabel}] Gemini 호출 중단`);
                    if (retryDecision.isRateLimited) {
                        const rateLimitError = new Error('AI 공급자의 요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.');
                        rateLimitError.code = 'AI_RATE_LIMITED';
                        rateLimitError.status = 429;
                        throw rateLimitError;
                    }
                    throw new Error(`${usageLabel} 호출에 실패했습니다: ${readableError}`);
                }

                const waitTime = retryDecision.delayMs;
                Logger.info(`   ⏳ ${waitTime / 1000}초 후 재시도...`);
                if (typeof options?.onRetry === 'function') {
                    try {
                        await options.onRetry({
                            attempt,
                            retries,
                            delayMs: waitTime,
                            isRateLimited: retryDecision.isRateLimited,
                            status: Number(e?.response?.status || 0),
                            message: readableError
                        });
                    } catch (callbackError) {
                        Logger.debug(`🛠️ [${usageLabel}] 재시도 상태 콜백 실패: ${callbackError.message}`);
                    }
                }
                await this.sleep(waitTime);
            }
        }
    },

    callTextModelByMode: async function (mode, prompt, retries = 3, options = {}) {
        const normalizedMode = String(mode || 'default').trim().toLowerCase();
        if (normalizedMode === 'custom' || normalizedMode === 'chat') {
            return this.callChatText(prompt, retries, options);
        }
        return this.callWritingText(prompt, retries, options);
    },

    callOpenAiCompatibleTextByConfig: async function (modelConfig = {}, prompt, retries = 3, options = {}) {
        const usageLabel = String(options?.usageLabel || 'Writing Text Model').trim() || 'Writing Text Model';
        const baseUrl = normalizeOpenAiCompatibleBaseUrl(modelConfig.base_url);
        const model = String(modelConfig.code || '').trim();
        const apiKey = String(modelConfig.api_key || '').trim();
        const logStart = options?.logStart !== false;

        if (!baseUrl || !model) throw new Error(`${usageLabel} 설정에 Base URL과 Model Code가 필요합니다.`);

        const headers = { 'Content-Type': 'application/json' };
        if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                if (logStart) Logger.info(`🧠 [${usageLabel}] OpenAI-compatible 호출 중... (시도 ${attempt}/${retries})`);
                const response = await this.runWithHeartbeat(
                    `(시도 ${attempt})`,
                    () => {
                        const runtimeDefinition = getModelRuntimeDefinition('text', modelConfig);
                        const request = runtimeDefinition.transport === 'kie_responses'
                            ? buildKieResponsesRequest(modelConfig, prompt, options)
                            : buildOpenAiChatRequest(modelConfig, prompt, options);
                        const { definition, body } = request;
                        const endpoint = definition.transport === 'kie_responses'
                            ? KIE_RESPONSES_ENDPOINT
                            : (definition.transport === 'kie_openai_chat'
                                ? getKieOpenAiChatEndpoint(model)
                                : `${baseUrl}/chat/completions`);
                        return axios.post(endpoint, body, {
                            headers,
                            timeout: 120000
                        });
                    }
                );
                const definition = getModelRuntimeDefinition('text', modelConfig);
                const text = definition.transport === 'kie_responses'
                    ? extractKieResponsesText(response.data)
                    : (definition.transport === 'kie_openai_chat'
                        ? extractKieOpenAiChatContent(response.data)
                        : extractOpenAIChatContent(response.data));
                if (!text) throw new Error('Empty response from OpenAI-compatible chat model');
                return text;
            } catch (e) {
                const readableError = formatAiRemoteErrorMessage(e);
                const retryDecision = resolveAiRetryDecision(e, attempt);
                Logger.warn(`⚠️ [${usageLabel}] 호출 실패 (시도 ${attempt}/${retries}): ${readableError}`);
                if (attempt === retries || !retryDecision.retryable) {
                    Logger.error(`❌ [${usageLabel}] 호출 중단`);
                    if (retryDecision.isRateLimited) {
                        const rateLimitError = new Error('AI 공급자의 요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.');
                        rateLimitError.code = 'AI_RATE_LIMITED';
                        rateLimitError.status = 429;
                        throw rateLimitError;
                    }
                    throw new Error(`${usageLabel} 호출에 실패했습니다: ${readableError}`);
                }
                const waitTime = retryDecision.delayMs;
                Logger.info(`   ⏳ ${waitTime / 1000}초 후 재시도...`);
                if (typeof options?.onRetry === 'function') {
                    try {
                        await options.onRetry({
                            attempt,
                            retries,
                            delayMs: waitTime,
                            isRateLimited: retryDecision.isRateLimited,
                            status: Number(e?.response?.status || 0),
                            message: readableError
                        });
                    } catch (callbackError) {
                        Logger.debug(`🛠️ [${usageLabel}] 재시도 상태 콜백 실패: ${callbackError.message}`);
                    }
                }
                await this.sleep(waitTime);
            }
        }
    },

    callTextByConfig: async function (modelConfig = {}, prompt, retries = 3, options = {}) {
        const provider = String(modelConfig.provider || '').trim().toLowerCase();
        const runtimePolicy = applyTextRuntimePolicy(modelConfig, options);
        const transport = runtimePolicy.definition.transport;
        const usageLabel = String(options?.usageLabel || modelConfig.name || '텍스트 모델').trim();
        const modelName = String(modelConfig.name || '').trim() || String(modelConfig.code || '').trim() || '알 수 없는 모델';
        const modelCode = String(modelConfig.code || '').trim();
        Logger.info(`🤖 [${usageLabel}] 텍스트 모델: ${modelName}${modelCode ? ` (${modelCode})` : ''} / provider=${provider || 'unknown'} / transport=${transport || 'unknown'}`);
        if (runtimePolicy.definition.status === 'unavailable') {
            throw new Error(`${modelName} 모델은 현재 사용할 수 없습니다. 설정에서 다른 모델을 선택해 주세요.`);
        }
        if (transport === 'gemini_generate_content') {
            return this.callGeminiText(prompt, retries, {
                ...runtimePolicy.options,
                usageLabel,
                apiKey: String(modelConfig.api_key || '').trim(),
                modelCode,
                modelCapabilities: runtimePolicy.definition.capabilities
            });
        }
        return this.callOpenAiCompatibleTextByConfig(modelConfig, prompt, retries, {
            ...runtimePolicy.options,
            usageLabel
        });
    },

    callWritingText: async function (prompt, retries = 3, options = {}) {
        return this.callTextByConfig(CONFIG.TEXT_MODEL_CONFIG || {}, prompt, retries, {
            ...options,
            usageLabel: String(options?.usageLabel || '글쓰기 텍스트 모델').trim()
        });
    },

    callChatText: async function (prompt, retries = 3, options = {}) {
        return this.callTextByConfig(CONFIG.CHAT_MODEL_CONFIG || CONFIG.TEXT_MODEL_CONFIG || {}, prompt, retries, {
            ...options,
            usageLabel: String(options?.usageLabel || 'Chat Model').trim()
        });
    },

    callTelegramChatModel: async function (prompt, retries = 3) {
        return this.callChatText(prompt, retries, {
            usageLabel: 'Telegram Chat Model'
        });
    },

    callAgentMemoryModel: async function (prompt, retries = 3) {
        return this.callChatText(prompt, retries, {
            usageLabel: 'Agent Memory AI'
        });
    },

    parseStructuredJsonResponse,

    // 🔧 [Fixed] 이미지 생성 API 재시도 로직 추가
    callGeminiImage: async function (prompt, savePath, retries = 3, options = {}) {
        const apiKey = String(options?.apiKey || '').trim();
        if (!apiKey) throw new Error('API Key 누락');
        const imageTimeoutMs = Math.max(1000, Number(CONFIG.GEMINI_IMAGE_TIMEOUT_MS) || 180000);
        const aspectRatio = resolveWritingImageAspectRatio(options);

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const endpoint = `${CONFIG.GEMINI_IMAGE_ENDPOINT}?key=${apiKey}`;
                const response = await this.runWithHeartbeat(
                    `(시도 ${attempt})`,
                    () => axios.post(endpoint,
                        {
                            contents: [{ parts: [{ text: prompt }] }],
                            generationConfig: {
                                responseModalities: ['IMAGE'],
                                imageConfig: aspectRatio ? { aspectRatio } : undefined
                            }
                        },
                        { headers: { 'Content-Type': 'application/json' }, timeout: imageTimeoutMs }
                    )
                );
                const candidates = response.data.candidates;
                if (!candidates || candidates.length === 0) throw new Error("No candidates returned");
                const imagePart = candidates[0].content.parts.find(part => part.inlineData);
                if (!imagePart) throw new Error('No inlineData found');

                const fullPath = `${savePath}.png`;
                fs.writeFileSync(fullPath, Buffer.from(imagePart.inlineData.data, 'base64'));
                Logger.info(`   ✅ 이미지 저장 완료: ${path.basename(fullPath)}`);

                // 🎨 플랫폼별 최적의 포맷으로 자동 변환 연동
                try {
                    const ImageService = require('./image-service');
                    // jobData에서 플랫폼 정보를 가져오는 로직이 필요할 수 있으나, 
                    // 기본적으로 Naver(WebP)를 시도하고 WP 배포 시 WP에 맞춰 변환됨.
                    // 현재 jobData는 core.js의 prepareImages에서 넘겨줌. 
                    // 여기서는 일단 WebP로 변환해두거나 (호환성), 호출자가 처리하게 둘 수 있음.
                    // 하지만 사용자 요청은 "생성한 파일이든 동일해"이므로 변환 시도.
                    // (일단 WebP를 기본으로 하되, WP 호출 시 AVIF로 변환되는 흐름 권장)

                    // TODO: 더 정확한 플랫폼 판별을 위해 인자 추가 고려
                } catch (ignore) { }

                return fullPath;
            } catch (e) {
                Logger.warn(`⚠️ Gemini Image API 호출 실패 (시도 ${attempt}/${retries}): ${formatReadableErrorMessage(e)}`);

                if (attempt === retries) {
                    Logger.error(`❌ 이미지 생성 최대 재시도 횟수 초과`);
                    throw e; // null 대신 에러 throw
                }

                // 지수 백오프
                const waitTime = 1000 * Math.pow(2, attempt - 1);
                Logger.info(`   ⏳ ${waitTime / 1000}초 후 재시도...`);
                await this.sleep(waitTime);
            }
        }
    },

    callOpenAiCompatibleImageByConfig: async function (modelConfig = {}, prompt, savePath, retries = 3, options = {}) {
        const baseUrl = normalizeOpenAiCompatibleBaseUrl(modelConfig.base_url);
        const model = String(modelConfig.code || '').trim();
        const apiKey = String(modelConfig.api_key || '').trim();
        const imageTimeoutMs = Math.max(1000, Number(CONFIG.GEMINI_IMAGE_TIMEOUT_MS) || 180000);
        if (!baseUrl || !model) throw new Error('이미지 모델 설정에 Base URL과 Model Code가 필요합니다.');

        const headers = { 'Content-Type': 'application/json' };
        if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const imageRequest = resolveOpenAiImageRequest(modelConfig, {
                    ...options,
                    prompt
                });
                const response = await this.runWithHeartbeat(
                    `(시도 ${attempt})`,
                    () => axios.post(`${baseUrl}/images/generations`, imageRequest.body, {
                        headers,
                        timeout: imageTimeoutMs
                    })
                );
                let imageBuffer = extractOpenAIImageBuffer(response.data);
                if (!imageBuffer) {
                    const imageUrl = String(response.data?.data?.[0]?.url || '').trim();
                    if (imageUrl) {
                        const downloaded = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: imageTimeoutMs });
                        imageBuffer = Buffer.from(downloaded.data);
                    }
                }
                if (!imageBuffer) throw new Error('OpenAI-compatible 이미지 응답에서 b64_json 또는 url을 찾지 못했습니다.');
                const fullPath = `${savePath}.png`;
                fs.writeFileSync(fullPath, imageBuffer);
                Logger.info(`   ✅ 이미지 저장 완료: ${path.basename(fullPath)}`);
                return fullPath;
            } catch (e) {
                Logger.warn(`⚠️ OpenAI-compatible Image API 호출 실패 (시도 ${attempt}/${retries}): ${formatReadableErrorMessage(e)}`);
                if (attempt === retries) {
                    Logger.error(`❌ 이미지 생성 최대 재시도 횟수 초과`);
                    throw e;
                }
                const waitTime = 1000 * Math.pow(2, attempt - 1);
                Logger.info(`   ⏳ ${waitTime / 1000}초 후 재시도...`);
                await this.sleep(waitTime);
            }
        }
    },

    callKieMarketImageByConfig: async function (modelConfig = {}, prompt, savePath, options = {}) {
        const reportProgress = createKieMarketImageProgressReporter({
            logInfo: (message) => Logger.info(message),
            logWarn: (message) => Logger.warn(message)
        });
        const client = createKieMarketImageClient({
            jobStore: asyncAiJobStore,
            onProgress: reportProgress
        });
        const result = await client.generate({
            modelConfig,
            prompt,
            options
        });
        const fullPath = `${savePath}.png`;
        fs.writeFileSync(fullPath, result.imageBuffer);
        const credit = Number.isFinite(Number(result.creditsConsumed))
            ? ` · ${Number(result.creditsConsumed)} credits`
            : '';
        Logger.info(`   ✅ KIE 이미지 저장 완료: ${path.basename(fullPath)}${credit}`);
        return fullPath;
    },

    callWritingImage: async function (prompt, savePath, retries = 3, options = {}) {
        const modelConfig = CONFIG.IMAGE_MODEL_CONFIG || {};
        const provider = String(modelConfig.provider || '').trim().toLowerCase();
        const modelName = String(modelConfig.name || '').trim() || String(modelConfig.code || '').trim() || '알 수 없는 모델';
        const modelCode = String(modelConfig.code || '').trim();
        const aspectRatio = resolveWritingImageAspectRatio(options);
        const imageSize = resolveWritingImageSize(options);
        const runtimeDefinition = getModelRuntimeDefinition('image', modelConfig);
        const transport = runtimeDefinition.transport;
        Logger.info(`🎨 [Writing Image] 이미지 모델: ${modelName}${modelCode ? ` (${modelCode})` : ''} / provider=${provider || 'unknown'} / transport=${transport || 'unknown'} / aspect=${aspectRatio || 'default'}`);
        if (runtimeDefinition.status === 'unavailable') {
            throw new Error(`${modelName} 모델은 현재 사용할 수 없습니다. 설정에서 다른 모델을 선택해 주세요.`);
        }
        if (transport === 'gemini_generate_content') {
            return this.callGeminiImage(prompt, savePath, retries, {
                apiKey: String(modelConfig.api_key || '').trim(),
                aspectRatio,
                useCase: options.useCase
            });
        }
        if (transport === 'kie_market_image_jobs') {
            return this.callKieMarketImageByConfig(modelConfig, prompt, savePath, {
                aspectRatio,
                imageSize,
                useCase: options.useCase
            });
        }
        return this.callOpenAiCompatibleImageByConfig(modelConfig, prompt, savePath, retries, {
            aspectRatio,
            imageSize,
            useCase: options.useCase
        });
    },

    parseMarkdown: function (raw) {
        const lines = raw.split('\n');
        let title = '';
        const contents = [];
        let skipImageBlock = false;
        let currentImageIndex = null;
        let currentImageLines = [];

        const createTextContent = (type, source, extra = {}) => {
            const rawText = String(source || '');
            const boldRanges = [];
            let text = '';
            let cursor = 0;
            const boldPattern = /\*\*([^*\n]+)\*\*/g;
            let match;

            while ((match = boldPattern.exec(rawText)) !== null) {
                text += rawText.slice(cursor, match.index);
                const start = text.length;
                text += match[1];
                boldRanges.push({ start, end: text.length });
                cursor = match.index + match[0].length;
            }
            text += rawText.slice(cursor);

            return {
                type,
                ...extra,
                text,
                ...(boldRanges.length > 0 ? { boldRanges } : {})
            };
        };

        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!title && trimmedLine.startsWith('# ')) {
                title = trimmedLine.replace(/^#\s+/, '').trim();
                continue;
            }
            const imageStart = trimmedLine.match(/^\[\[IMAGE_(\d+)/);
            if (imageStart) {
                // 🔧 [Fixed] 중첩된 이미지 블록 감지 및 처리
                if (skipImageBlock) {
                    Logger.warn(`⚠️ 중첩된 이미지 블록 감지: ${trimmedLine}`);
                    // 이전 블록 강제 종료
                    contents.push({
                        type: 'image',
                        index: currentImageIndex,
                        raw: currentImageLines.join('\n'),
                        text: 'Error: Nested block detected',
                        prompt: 'Invalid nested block'
                    });
                }

                skipImageBlock = true;
                currentImageIndex = Number(imageStart[1]);
                currentImageLines = [line];
                if (trimmedLine.endsWith(']]')) {
                    const blockText = currentImageLines.join('\n');
                    contents.push({
                        type: 'image', index: currentImageIndex, raw: blockText,
                        text: this.extractInfo(blockText, 'title'), prompt: this.extractInfo(blockText, 'prompt')
                    });
                    skipImageBlock = false;
                }
                continue;
            }
            if (skipImageBlock) {
                currentImageLines.push(line);
                if (trimmedLine.includes(']]')) {
                    const blockText = currentImageLines.join('\n');
                    contents.push({
                        type: 'image', index: currentImageIndex, raw: blockText,
                        text: this.extractInfo(blockText, 'title'), prompt: this.extractInfo(blockText, 'prompt')
                    });
                    skipImageBlock = false;
                }
                continue;
            }
            if (trimmedLine === '') { contents.push({ type: 'newline' }); continue; }
            if (/^-{3,}$/.test(trimmedLine)) {
                contents.push({ type: 'separator' });
                continue;
            }
            if (/^###\s+/.test(trimmedLine)) {
                contents.push(createTextContent('header-h3', trimmedLine.replace(/^###\s+/, '').trim()));
                continue;
            }
            if (/^##\s+/.test(trimmedLine)) {
                contents.push(createTextContent('header-h2', trimmedLine.replace(/^##\s+/, '').trim()));
                continue;
            }
            if (/^>\s*/.test(trimmedLine)) {
                contents.push(createTextContent('quote', trimmedLine.replace(/^>\s*/, '').trim()));
                continue;
            }
            if (/^[-*]\s+/.test(trimmedLine)) {
                contents.push(createTextContent(
                    'list-item',
                    trimmedLine.replace(/^[-*]\s+/, '').trim(),
                    { listType: 'unordered' }
                ));
                continue;
            }
            if (/^\d+[.)]\s+/.test(trimmedLine)) {
                contents.push(createTextContent(
                    'list-item',
                    trimmedLine.replace(/^\d+[.)]\s+/, '').trim(),
                    { listType: 'ordered' }
                ));
                continue;
            }
            contents.push(createTextContent('paragraph', line));
        }
        return { title, contents };
    },

    extractInfo: function (txt, key) {
        let val = '';
        const regex = new RegExp(`^${key}\\s*:`, 'i');
        txt.split('\n').forEach(l => {
            const trimmed = l.trim();
            if (regex.test(trimmed)) { val = trimmed.replace(regex, '').trim(); }
        });
        return val;
    },

    _dashboardSummaryCache: null,
    _dashboardSummaryCacheTime: 0,

    /**
     * Dashboard 통계 데이터 집계 함수
     */
    getDashboardSummary: async function () {
        const nowMs = Date.now();
        // 60초(1분) 동안 캐시된 데이터를 반환하여 Google Sheets API 호출 횟수 및 로그 스팸 감소
        if (this._dashboardSummaryCache && (nowMs - this._dashboardSummaryCacheTime < 60000)) {
            return this._dashboardSummaryCache;
        }

        try {
            // 금주(일요일 0시 ~ 현재) 및 일간(어제/오늘) 집계
            const now = new Date();
            const dayOfWeek = now.getDay(); // 0=Sunday
            const startOfWeek = new Date(now);
            startOfWeek.setDate(now.getDate() - dayOfWeek);
            startOfWeek.setHours(0, 0, 0, 0);
            const startOfToday = new Date(now);
            startOfToday.setHours(0, 0, 0, 0);
            const startOfYesterday = new Date(startOfToday);
            startOfYesterday.setDate(startOfYesterday.getDate() - 1);
            const startOfTomorrow = new Date(startOfToday);
            startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

            const parseDateLoose = (value) => {
                const raw = String(value || '').trim();
                if (!raw) return null;

                const native = new Date(raw);
                if (!Number.isNaN(native.getTime())) return native;

                const ymdKorean = raw.match(/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?/);
                if (ymdKorean) {
                    const y = Number(ymdKorean[1]);
                    const m = Number(ymdKorean[2]);
                    const d = Number(ymdKorean[3]);
                    const dt = new Date(y, m - 1, d);
                    if (!Number.isNaN(dt.getTime())) return dt;
                }

                const ymdPlain = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
                if (ymdPlain) {
                    const y = Number(ymdPlain[1]);
                    const m = Number(ymdPlain[2]);
                    const d = Number(ymdPlain[3]);
                    const dt = new Date(y, m - 1, d);
                    if (!Number.isNaN(dt.getTime())) return dt;
                }

                const compact = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
                if (compact) {
                    const y = Number(compact[1]);
                    const m = Number(compact[2]);
                    const d = Number(compact[3]);
                    const dt = new Date(y, m - 1, d);
                    if (!Number.isNaN(dt.getTime())) return dt;
                }

                return null;
            };

            const normalizeYmd = (value) => {
                const dt = parseDateLoose(value);
                if (!dt) return '';
                const y = dt.getFullYear();
                const m = String(dt.getMonth() + 1).padStart(2, '0');
                const d = String(dt.getDate()).padStart(2, '0');
                return `${y}-${m}-${d}`;
            };

            // 🚀 병렬 데이터 로딩 (블로킹 제거)
            if (!this._dashboardSummaryCache) {
                Logger.debug('[Dash] Initializing dashboard summary (fetching sheets)...');
            }
            const fetchStart = Date.now();
            const [topics, shopping] = await Promise.all([
                this.readGoogleSheetTopics({ silent: true }),
                this.readGoogleSheetShopping({ silent: true })
            ]);
            const fetchDuration = Date.now() - fetchStart;
            Logger.debug(`[Dash] Sheets fetched in ${fetchDuration}ms (topics: ${topics ? topics.length : 0}, shopping: ${shopping ? shopping.length : 0})`);

            let blogWeeklyCount = 0;
            let shoppingWeeklyCount = 0;
            let pendingTopicsCount = 0;
            let blogReadyCount = 0;
            let shoppingReadyCount = 0;
            let blogTodayCount = 0;
            let blogYesterdayCount = 0;
            let shoppingTodayCount = 0;
            let shoppingYesterdayCount = 0;

            topics.forEach(t => {
                const st = String(t.status || '').trim();
                if (st === '발행 완료') {
                    const dt = parseDateLoose(t.publishedAt || t.addedAt);
                    if (dt) {
                        if (dt >= startOfWeek) blogWeeklyCount++;
                        if (dt >= startOfToday && dt < startOfTomorrow) blogTodayCount++;
                        else if (dt >= startOfYesterday && dt < startOfToday) blogYesterdayCount++;
                    }
                } else if (st === '발행 준비 완료') {
                    blogReadyCount++;
                }
            });

            shopping.forEach(t => {
                const st = String(t.status || '').trim();
                if (st === '발행 완료') {
                    const dt = parseDateLoose(t.publishedAt);
                    if (dt) {
                        if (dt >= startOfWeek) shoppingWeeklyCount++;
                        if (dt >= startOfToday && dt < startOfTomorrow) shoppingTodayCount++;
                        else if (dt >= startOfYesterday && dt < startOfToday) shoppingYesterdayCount++;
                    }
                } else if (st === '발행 준비 완료') {
                    shoppingReadyCount++;
                }
            });

            pendingTopicsCount = blogReadyCount + shoppingReadyCount;

            const result = {
                blogWeeklyCount,
                shoppingWeeklyCount,
                pendingTopicsCount,
                pendingTrendsCount: 0,
                blogReadyCount,
                shoppingReadyCount,
                blogTodayCount,
                blogYesterdayCount,
                shoppingTodayCount,
                shoppingYesterdayCount,
                recentTrendsFetched: '-' // 트렌드 통계 제외
            };

            this._dashboardSummaryCache = result;
            this._dashboardSummaryCacheTime = nowMs;
            return result;

        } catch (error) {
            Logger.error(`❌ 대시보드 데이터 로드 실패: ${error.message}`);
            return {
                blogWeeklyCount: 0,
                shoppingWeeklyCount: 0,
                pendingTopicsCount: 0,
                pendingTrendsCount: 0,
                blogReadyCount: 0,
                shoppingReadyCount: 0,
                blogTodayCount: 0,
                blogYesterdayCount: 0,
                shoppingTodayCount: 0,
                shoppingYesterdayCount: 0,
                recentTrendsFetched: '-'
            };
        }
    },

    /**
     * 📂 플랫폼별 워크스페이스 베이스 디렉토리 결정
     * @param {string} platformHint 'naver' | 'wordpress'
     * @returns {string} 플랫폼별 하위 디렉토리를 포함한 워크스페이스 절대 경로
     */
    resolvePlatformWorkspaceDir: function (platformHint = 'naver') {
        const Constants = require('./constants');
        const wsBase = CONFIG.WORKSPACE_DIR || Constants.WORKSPACE_DIR || path.join(process.cwd(), 'workspace');
        const platform = String(platformHint || 'naver').toLowerCase();

        let platformDir;
        if (platform === 'wordpress') {
            const wpUrl = String(CONFIG.WORDPRESS_URL || '').trim();
            const domain = wpUrl.replace(/^https?:\/\//i, '').replace(/\/$/, '') || 'wp_unknown';
            platformDir = `wp_${domain}`;
        } else {
            const naverId = String(CONFIG.NAVER_ID || '').trim();
            platformDir = naverId ? `naver_${naverId}` : 'naver';
        }

        const wsPath = path.join(wsBase, platformDir);
        if (!fs.existsSync(wsPath)) {
            try {
                fs.mkdirSync(wsPath, { recursive: true });
            } catch (e) {
                Logger.error(`❌ 플랫폼 워크스페이스 폴더 생성 실패 (${wsPath}): ${e.message}`);
            }
        }
        return wsPath;
    },

    /**
     * 🔍 디렉토리 내에서 숫자로 시작하는 이미지 파일 찾기
     * @param {string} dirPath 탐색할 디렉토리 경로
     * @param {number|string} index 이미지 인덱스 (0, 1, 2...)
     * @returns {string|null} 찾은 이미지의 절대 경로 또는 null
     */
    findImageByPrefix: function (dirPath, index) {
        if (!dirPath || !fs.existsSync(dirPath)) return null;

        try {
            const prefix = String(index).padStart(2, '0');
            const allFiles = fs.readdirSync(dirPath);

            // Priority: avif > webp > png > jpg > jpeg
            const priority = ['.avif', '.webp', '.png', '.jpg', '.jpeg'];

            const candidates = allFiles
                .filter(f => f.startsWith(`${prefix}_`))
                .filter(f => /\.(png|jpg|jpeg|webp|avif)$/i.test(f));

            if (candidates.length === 0) return null;

            // Sort by priority
            candidates.sort((a, b) => {
                const extA = path.extname(a).toLowerCase();
                const extB = path.extname(b).toLowerCase();

                let idxA = priority.indexOf(extA);
                let idxB = priority.indexOf(extB);

                if (idxA === -1) idxA = 99;
                if (idxB === -1) idxB = 99;

                return idxA - idxB;
            });

            return path.join(dirPath, candidates[0]);
        } catch (e) {
            Logger.error(`❌ 이미지 파일 탐색 실패 (Index: ${index}): ${e.message}`);
            return null;
        }
    },

    /**
     * config.json 파일 내의 특정 필드를 업데이트하고 메모리(CONFIG)에도 반영한다.
     */
    updateConfigValue: (key, value) => {
        try {
            const configPath = CONFIG.CONFIG_SOURCE_PATH;
            if (!configPath || !fs.existsSync(configPath)) return false;

            if (configPath.endsWith('.json')) {
                const configRaw = fs.readFileSync(configPath, 'utf8');
                const config = JSON.parse(configRaw);

                // Legacy Flat Keys => Structured Paths Mapping
                const mapping = {
                    'WP_PERMANENT_FTC_URL': ['platforms', 'wordpress', 'assets', 'ftc_image'],
                    'WP_PERMANENT_CTA_URL1': ['platforms', 'wordpress', 'assets', 'cta_images', 0],
                    'WP_PERMANENT_CTA_URL2': ['platforms', 'wordpress', 'assets', 'cta_images', 1],
                    'WP_PERMANENT_CTA_URL3': ['platforms', 'wordpress', 'assets', 'cta_images', 2]
                };

                const targetPath = mapping[key];
                if (targetPath) {
                    let curr = config;
                    for (let i = 0; i < targetPath.length - 1; i++) {
                        const p = targetPath[i];
                        const nextP = targetPath[i + 1];
                        if (!curr[p]) curr[p] = (typeof nextP === 'number' ? [] : {});
                        curr = curr[p];
                    }
                    curr[targetPath[targetPath.length - 1]] = value;
                } else {
                    // Fallback to top-level for unknown keys
                    config[key] = value;
                }

                fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
                CONFIG[key] = value; // Sync memory
                return true;
            }

            // config.json 기반의 구조적 업데이트 (Surgical Update) 지원
            return false;
        } catch (e) {
            Logger.error(`❌ 설정 파일 업데이트 실패 (${key}): ${e.message}`);
            return false;
        }
    }
};

module.exports = Utils;
