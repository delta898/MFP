const axios = require('axios');
const Logger = require('./logger');

class UrlService {
    /**
     * Bitly를 사용하여 URL을 단축합니다.
     * @param {string} longUrl 
     * @param {string} accessToken 
     * @returns {Promise<string>} 단축된 URL 또는 원본 URL (실패 시)
     */
    static async shorten(longUrl, accessToken) {
        if (!accessToken || !longUrl) return longUrl;

        try {
            const response = await axios.post(
                'https://api-ssl.bitly.com/v4/shorten',
                { long_url: longUrl },
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 5000
                }
            );

            if (response.data && response.data.link) {
                return response.data.link;
            }
            return longUrl;
        } catch (e) {
            const errorMsg = e.response?.data?.message || e.message;
            Logger.warn(`⚠️ [Bitly] URL 단축 실패: ${errorMsg}`);
            return longUrl;
        }
    }
}

module.exports = UrlService;
