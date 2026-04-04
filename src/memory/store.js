const Logger = require('../logger');
const CONFIG = require('../config-loader');
const { KuzuEventStore, loadKuzu, getKuzuLoadError } = require('./event-store');

let store = null;
let loggedDisabledReason = false;

function buildDisabledEventStore(reason) {
    const message = String(reason?.message || 'unknown error');

    if (!loggedDisabledReason) {
        loggedDisabledReason = true;
        Logger.warn(`⚠️ [AgentMemory] Kuzu 메모리 기능을 비활성화합니다: ${message}`);
        if (process.platform === 'win32') {
            Logger.warn('ℹ️ [AgentMemory] Windows에서 Microsoft Visual C++ Redistributable(2015-2022 x64) 설치가 필요할 수 있습니다.');
        }
    }

    return {
        disabled: true,
        disabledReason: message,
        async initialize() { return false; },
        async appendEvent() { return null; },
        async getGlobalStats() { return {}; },
        async getHistory() { return []; },
        async getShoppingSummary() { return []; },
        async getTopicSummary() { return []; },
        async getUserInsight() { return null; },
        async recordMessage() { return null; },
        async recordShoppingItem() { return null; },
        async recordTopic() { return null; },
        async updateUserInsight() { return null; },
        async listConversationEvents() { return []; },
        async listRecentMessages() { return []; },
        async listRecentActions() { return []; },
        async listRecentSettingChanges() { return []; },
        async listRecentJobRuns() { return []; },
        async listRecentArtifacts() { return []; },
        async listDomainKnowledge() { return []; },
        async listUserPreferences() { return []; }
    };
}

function getAgentEventStore() {
    if (store) return store;

    try {
        loadKuzu();
    } catch (error) {
        store = buildDisabledEventStore(error || getKuzuLoadError());
        return store;
    }

    store = new KuzuEventStore({
        Logger,
        baseDir: CONFIG.ROOT_DIR || CONFIG.APP_ROOT_DIR || process.cwd()
    });
    return store;
}

module.exports = {
    getAgentEventStore
};
