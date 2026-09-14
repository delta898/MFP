const Logger = require('../logger');
const CONFIG = require('../config-loader');
const { createVolatileRecommendationStore } = require('../recommendations/lifecycle-store');
const { SQLiteEventStore } = require('./sqlite-event-store');
const {
    MEMORY_SIZE_THRESHOLDS,
    cleanupLegacyMemory,
    quarantineSQLiteMemory,
    totalDatabaseBytes,
    verifySQLiteStore,
    writeHealthMarker
} = require('./sqlite-lifecycle');

const MAINTENANCE_INITIAL_DELAY_MS = 5000;
const MAINTENANCE_INTERVAL_MS = 6 * 60 * 60 * 1000;

function buildDisabledEventStore(reason, logger = Logger) {
    const message = String(reason?.message || 'unknown error');
    const recommendationStore = createVolatileRecommendationStore({ reason: message });
    logger.warn(`⚠️ [AgentMemory] SQLite V2 메모리를 사용할 수 없어 이번 실행에서는 지능형 메모리를 제한합니다: ${message}`);
    if (process.platform === 'win32') {
        logger.warn('ℹ️ [AgentMemory] Dashboard와 작성·발행 기능은 계속 사용할 수 있습니다. 앱을 재시작하면 새 메모리 저장소 준비를 다시 시도합니다.');
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
            return { owner_user_id: String(ownerUserId || '').trim(), keywords: [], categories: [], platforms: [] };
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
        getRecommendationStoreStatus: recommendationStore.getRecommendationStoreStatus.bind(recommendationStore),
        async runMaintenance() { return null; },
        close() { }
    };
}

