const axios = require('axios');
const { createAccessTokenCache } = require('../trend-posting/access-token-cache');

const DEFAULT_KEYWORD_GATEWAY_BASE_URL = 'https://keywordapi.hangadac.com';
const DEFAULT_TIMEOUT_MS = 30000;

function createKeywordRemoteError(error) {
    const status = Number(error?.response?.status || 0);
    const remoteCode = String(error?.response?.data?.code || '');
    const message = status === 429
        ? '키워드 분석 요청이 많습니다. 잠시 후 다시 시도해 주세요.'
        : (status === 401
            ? '키워드 분석 인증이 만료되었습니다.'
            : (remoteCode === 'INVALID_REQUEST'
                ? String(error?.response?.data?.message || '키워드 분석 입력이 올바르지 않습니다.')
                : '검색량 지표를 불러오지 못했습니다. 입력한 키워드로 제목을 추천합니다.'));
    const wrapped = new Error(message);
    wrapped.status = status;
    wrapped.code = status === 401
        ? 'KEYWORD_REMOTE_UNAUTHORIZED'
        : (status === 429
            ? 'KEYWORD_REMOTE_RATE_LIMITED'
            : (remoteCode === 'INVALID_REQUEST' ? 'KEYWORD_REMOTE_INVALID_REQUEST' : 'KEYWORD_REMOTE_FAILED'));
    return wrapped;
}

function createKeywordResearchRemoteClient(options = {}) {
    const httpClient = options.httpClient || axios;
    const baseUrl = String(options.baseUrl || DEFAULT_KEYWORD_GATEWAY_BASE_URL).replace(/\/+$/, '');
    const timeout = Math.max(1000, Number(options.timeout) || DEFAULT_TIMEOUT_MS);
    const tokenCache = options.tokenCache || createAccessTokenCache({
        issueToken: options.issueToken,
        defaultErrorCode: 'KEYWORD_TOKEN_ISSUE_FAILED',
        defaultErrorMessage: '키워드 접근 토큰을 발급하지 못했습니다.'
    });

    async function analyze(request = {}) {
        let token = await tokenCache.getToken();
        for (let attempt = 0; attempt < 2; attempt += 1) {
            try {
                const response = await httpClient.post(`${baseUrl}/api/v1/keyword-research/analyze`, request, {
                    timeout,
                    headers: {
                        Accept: 'application/json',
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
                if (!response.data?.success || !response.data?.analysis) {
                    throw new Error(response.data?.message || '키워드 분석 서버 응답이 올바르지 않습니다.');
                }
                return response.data.analysis;
            } catch (error) {
                const status = Number(error?.response?.status || 0);
                if (status === 401 && attempt === 0) {
                    token = await tokenCache.refreshToken();
                    continue;
                }
                throw createKeywordRemoteError(error);
            }
        }
        throw new Error('키워드 분석 서버 인증에 실패했습니다.');
    }

    return { analyze };
}

module.exports = {
    DEFAULT_KEYWORD_GATEWAY_BASE_URL,
    createKeywordRemoteError,
    createKeywordResearchRemoteClient
};
