const crypto = require('crypto');
const axios = require('axios');

const SEARCH_AD_BASE_URL = 'https://api.searchad.naver.com';
const KEYWORDS_TOOL_URI = '/keywordstool';

/**
 * Generate Naver Search Ads HMAC-SHA256 signature
 */
function makeSignature(timestamp, method, uri, secretKey) {
    const message = `${timestamp}.${method}.${uri}`;
    return crypto.createHmac('sha256', secretKey).update(message).digest('base64');
}

/**
 * Normalize keyword for hintKeywords query parameter
 */
function normalizeKeyword(keyword) {
    return String(keyword || '').replace(/\s+/g, '').toLowerCase();
}

/**
 * Create a Naver Search Ads API Client
 */
function createNaverSearchAdClient(options = {}) {
    const apiKey = options.apiKey || process.env.NAVER_SEARCHAD_API_KEY || '';
    const secretKey = options.secretKey || process.env.NAVER_SEARCHAD_SECRET_KEY || '';
    const customerId = options.customerId || process.env.NAVER_SEARCHAD_CUSTOMER_ID || '';
    const httpClient = options.httpClient || axios;
    const logger = options.logger || console;

    function isConfigured() {
        return Boolean(apiKey && secretKey && customerId);
    }

    async function fetchKeywordRows(keyword, retries = 2) {
        if (!isConfigured()) {
            throw new Error('네이버 검색광고 API 자격증명(NAVER_SEARCHAD_*)이 설정되지 않았습니다.');
        }

        const normalized = normalizeKeyword(keyword);
        if (!normalized) {
            return [];
        }

        const timestamp = String(Date.now());
        const signature = makeSignature(timestamp, 'GET', KEYWORDS_TOOL_URI, secretKey);

        const url = `${SEARCH_AD_BASE_URL}${KEYWORDS_TOOL_URI}`;
        const params = {
            hintKeywords: normalized,
            includeHintKeywords: '1',
            showDetail: '1'
        };

        const headers = {
            'X-Timestamp': timestamp,
            'X-API-KEY': apiKey,
            'X-Customer': customerId,
            'X-Signature': signature
        };

        for (let attempt = 0; attempt <= retries; attempt += 1) {
            try {
                const response = await httpClient.get(url, {
                    params,
                    headers,
                    timeout: 20000
                });

                let payload = response.data;
                if (payload && typeof payload === 'object' && Array.isArray(payload.keywordList)) {
                    payload = payload.keywordList;
                }

                if (!Array.isArray(payload)) {
                    throw new Error('예상치 못한 검색광고 API 응답 형식입니다.');
                }

                return payload.filter((row) => row && typeof row === 'object');
            } catch (err) {
                const status = err.response?.status;
                if (status === 429 && attempt < retries) {
                    const waitMs = 6000 * (attempt + 1);
                    if (logger.warn) logger.warn(`⚠️ [SearchAd] Rate limit (429) 감지, ${waitMs}ms 후 재시도 (${attempt + 1}/${retries})`);
                    await new Promise((resolve) => setTimeout(resolve, waitMs));
                    continue;
                }

                const detail = err.response?.data
                    ? (typeof err.response.data === 'string' ? err.response.data : JSON.stringify(err.response.data))
                    : err.message;
                throw new Error(`검색광고 API 호출 실패: ${detail}`);
            }
        }

        throw new Error('검색광고 API 재시도 한도를 초과했습니다.');
    }

    return {
        isConfigured,
        fetchKeywordRows
    };
}

module.exports = {
    SEARCH_AD_BASE_URL,
    KEYWORDS_TOOL_URI,
    makeSignature,
    normalizeKeyword,
    createNaverSearchAdClient
};
