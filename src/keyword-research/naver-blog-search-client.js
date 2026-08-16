const axios = require('axios');

const API_HUB_BLOG_SEARCH_URL = 'https://naverapihub.apigw.ntruss.com/search/v1/blog';
const OPEN_API_BLOG_SEARCH_URL = 'https://openapi.naver.com/v1/search/blog.json';

/**
 * Create a Naver Blog Search API Client for fetching total document counts
 */
function createNaverBlogSearchClient(options = {}) {
    const apiHubClientId = options.apiHubClientId || process.env.NAVER_API_HUB_CLIENT_ID || '';
    const apiHubClientSecret = options.apiHubClientSecret || process.env.NAVER_API_HUB_CLIENT_SECRET || '';
    const openApiClientId = options.openApiClientId || process.env.NAVER_CLIENT_ID || process.env.NAVER_SEARCH_CLIENT_ID || '';
    const openApiClientSecret = options.openApiClientSecret || process.env.NAVER_CLIENT_SECRET || process.env.NAVER_SEARCH_CLIENT_SECRET || '';
    const httpClient = options.httpClient || axios;

    function isConfigured() {
        return Boolean((apiHubClientId && apiHubClientSecret) || (openApiClientId && openApiClientSecret));
    }

    async function fetchBlogTotal(keyword) {
        if (!keyword || !String(keyword).trim()) {
            return { total: null, error: '키워드가 비어 있습니다.' };
        }

        const trimmed = String(keyword).trim();

        // 1. API Hub 우선 시도 (설정된 경우)
        if (apiHubClientId && apiHubClientSecret) {
            try {
                const response = await httpClient.get(API_HUB_BLOG_SEARCH_URL, {
                    params: { query: trimmed, display: 1 },
                    headers: {
                        'X-NCP-APIGW-API-KEY-ID': apiHubClientId,
                        'X-NCP-APIGW-API-KEY': apiHubClientSecret
                    },
                    timeout: 10000
                });

                const total = response.data?.total;
                if (typeof total === 'number') {
                    return { total: Math.floor(total), error: null };
                }
                return { total: null, error: '예상치 못한 API Hub 응답 형식입니다.' };
            } catch (err) {
                // API Hub 실패 시 Open API로 폴백 시도
                if (!openApiClientId || !openApiClientSecret) {
                    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
                    return { total: null, error: `API Hub 호출 실패: ${detail}` };
                }
            }
        }

        // 2. Naver Open API 시도
        if (openApiClientId && openApiClientSecret) {
            try {
                const response = await httpClient.get(OPEN_API_BLOG_SEARCH_URL, {
                    params: { query: trimmed, display: 1 },
                    headers: {
                        'X-Naver-Client-Id': openApiClientId,
                        'X-Naver-Client-Secret': openApiClientSecret
                    },
                    timeout: 10000
                });

                const total = response.data?.total;
                if (typeof total === 'number') {
                    return { total: Math.floor(total), error: null };
                }
                return { total: null, error: '예상치 못한 Open API 응답 형식입니다.' };
            } catch (err) {
                const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
                return { total: null, error: `네이버 검색 API 호출 실패: ${detail}` };
            }
        }

        return { total: null, error: '네이버 블로그 검색 API 자격증명이 설정되지 않았습니다.' };
    }

    return {
        isConfigured,
        fetchBlogTotal
    };
}

module.exports = {
    API_HUB_BLOG_SEARCH_URL,
    OPEN_API_BLOG_SEARCH_URL,
    createNaverBlogSearchClient
};
