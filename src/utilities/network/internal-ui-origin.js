const DEFAULT_INTERNAL_UI_PORT = 4577;

function normalizeInternalUiPort(value, fallback = DEFAULT_INTERNAL_UI_PORT) {
    const port = Number(value);
    if (Number.isInteger(port) && port >= 1 && port <= 65535) return port;
    return fallback;
}

function getInternalUiOrigin(CONFIG = {}, options = {}) {
    const port = normalizeInternalUiPort(CONFIG.LISTEN_PORT, options.defaultPort);
    return `http://127.0.0.1:${port}`;
}

module.exports = {
    DEFAULT_INTERNAL_UI_PORT,
    getInternalUiOrigin,
    normalizeInternalUiPort
};
