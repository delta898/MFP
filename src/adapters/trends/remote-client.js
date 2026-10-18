const DEFAULT_TIMEOUT_MS = 12000;

function createRemoteError(error) {
    const status = Number(error?.response?.status || 0);
    const message = String(
        error?.response?.data?.message
        || error?.message
        || '트렌드 서버 요청에 실패했습니다.'
    );
    const wrapped = new Error(message);
    wrapped.status = status;
    wrapped.code = status === 401
        ? 'TRENDS_REMOTE_UNAUTHORIZED'
        : (status === 429 ? 'TRENDS_REMOTE_RATE_LIMITED' : 'TRENDS_REMOTE_FAILED');
    return wrapped;
}

function createTrendPostingRemoteClient(options = {}) {
    const axios = options.axios;
    const tokenCache = options.tokenCache;
    const baseUrl = String(options.baseUrl || '').trim().replace(/\/+$/, '');
    const timeout = Math.max(1000, Number(options.timeout) || DEFAULT_TIMEOUT_MS);
    if (!axios || typeof axios.get !== 'function') throw new Error('axios.get is required');
    if (!tokenCache || typeof tokenCache.getToken !== 'function' || typeof tokenCache.refreshToken !== 'function') {
        throw new Error('tokenCache is required');
    }
    if (!baseUrl) {
        const error = new Error('현재 환경의 Trends API가 설정되지 않았습니다.');
        error.code = 'TRENDS_API_NOT_CONFIGURED';
        throw error;
    }

    async function request(pathname, params = {}) {
        let token = await tokenCache.getToken();
        for (let attempt = 0; attempt < 2; attempt += 1) {
            try {
                const response = await axios.get(`${baseUrl}${pathname}`, {
                    params,
                    timeout,
                    headers: {
                        Accept: 'application/json',
                        Authorization: `Bearer ${token}`
                    }
                });
                return response.data;
            } catch (error) {
                const status = Number(error?.response?.status || 0);
                if (status === 401 && attempt === 0) {
                    token = await tokenCache.refreshToken();
                    continue;
                }
                throw createRemoteError(error);
            }
        }
        throw new Error('트렌드 서버 인증에 실패했습니다.');
    }

    return {
        getMeta() {
            return request('/api/v1/trends/meta');
        },
        getRows(filters = {}) {
            return request('/api/v1/trends', {
                categories: Array.isArray(filters.categories) ? filters.categories.join(',') : '',
                date_from: filters.dateFrom,
                date_to: filters.dateTo,
                limit: 5000
            });
        }
    };
}

module.exports = {
    createRemoteError,
    createTrendPostingRemoteClient
};
