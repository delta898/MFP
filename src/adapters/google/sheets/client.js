'use strict';

const axios = require('axios');

function createGoogleSheetsClient(options = {}) {
    const getAccessToken = options.getAccessToken;
    const httpClient = options.httpClient || axios;
    const logger = options.logger || { warn() {} };
    const retries = Number.isInteger(options.retries) && options.retries > 0 ? options.retries : 5;
    const retryDelayMs = Number.isFinite(options.retryDelayMs) && options.retryDelayMs >= 0
        ? options.retryDelayMs
        : 2000;
    const formatError = options.formatError || ((error) => {
        const status = error?.response?.status;
        const data = error?.response?.data;
        const apiMessage = data?.error?.message
            || data?.error_description
            || (typeof data === 'string' ? data : '');
        const message = String(error?.message || '요청 실패');
        return status ? (apiMessage ? `status=${status} ${apiMessage}` : `status=${status} ${message}`) : (apiMessage || message);
    });

    if (typeof getAccessToken !== 'function') {
        throw new Error('Google Sheets client에는 getAccessToken 함수가 필요합니다.');
    }

    async function callWithRetry(work) {
        for (let attempt = 0; attempt < retries; attempt += 1) {
            try {
                return await work();
            } catch (error) {
                const status = Number(error?.response?.status || 0);
                if (attempt >= retries - 1 || (status !== 429 && status < 500)) {
                    throw new Error(formatError(error));
                }
                const delayMs = retryDelayMs * (2 ** attempt);
                logger.warn(`Google Sheets API 요청 재시도 (${status}), ${delayMs / 1000}초 대기`);
                await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
        }
    }

    return Object.freeze({
        async request({ method, url, data, params, scopes } = {}) {
            const accessToken = await getAccessToken(scopes);
            return callWithRetry(() => httpClient.request({
                method,
                url,
                data,
                params,
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }));
        },
        callWithRetry
    });
}

module.exports = { createGoogleSheetsClient };
