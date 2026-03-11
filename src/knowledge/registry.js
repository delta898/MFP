function normalizeProviderDefinition(definition = {}) {
    return {
        id: String(definition.id || '').trim(),
        kind: String(definition.kind || '').trim(),
        transport: String(definition.transport || '').trim(),
        enabled: definition.enabled === true,
        label: String(definition.label || '').trim(),
        config: definition.config && typeof definition.config === 'object' && !Array.isArray(definition.config) ? definition.config : {}
    };
}

function matchesQuery(definition = {}, query = {}) {
    const requestedKind = String(query?.kind || '').trim();
    if (requestedKind && requestedKind !== String(definition.kind || '').trim()) return false;
    return true;
}

function createKnowledgeRegistry(options = {}) {
    const providerDefinitions = Array.isArray(options.providerDefinitions) ? options.providerDefinitions.map(normalizeProviderDefinition) : [];
    const routing = options.routing && typeof options.routing === 'object' ? options.routing : {};
    const transports = options.transports && typeof options.transports === 'object' ? options.transports : {};
    const logger = options.logger || null;
    const map = new Map();

    providerDefinitions.forEach((definition) => {
        if (!definition.id || !definition.kind || !definition.transport) return;
        map.set(definition.id, definition);
    });

    async function fetchDefinitions(definitions = [], query = {}, context = {}, meta = {}) {
        const results = [];
        const routeName = String(meta.routeName || 'all').trim();
        for (const definition of definitions) {
            const transport = transports[String(definition.transport || '').trim()];
            if (!transport || typeof transport.fetch !== 'function') {
                if (logger && typeof logger.warn === 'function') {
                    logger.warn(`⚠️ [Knowledge] route=${routeName} provider=${definition.id} transport not found: ${definition.transport}`);
                }
                results.push({
                    provider_id: definition.id,
                    kind: definition.kind,
                    transport: definition.transport,
                    items: [],
                    error: `transport not found: ${definition.transport}`
                });
                continue;
            }

            try {
                if (logger && typeof logger.info === 'function') {
                    logger.info(`🛰️ [Knowledge] route=${routeName} provider=${definition.id} (${definition.kind}/${definition.transport}) 조회 시작`);
                }
                const items = await transport.fetch(definition, query, context);
                if (logger && typeof logger.info === 'function') {
                    logger.info(`✅ [Knowledge] route=${routeName} provider=${definition.id} 조회 완료 (${Array.isArray(items) ? items.length : 0}건)`);
                }
                results.push({
                    provider_id: definition.id,
                    kind: definition.kind,
                    transport: definition.transport,
                    items: Array.isArray(items) ? items : []
                });
            } catch (error) {
                if (logger && typeof logger.warn === 'function') {
                    logger.warn(`⚠️ [Knowledge] route=${routeName} provider=${definition.id} 조회 실패: ${String(error?.message || 'provider fetch failed')}`);
                }
                results.push({
                    provider_id: definition.id,
                    kind: definition.kind,
                    transport: definition.transport,
                    items: [],
                    error: String(error?.message || 'provider fetch failed')
                });
            }
        }
        return results;
    }

    return {
        list() {
            return Array.from(map.values());
        },
        listByKind(kind = '') {
            const normalizedKind = String(kind || '').trim();
            return Array.from(map.values()).filter((definition) => !normalizedKind || definition.kind === normalizedKind);
        },
        get(id) {
            return map.get(String(id || '').trim()) || null;
        },
        getEnabled() {
            return Array.from(map.values()).filter((definition) => definition.enabled === true);
        },
        getEnabledForQuery(query = {}) {
            return this.getEnabled().filter((definition) => matchesQuery(definition, query));
        },
        async fetchAll(query = {}, context = {}) {
            return fetchDefinitions(this.getEnabledForQuery(query), query, context, { routeName: 'all' });
        },
        async fetchForRoute(routeName = '', query = {}, context = {}) {
            const route = Array.isArray(routing?.[routeName]) ? routing[routeName].map((item) => String(item || '').trim()).filter(Boolean) : [];
            const definitions = route.length > 0
                ? route.map((id) => this.get(id)).filter((item) => item && item.enabled === true && matchesQuery(item, query))
                : this.getEnabledForQuery(query);
            return fetchDefinitions(definitions, query, context, { routeName });
        }
    };
}

module.exports = {
    createKnowledgeRegistry
};
