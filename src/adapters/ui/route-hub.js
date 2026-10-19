function createApiRouteHub(routeHandlers = []) {
    const handlers = Array.isArray(routeHandlers) ? routeHandlers.filter((fn) => typeof fn === 'function') : [];

    return async function handleWithRouteHub(ctx = {}) {
        for (const handler of handlers) {
            // handler must return true when handled, false otherwise
            const handled = await handler(ctx);
            if (handled) return true;
        }
        return false;
    };
}

module.exports = {
    createApiRouteHub
};
