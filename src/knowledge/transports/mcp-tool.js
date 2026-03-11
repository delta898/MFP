function createMcpToolTransport() {
    return {
        id: 'mcp_tool',
        async fetch(definition = {}, _query = {}, _context = {}) {
            const label = String(definition.label || definition.id || 'provider').trim();
            throw new Error(`mcp_tool transport is not implemented yet: ${label}`);
        }
    };
}

module.exports = {
    createMcpToolTransport
};
