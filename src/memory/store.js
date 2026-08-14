const Logger = require('../logger');
const CONFIG = require('../config-loader');
const { KuzuEventStore, loadKuzu, getKuzuLoadError } = require('./event-store');

let store = null;
let loggedDisabledReason = false;
let initializationReported = false;

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
        async listUserPreferences() { return []; },
        getLocalOwnerIdentity() { return null; },
        async getOwnerMemoryStats() { return { owner_user_id: '', event_count: 0, artifact_count: 0, orphan_event_count: 0, orphan_artifact_count: 0 }; }
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

async function initializeAgentMemory() {
    const eventStore = getAgentEventStore();
    if (eventStore.disabled) return false;

    try {
        const initialized = await eventStore.initialize();
        if (initialized === false) return false;

        if (!initializationReported) {
            initializationReported = true;
            const ownerUserId = eventStore.getLocalOwnerIdentity?.()?.owner_user_id || '';
            Logger.info(`✅ [AgentMemory] 지능형 메모리 준비 완료${ownerUserId ? ` (owner=${ownerUserId})` : ''}`);
        }
        return true;
    } catch (error) {
        Logger.warn(`⚠️ [AgentMemory] 시작 시 초기화에 실패했습니다. UI는 계속 실행합니다: ${error.message}`);
        return false;
    }
}

module.exports = {
    getAgentEventStore,
    initializeAgentMemory
};
