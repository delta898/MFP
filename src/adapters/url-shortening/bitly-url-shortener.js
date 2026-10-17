'use strict';

const DEFAULT_ENDPOINT = 'https://api-ssl.bitly.com/v4/shorten';

function createBitlyUrlShortener(options = {}) {
    const httpClient = options.httpClient || require('axios');
    const logger = options.logger || { warn() {} };
    const endpoint = options.endpoint || DEFAULT_ENDPOINT;

    return Object.freeze({
        async shorten(longUrl, providerOptions = {}) {
            const accessToken = providerOptions.credential;
            if (!accessToken || !longUrl) return longUrl;

            try {
                const response = await httpClient.post(
                    endpoint,
                    { long_url: longUrl },
                    {
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: 5000
                    }
                );
                return response.data?.link || longUrl;
            } catch (error) {
                const errorMessage = error.response?.data?.message || error.message;
                logger.warn(`⚠️ [Bitly] URL 단축 실패: ${errorMessage}`);
                return longUrl;
            }
        }
    });
}

module.exports = { DEFAULT_ENDPOINT, createBitlyUrlShortener };
