'use strict';

const { createBitlyUrlShortener } = require('../adapters/url-shortening/bitly-url-shortener');
const { createUrlShorteningService } = require('../services/url-shortening/service');

function createUrlShorteningSystem(options = {}) {
    const CONFIG = options.CONFIG || {};
    const bitly = createBitlyUrlShortener({
        httpClient: options.httpClient,
        endpoint: options.endpoint,
        logger: options.logger
    });
    const service = createUrlShorteningService({
        resolveConfiguration: () => ({ provider: 'bitly', credential: CONFIG.NOTIFY_BITLY_TOKEN }),
        providers: { bitly },
        logger: options.logger
    });

    return Object.freeze({ service });
}

module.exports = { createUrlShorteningSystem };
