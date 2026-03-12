const Logger = require('../logger');
const { KuzuEventStore } = require('./event-store');

let store = null;

function getAgentEventStore() {
    if (store) return store;
    store = new KuzuEventStore({
        Logger,
        baseDir: process.cwd()
    });
    return store;
}

module.exports = {
    getAgentEventStore
};
