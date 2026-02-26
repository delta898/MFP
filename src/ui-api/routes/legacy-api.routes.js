const { createSystemRouteHandler } = require('./system.routes');
const { createSessionLicenseRouteHandler } = require('./session-license.routes');
const { createContentRouteHandler } = require('./content.routes');
const { createTrendsRouteHandler } = require('./trends.routes');

function createLegacyApiRouteHandler(deps = {}) {
    const handlers = [
        createSystemRouteHandler(deps),
        createSessionLicenseRouteHandler(deps),
        createContentRouteHandler(deps),
        createTrendsRouteHandler(deps)
    ];

    return async function tryHandleLegacyApi(ctx = {}) {
        for (const handler of handlers) {
            const handled = await handler(ctx);
            if (handled) return true;
        }
        return false;
    };
}

module.exports = {
    createLegacyApiRouteHandler
};

