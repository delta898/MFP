function buildCapabilityId(domain, name) {
    return `${String(domain || '').trim()}.${String(name || '').trim()}`;
}

module.exports = { buildCapabilityId };
