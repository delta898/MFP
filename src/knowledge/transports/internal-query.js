function createInternalQueryTransport() {
    return {
        id: 'internal_query',
        async fetch(definition = {}, _query = {}, _context = {}) {
            const label = String(definition.label || definition.id || 'provider').trim();
            throw new Error(`internal_query transport is not implemented yet: ${label}`);
        }
    };
}

module.exports = {
    createInternalQueryTransport
};
