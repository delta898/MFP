function createUrlShorteningService(options = {}) {
    const {
        resolveConfiguration = () => ({}),
        providers = {},
        logger
    } = options;

    function configuration() {
        const value = resolveConfiguration() || {};
        return {
            provider: String(value.provider || '').trim().toLowerCase(),
            credential: String(value.credential || '').trim()
        };
    }

    function isConfigured() {
        const config = configuration();
        return Boolean(config.provider && config.credential && typeof providers[config.provider]?.shorten === 'function');
    }

    async function shorten(value) {
        const originalUrl = String(value || '').trim();
        const config = configuration();
        const provider = providers[config.provider];
        if (!originalUrl || !config.credential || typeof provider?.shorten !== 'function') return originalUrl;
        try {
            return String(await provider.shorten(originalUrl, { credential: config.credential }) || originalUrl).trim() || originalUrl;
        } catch (error) {
            logger?.warn?.(`⚠️ [URL Shortening] ${config.provider} 요청 실패, 원문 URL을 사용합니다: ${error.message}`);
            return originalUrl;
        }
    }

    return { isConfigured, shorten };
}

function createDefaultUrlShorteningService(options = {}) {
    const { CONFIG = {}, urlService, logger } = options;
    return createUrlShorteningService({
        resolveConfiguration: () => ({ provider: 'bitly', credential: CONFIG.NOTIFY_BITLY_TOKEN }),
        providers: {
            bitly: { shorten: (url, providerOptions = {}) => urlService.shorten(url, providerOptions.credential) }
        },
        logger
    });
}

module.exports = { createUrlShorteningService, createDefaultUrlShorteningService };
