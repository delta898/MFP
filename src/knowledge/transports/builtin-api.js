function createBuiltinApiTransport(options = {}) {
    const handlers = options.handlers || {};
    const httpClient = options.httpClient || null;

    return {
        id: 'builtin_api',
        async fetch(definition = {}, query = {}, context = {}) {
            const kind = String(definition.kind || '').trim();
            const vendor = String(definition?.config?.vendor || definition.vendor || 'default').trim();
            const key = `${kind}:${vendor}`;
            const handler = handlers[key];
            if (!handler || typeof handler.fetch !== 'function') {
                throw new Error(`builtin_api handler not found: ${key}`);
            }
            return handler.fetch({
                definition,
                query,
                context,
                transportContext: {
                    httpClient
                }
            });
        }
    };
}

module.exports = {
    createBuiltinApiTransport
};