function createAgentMemoryController(options = {}) {
    const logger = options.Logger || Logger;
    const baseDir = String(options.baseDir || CONFIG.ROOT_DIR || CONFIG.APP_ROOT_DIR || process.cwd());
    const createStore = options.createStore || (() => new SQLiteEventStore({ Logger: logger, baseDir }));
    const lifecycle = {
        cleanupLegacyMemory: options.cleanupLegacyMemory || cleanupLegacyMemory,
        quarantineSQLiteMemory: options.quarantineSQLiteMemory || quarantineSQLiteMemory,
        verifySQLiteStore: options.verifySQLiteStore || verifySQLiteStore,
        writeHealthMarker: options.writeHealthMarker || writeHealthMarker
    };
    const safeMode = options.safeMode === true;
    const scheduleMaintenance = options.scheduleMaintenance !== false;
    let backend = safeMode ? buildDisabledEventStore(new Error('safe mode'), logger) : createStore();
    let initPromise = null;
    let initializationReported = false;
    let maintenanceTimer = null;
    let ready = false;

    const facade = new Proxy({}, {
        get(_target, property) {
            const value = backend[property];
            if (typeof value !== 'function') return value;
            if (property === 'getLocalOwnerIdentity' || property === 'getRecommendationStoreStatus') {
                return value.bind(backend);
            }
            if (property === 'close') return close;
            return async (...args) => {
                if (!ready && !backend.disabled) await initialize();
                const current = backend[property];
                if (typeof current !== 'function') return null;
                return current.apply(backend, args);
            };
        }
    });

    function replaceWithFreshStore() {
        backend = createStore();
        return backend;
    }

    function quarantineCurrentStore(reason) {
        try { backend.close?.(); } catch (_ignore) { }
        const moved = lifecycle.quarantineSQLiteMemory(baseDir);
        logger.warn(`⚠️ [AgentMemory] SQLite V2 저장소를 격리하고 새로 준비합니다: ${String(reason?.message || reason)}`);
        if (moved.length > 0) logger.warn(`ℹ️ [AgentMemory] 격리된 파일 수: ${moved.length}`);
        return replaceWithFreshStore();
    }

    async function initializeCandidate() {
        await backend.initialize();
        const diagnostics = backend.database?.diagnostics?.() || {};
        if (totalDatabaseBytes(diagnostics) >= MEMORY_SIZE_THRESHOLDS.rebuild_bytes) {
            quarantineCurrentStore(new Error('SQLite V2가 재생성 기준 크기를 초과했습니다.'));
            await backend.initialize();
        }
        return lifecycle.verifySQLiteStore(backend);
    }

    async function runMaintenance() {
        if (backend.disabled || typeof backend.runMaintenance !== 'function') return;
        try {
            const result = await backend.runMaintenance();
            const bytes = totalDatabaseBytes(result?.after || {});
            if (bytes >= MEMORY_SIZE_THRESHOLDS.rebuild_bytes) {
                logger.warn('⚠️ [AgentMemory] SQLite V2가 512MB를 초과했습니다. 다음 시작 때 안전하게 재생성합니다.');
            } else if (bytes >= MEMORY_SIZE_THRESHOLDS.aggressive_bytes) {
                backend.database?.checkpoint?.('TRUNCATE');
                backend.database?.incrementalVacuum?.(4096);
                logger.warn('⚠️ [AgentMemory] SQLite V2가 256MB를 초과해 강화된 정리를 수행했습니다.');
            } else if (bytes >= MEMORY_SIZE_THRESHOLDS.warning_bytes) {
                logger.warn(`⚠️ [AgentMemory] SQLite V2 크기가 ${Math.ceil(bytes / 1024 / 1024)}MB 입니다. 자동 보존 정책으로 관리합니다.`);
            }
        } catch (error) {
            logger.warn(`⚠️ [AgentMemory] 백그라운드 정리를 다음 주기로 미룹니다: ${error.message}`);
        }
    }

    function scheduleNextMaintenance(delay = MAINTENANCE_INITIAL_DELAY_MS) {
        if (!scheduleMaintenance || backend.disabled || maintenanceTimer) return;
        maintenanceTimer = setTimeout(async () => {
            maintenanceTimer = null;
            await runMaintenance();
            scheduleNextMaintenance(MAINTENANCE_INTERVAL_MS);
        }, delay);
        maintenanceTimer.unref?.();
    }

    async function initialize() {
        if (ready) return true;
        if (safeMode || backend.disabled) return false;
        if (initPromise) return initPromise;
        initPromise = (async () => {
            let marker;
            try {
                marker = await initializeCandidate();
            } catch (firstError) {
                try {
                    quarantineCurrentStore(firstError);
                    marker = await initializeCandidate();
                } catch (recoveryError) {
                    logger.warn(`⚠️ [AgentMemory] SQLite V2 재생성에도 실패했습니다. UI는 계속 실행합니다: ${recoveryError.message}`);
                    backend = buildDisabledEventStore(recoveryError, logger);
                    ready = false;
                    return false;
                }
            }

            let markerWritten = false;
            try {
                lifecycle.writeHealthMarker(baseDir, marker);
                markerWritten = true;
            } catch (error) {
                logger.warn(`⚠️ [AgentMemory] V2 건강 상태 기록에 실패해 legacy 정리를 미룹니다: ${error.message}`);
            }
            if (markerWritten) {
                try {
                    const cleanup = lifecycle.cleanupLegacyMemory(baseDir);
                    if (cleanup.removed.length > 0) logger.info(`🧹 [AgentMemory] Legacy V1 파일 ${cleanup.removed.length}개를 정리했습니다.`);
                    if (cleanup.failed.length > 0) logger.warn(`⚠️ [AgentMemory] Legacy V1 파일 ${cleanup.failed.length}개는 사용 중이어서 다음 시작에 다시 정리합니다.`);
                } catch (error) {
                    logger.warn(`⚠️ [AgentMemory] Legacy V1 정리를 다음 시작으로 미룹니다: ${error.message}`);
                }
            }
            if (!initializationReported) {
                initializationReported = true;
                logger.info(`✅ [AgentMemory] SQLite V2 준비 완료${marker.owner_user_id ? ` (owner=${marker.owner_user_id})` : ''}`);
            }
            ready = true;
            scheduleNextMaintenance();
            return true;
        })().finally(() => {
            initPromise = null;
        });
        return initPromise;
    }

    function close() {
        if (maintenanceTimer) clearTimeout(maintenanceTimer);
        maintenanceTimer = null;
        backend.close?.();
        ready = false;
    }

    return { close, facade, initialize, runMaintenance, testing: { getBackend: () => backend } };
}

let controller = null;

function getController() {
    if (!controller) {
        controller = createAgentMemoryController({
            safeMode: String(process.env.BLOG_GENIUS_SAFE_MODE || '').toLowerCase() === 'true'
        });
    }
    return controller;
}

function getAgentEventStore() {
    return getController().facade;
}

async function initializeAgentMemory() {
    return getController().initialize();
}

function closeAgentMemory() {
    controller?.close();
}

module.exports = {
    MAINTENANCE_INITIAL_DELAY_MS,
    MAINTENANCE_INTERVAL_MS,
    buildDisabledEventStore,
    closeAgentMemory,
    createAgentMemoryController,
    getAgentEventStore,
    initializeAgentMemory
};
