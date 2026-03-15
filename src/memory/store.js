const Logger = require('../logger');
const CONFIG = require('../config-loader');
const { KuzuEventStore } = require('./event-store');

let store = null;

function getAgentEventStore() {
    if (store) return store;
    store = new KuzuEventStore({
        Logger,
        baseDir: CONFIG.ROOT_DIR || CONFIG.APP_ROOT_DIR || process.cwd()
    });
    return store;
}

module.exports = {
    getAgentEventStore
};
