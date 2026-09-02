const Logger = require('../logger');
const CONFIG = require('../config-loader');
const { KuzuEventStore, loadKuzu, getKuzuLoadError } = require('./event-store');
const { createVolatileRecommendationStore } = require('../recommendations/lifecycle-store');

let store = null;
let loggedDisabledReason = false;
let initializationReported = false;

function buildDisabledEventStore(reason) {
    const message = String(reason?.message || 'unknown error');
    const recommendationStore = createVolatileRecommendationStore({ reason: message });

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
        async recordInteractionMessage() { return null; },
        async getFeedbackTarget() { return null; },
        async recordShoppingItem() { return null; },
        async recordTopic() { return null; },
        async recordActivityLifecycle() { return null; },
        async updateUserInsight() { return null; },
        async listConversationEvents() { return []; },
        async listRecentMessages() { return []; },
        async listRecentActions() { return []; },
        async listRecentSettingChanges() { return []; },
        async listRecentJobRuns() { return []; },
        async listRecentArtifacts() { return []; },
        async listOwnerEvents() { return []; },
        async listOwnerBlogPublishResultEvents() { return []; },
        async listOwnerJobRuns() { return []; },
        async listOwnerArtifacts() { return []; },
        async getOwnerActivitySignalSummary(ownerUserId = '', options = {}) {
            const requestedDomains = Array.isArray(options.domains)
                ? options.domains.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)
                : [];
            return {
                owner_user_id: String(ownerUserId || '').trim(),
                domains: requestedDomains.length > 0 ? requestedDomains : ['blog', 'shopping', 'sns'],
                signals: [],
                counts_by_domain: { blog: 0, shopping: 0, sns: 0 },
                counts_by_stage: { observed: 0, generated: 0, saved: 0, selected: 0, drafted: 0, scheduled: 0, published: 0, feedback: 0 },
                counts_by_strength: { weak: 0, medium: 0, strong: 0, explicit: 0 },
                scanned_evidence_count: 0,
                supported_evidence_count: 0,
                filtered_evidence_count: 0,
                excluded_evidence_count: 0,
                truncated: false
            };
        },
        async listOwnerTopicFacets() { return []; },
        async getOwnerTopicSemanticSummary(ownerUserId = '') {
            return {
                owner_user_id: String(ownerUserId || '').trim(),
                keywords: [],
                categories: [],
                platforms: []
            };
        },
        async getOwnerProfileProjection(ownerUserId = '') {
            return {
                schema_version: 1,
                projection_kind: 'owner_profile',
                owner_user_id: String(ownerUserId || '').trim(),
                generated_at: new Date().toISOString(),
                interests: { keywords: [], categories: [], platforms: [] },
                activity: { counts_by_domain: {}, counts_by_stage: {}, counts_by_strength: {}, recent_subjects: [] },
                feedback: { counts: { helpful: 0, not_helpful: 0, accepted: 0, rejected: 0, unknown: 0 }, recent: [] },
                evidence_summary: { scanned_count: 0, supported_count: 0, excluded_count: 0, truncated: false }
            };
        },
        async listDomainKnowledge() { return []; },
        async listUserPreferences() { return []; },
        getLocalOwnerIdentity() { return null; },
        async getOwnerMemoryStats() { return { owner_user_id: '', event_count: 0, artifact_count: 0, orphan_event_count: 0, orphan_artifact_count: 0 }; },
        async getOwnerCollectionAudit(ownerUserId = '') {
            return {
                schema_version: 1,
                owner_user_id: String(ownerUserId || '').trim(),
                scanned_event_count: 0,
                scanned_artifact_count: 0,
                event_types: {},
                channels: {},
                missing_provenance_count: 0,
                incomplete_provenance_count: 0,
                duplicate_logical_event_count: 0,
                duplicate_logical_keys: [],
                orphan_event_count: 0,
                orphan_artifact_count: 0,
                truncated: false
            };
        },
        createRecommendation: recommendationStore.createRecommendation.bind(recommendationStore),
        transitionRecommendation: recommendationStore.transitionRecommendation.bind(recommendationStore),
        getRecommendation: recommendationStore.getRecommendation.bind(recommendationStore),
        findActiveByDedupeKey: recommendationStore.findActiveByDedupeKey.bind(recommendationStore),
        listAvailableRecommendations: recommendationStore.listAvailableRecommendations.bind(recommendationStore),
        listRecommendations: recommendationStore.listRecommendations.bind(recommendationStore),
        reconcileDueRecommendations: recommendationStore.reconcileDueRecommendations.bind(recommendationStore),
        getRecommendationStoreStatus: recommendationStore.getRecommendationStoreStatus.bind(recommendationStore)
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
        store = buildDisabledEventStore(error);
        return false;
    }
}

module.exports = {
    getAgentEventStore,
    initializeAgentMemory
};
