const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { normalizeInteractionProvenance } = require('./interaction-provenance');
const { resolveArtifactFeedbackTarget } = require('./feedback-target');
const { buildPreferenceUpdatesFromEvent } = require('./extractors/preferences');
const { LocalOwnerIdentity } = require('../identity/local-owner-identity');
const { buildOwnerActivitySignalSummary } = require('./owner-activity-signals');
const { TOPIC_FACET_KINDS, TOPIC_FACET_SCOPES, buildTopicFacets } = require('./topic-semantics');
const { normalizeActivityEvidence } = require('./activity-lifecycle');

const OWNER_IDENTITY_MIGRATION_ID = '002_owner_identity';
const OWNER_IDENTITY_MIGRATION_VERSION = 2;
const TOPIC_SEMANTICS_MIGRATION_ID = '003_topic_semantics';
const TOPIC_SEMANTICS_MIGRATION_VERSION = 3;

let cachedKuzu = null;
let cachedKuzuLoadError = null;

function loadKuzu() {
    if (cachedKuzu) return cachedKuzu;
    if (cachedKuzuLoadError) throw cachedKuzuLoadError;

    try {
        cachedKuzu = require('kuzu');
        return cachedKuzu;
    } catch (error) {
        cachedKuzuLoadError = error;
        throw error;
    }
}

function getKuzuLoadError() {
    return cachedKuzuLoadError;
}

class KuzuEventStore {
    constructor(options = {}) {
        this.Logger = options.Logger || console;
        this.baseDir = String(options.baseDir || process.cwd());
        this.dbPath = String(options.dbPath || path.join(this.baseDir, 'data', 'agent_memory_db'));
        this.ownerIdentity = options.ownerIdentity || new LocalOwnerIdentity({ baseDir: this.baseDir });
        this.owner = null;
        this.db = null;
        this.conn = null;
        this.isInitialized = false;
        this.initPromise = null;
    }

    async _executeQuery(query, params = {}) {
        if (!params || Object.keys(params).length === 0) {
            return this.conn.query(query);
        }
        const prepared = await this.conn.prepare(query);
        return this.conn.execute(prepared, params);
    }

    async initialize() {
        if (this.isInitialized) return;
        if (this.initPromise) return this.initPromise;

        this.initPromise = (async () => {
            const dataDir = path.dirname(this.dbPath);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }

            try {
                if (fs.existsSync(this.dbPath)) {
                    const stats = fs.statSync(this.dbPath);
                    const sizeBytes = Number(stats.size || 0);
                    const sizeMb = Math.round(sizeBytes / (1024 * 1024));
                    if (sizeMb >= 512) {
                        this.Logger.warn(`⚠️ [AgentMemory] agent_memory_db 크기가 ${sizeMb}MB 입니다. 현재 저장 정책으로 재시작하려면 scripts/reset_agent_memory_db.sh 실행을 검토하세요.`);
                    }
                }
            } catch (_ignore) { }

            const kuzu = loadKuzu();
            this.db = new kuzu.Database(this.dbPath);
            this.conn = new kuzu.Connection(this.db);

            const queries = [
                'CREATE NODE TABLE AgentUserNode(id STRING, channel STRING, username STRING, created_at TIMESTAMP, PRIMARY KEY(id))',
                'CREATE NODE TABLE ConversationNode(id STRING, channel STRING, started_at TIMESTAMP, last_activity_at TIMESTAMP, PRIMARY KEY(id))',
                'CREATE NODE TABLE EventNode(id STRING, event_type STRING, timestamp TIMESTAMP, actor_type STRING, actor_id STRING, conversation_id STRING, message_id STRING, payload_json STRING, PRIMARY KEY(id))',
                'CREATE NODE TABLE MessageNode(id STRING, role STRING, text STRING, timestamp TIMESTAMP, channel_message_id STRING, PRIMARY KEY(id))',
                'CREATE NODE TABLE ActionNode(id STRING, type STRING, domain STRING, name STRING, params_json STRING, status STRING, timestamp TIMESTAMP, PRIMARY KEY(id))',
                'CREATE NODE TABLE SettingChangeNode(id STRING, domain STRING, setting_key STRING, before_json STRING, after_json STRING, timestamp TIMESTAMP, PRIMARY KEY(id))',
                'CREATE NODE TABLE JobRunNode(id STRING, job_name STRING, status STRING, started_at TIMESTAMP, finished_at TIMESTAMP, result_json STRING, PRIMARY KEY(id))',
                'CREATE NODE TABLE ArtifactNode(id STRING, artifact_type STRING, title STRING, summary STRING, payload_json STRING, timestamp TIMESTAMP, PRIMARY KEY(id))',
                'CREATE NODE TABLE PreferenceNode(id STRING, name STRING, value_json STRING, confidence DOUBLE, evidence_count INT64, updated_at TIMESTAMP, PRIMARY KEY(id))',
                'CREATE NODE TABLE SuggestionNode(id STRING, type STRING, summary STRING, payload_json STRING, status STRING, created_at TIMESTAMP, PRIMARY KEY(id))',
                'CREATE NODE TABLE DomainKnowledgeNode(id STRING, domain STRING, canonical_value STRING, aliases_json STRING, confidence DOUBLE, evidence_count INT64, updated_at TIMESTAMP, PRIMARY KEY(id))',
                'CREATE NODE TABLE OwnerNode(id STRING, identity_kind STRING, created_at TIMESTAMP, PRIMARY KEY(id))',
                'CREATE NODE TABLE MemoryMigrationNode(id STRING, version INT64, status STRING, applied_at TIMESTAMP, details_json STRING, PRIMARY KEY(id))',
                'CREATE NODE TABLE TopicFacetNode(id STRING, kind STRING, scope STRING, normalized_value STRING, display_value STRING, created_at TIMESTAMP, PRIMARY KEY(id))',
                'CREATE REL TABLE UserHAS_CONVERSATION(FROM AgentUserNode TO ConversationNode)',
                'CREATE REL TABLE ConversationHAS_EVENT(FROM ConversationNode TO EventNode)',
                'CREATE REL TABLE UserTRIGGERED_EVENT(FROM AgentUserNode TO EventNode)',
                'CREATE REL TABLE ConversationHAS_MESSAGE(FROM ConversationNode TO MessageNode)',
                'CREATE REL TABLE UserSENT_MESSAGE(FROM AgentUserNode TO MessageNode)',
                'CREATE REL TABLE MessagePARSED_TO_ACTION(FROM MessageNode TO ActionNode)',
                'CREATE REL TABLE ActionCHANGED_SETTING(FROM ActionNode TO SettingChangeNode)',
                'CREATE REL TABLE ActionTRIGGERED_JOB(FROM ActionNode TO JobRunNode)',
                'CREATE REL TABLE ActionPRODUCED_ARTIFACT(FROM ActionNode TO ArtifactNode)',
                'CREATE REL TABLE EventHAS_ARTIFACT(FROM EventNode TO ArtifactNode)',
                'CREATE REL TABLE UserHAS_PREFERENCE(FROM AgentUserNode TO PreferenceNode)',
                'CREATE REL TABLE UserACCEPTED_SUGGESTION(FROM AgentUserNode TO SuggestionNode)',
                'CREATE REL TABLE UserREJECTED_SUGGESTION(FROM AgentUserNode TO SuggestionNode)',
                'CREATE REL TABLE PreferenceDERIVED_FROM_ACTION(FROM PreferenceNode TO ActionNode)',
                'CREATE REL TABLE DomainKnowledgeDERIVED_FROM_ACTION(FROM DomainKnowledgeNode TO ActionNode)',
                'CREATE REL TABLE SuggestionDERIVED_FROM_ACTION(FROM SuggestionNode TO ActionNode)',
                'CREATE REL TABLE EventHAS_ACTION(FROM EventNode TO ActionNode)',
                'CREATE REL TABLE EventHAS_SUGGESTION(FROM EventNode TO SuggestionNode)',
                'CREATE REL TABLE OwnerHAS_ACTOR(FROM OwnerNode TO AgentUserNode)',
                'CREATE REL TABLE OwnerOWNS_EVENT(FROM OwnerNode TO EventNode)',
                'CREATE REL TABLE OwnerOWNS_ARTIFACT(FROM OwnerNode TO ArtifactNode)',
                'CREATE REL TABLE ArtifactHAS_TOPIC_FACET(FROM ArtifactNode TO TopicFacetNode)'
            ];

            for (const query of queries) {
                try {
                    await this._executeQuery(query);
                } catch (error) {
                    if (!String(error.message || '').includes('already exists')) throw error;
                }
            }

            this.owner = await this._resolveOwnerIdentityDirect();
            await this._runOwnerIdentityMigrationDirect(this.owner);
            await this._runTopicSemanticsMigrationDirect();
            this.isInitialized = true;
        })();

        return this.initPromise;
    }

    async _runQuery(query, params = {}) {
        await this.initialize();
        return this._executeQuery(query, params);
    }

    async _resolveOwnerIdentityDirect() {
        if (typeof this.ownerIdentity.hasStoredIdentity !== 'function' || this.ownerIdentity.hasStoredIdentity()) {
            return this.ownerIdentity.resolve();
        }

        const res = await this._executeQuery(
            'MATCH (o:OwnerNode {identity_kind: $identity_kind}) RETURN o.id AS id, o.created_at AS created_at ORDER BY o.created_at ASC',
            { identity_kind: 'local' }
        );
        const owners = [];
        while (res.hasNext()) {
            const row = await res.getNext();
            owners.push({ id: String(row.id || '').trim(), created_at: String(row.created_at || '').trim() });
        }

        if (owners.length > 1) {
            throw new Error('로컬 Owner가 여러 개이므로 identity 파일을 자동 복구할 수 없습니다.');
        }
        if (owners.length === 1 && owners[0].id) {
            const parsedCreatedAt = new Date(owners[0].created_at);
            const recovered = this.ownerIdentity.adopt({
                owner_user_id: owners[0].id,
                created_at: Number.isNaN(parsedCreatedAt.getTime()) ? new Date().toISOString() : parsedCreatedAt.toISOString()
            });
            if (this.Logger && typeof this.Logger.info === 'function') {
                this.Logger.info('✅ [AgentMemory] GraphDB의 기존 Local Owner에서 identity 파일을 복구했습니다.');
            }
            return recovered;
        }
        return this.ownerIdentity.resolve();
    }

    async _ensureOwnerDirect(owner = {}) {
        const ownerUserId = String(owner.owner_user_id || '').trim();
        if (!ownerUserId) throw new Error('owner_user_id가 필요합니다.');
        const createdAt = String(owner.created_at || new Date().toISOString()).replace('T', ' ').replace('Z', '');
        await this._executeQuery(
            'MERGE (o:OwnerNode {id: $id}) ON CREATE SET o.identity_kind = $identity_kind, o.created_at = CAST($created_at AS TIMESTAMP) ON MATCH SET o.identity_kind = $identity_kind',
            {
                id: ownerUserId,
                identity_kind: String(owner.identity_kind || 'local').trim() || 'local',
                created_at: createdAt
            }
        );
        return ownerUserId;
    }

    async _isMigrationCompleteDirect(migrationId) {
        const res = await this._executeQuery(
            'MATCH (m:MemoryMigrationNode {id: $id}) RETURN m.status AS status LIMIT 1',
            { id: String(migrationId || '').trim() }
        );
        if (!res.hasNext()) return false;
        const row = await res.getNext();
        return String(row.status || '').trim() === 'completed';
    }

    async _countDirect(query, params = {}) {
        const res = await this._executeQuery(query, params);
        if (!res.hasNext()) return 0;
        const row = await res.getNext();
        return Number(row.count || row[0] || 0);
    }

    async _runOwnerIdentityMigrationDirect(owner = {}) {
        const ownerUserId = await this._ensureOwnerDirect(owner);
        if (await this._isMigrationCompleteDirect(OWNER_IDENTITY_MIGRATION_ID)) return;

        await this._executeQuery(
            'MATCH (o:OwnerNode {id: $owner_id}), (u:AgentUserNode) MERGE (o)-[:OwnerHAS_ACTOR]->(u)',
            { owner_id: ownerUserId }
        );
        await this._executeQuery(
            'MATCH (o:OwnerNode {id: $owner_id}), (e:EventNode) MERGE (o)-[:OwnerOWNS_EVENT]->(e)',
            { owner_id: ownerUserId }
        );
        await this._executeQuery(
            'MATCH (o:OwnerNode {id: $owner_id}), (a:ArtifactNode) MERGE (o)-[:OwnerOWNS_ARTIFACT]->(a)',
            { owner_id: ownerUserId }
        );

        const eventCount = await this._countDirect(
            'MATCH (o:OwnerNode {id: $owner_id})-[:OwnerOWNS_EVENT]->(e:EventNode) RETURN count(e) AS count',
            { owner_id: ownerUserId }
        );
        const artifactCount = await this._countDirect(
            'MATCH (o:OwnerNode {id: $owner_id})-[:OwnerOWNS_ARTIFACT]->(a:ArtifactNode) RETURN count(a) AS count',
            { owner_id: ownerUserId }
        );
        const appliedAt = new Date().toISOString().replace('T', ' ').replace('Z', '');
        await this._executeQuery(
            'MERGE (m:MemoryMigrationNode {id: $id}) ON CREATE SET m.version = $version, m.status = $status, m.applied_at = CAST($applied_at AS TIMESTAMP), m.details_json = $details_json ON MATCH SET m.version = $version, m.status = $status, m.applied_at = CAST($applied_at AS TIMESTAMP), m.details_json = $details_json',
            {
                id: OWNER_IDENTITY_MIGRATION_ID,
                version: OWNER_IDENTITY_MIGRATION_VERSION,
                status: 'completed',
                applied_at: appliedAt,
                details_json: JSON.stringify({ owner_user_id: ownerUserId, event_count: eventCount, artifact_count: artifactCount })
            }
        );
        if (this.Logger && typeof this.Logger.info === 'function') {
            this.Logger.info(`✅ [AgentMemory] Owner identity migration 완료 (events=${eventCount}, artifacts=${artifactCount})`);
        }
    }

    async _upsertTopicFacetDirect(artifactId, facet = {}, createdAt = '') {
        const resolvedArtifactId = String(artifactId || '').trim();
        const facetId = String(facet.id || '').trim();
        if (!resolvedArtifactId || !facetId) return false;
        const timestamp = String(createdAt || new Date().toISOString()).replace('T', ' ').replace('Z', '');
        await this._executeQuery(
            'MERGE (f:TopicFacetNode {id: $id}) ON CREATE SET f.kind = $kind, f.scope = $scope, f.normalized_value = $normalized_value, f.display_value = $display_value, f.created_at = CAST($created_at AS TIMESTAMP)',
            {
                id: facetId,
                kind: String(facet.kind || '').trim(),
                scope: String(facet.scope || '').trim(),
                normalized_value: String(facet.normalized_value || '').trim(),
                display_value: String(facet.display_value || '').trim(),
                created_at: timestamp
            }
        );
        await this._executeQuery(
            'MATCH (a:ArtifactNode {id: $artifact_id}), (f:TopicFacetNode {id: $facet_id}) MERGE (a)-[:ArtifactHAS_TOPIC_FACET]->(f)',
            { artifact_id: resolvedArtifactId, facet_id: facetId }
        );
        return true;
    }

    async _materializeTopicFacetsDirect(artifactId, payload = {}, createdAt = '') {
        const facets = buildTopicFacets(payload);
        for (const facet of facets) {
            await this._upsertTopicFacetDirect(artifactId, facet, createdAt);
        }
        return facets;
    }

    async _runTopicSemanticsMigrationDirect() {
        if (await this._isMigrationCompleteDirect(TOPIC_SEMANTICS_MIGRATION_ID)) return;

        const res = await this._executeQuery(
            'MATCH (a:ArtifactNode {artifact_type: $artifact_type}) RETURN a.id AS id, a.payload_json AS payload_json, a.timestamp AS timestamp ORDER BY a.timestamp ASC, a.id ASC',
            { artifact_type: 'topic' }
        );
        const topicRows = [];
        while (res.hasNext()) topicRows.push(await res.getNext());

        let topicArtifactCount = 0;
        let materializedArtifactCount = 0;
        for (const row of topicRows) {
            topicArtifactCount += 1;
            let payload = {};
            try { payload = JSON.parse(row.payload_json || '{}') || {}; } catch (_ignore) { payload = {}; }
            const facets = await this._materializeTopicFacetsDirect(row.id, payload);
            if (facets.length > 0) materializedArtifactCount += 1;
        }

        const facetCount = await this._countDirect(
            'MATCH (f:TopicFacetNode) RETURN count(f) AS count'
        );
        const relationshipCount = await this._countDirect(
            'MATCH (:ArtifactNode)-[r:ArtifactHAS_TOPIC_FACET]->(:TopicFacetNode) RETURN count(r) AS count'
        );
        const appliedAt = new Date().toISOString().replace('T', ' ').replace('Z', '');
        const details = {
            topic_artifact_count: topicArtifactCount,
            materialized_artifact_count: materializedArtifactCount,
            facet_count: facetCount,
            relationship_count: relationshipCount
        };
        await this._executeQuery(
            'MERGE (m:MemoryMigrationNode {id: $id}) ON CREATE SET m.version = $version, m.status = $status, m.applied_at = CAST($applied_at AS TIMESTAMP), m.details_json = $details_json ON MATCH SET m.version = $version, m.status = $status, m.applied_at = CAST($applied_at AS TIMESTAMP), m.details_json = $details_json',
            {
                id: TOPIC_SEMANTICS_MIGRATION_ID,
                version: TOPIC_SEMANTICS_MIGRATION_VERSION,
                status: 'completed',
                applied_at: appliedAt,
                details_json: JSON.stringify(details)
            }
        );
        if (this.Logger && typeof this.Logger.info === 'function') {
            this.Logger.info(`✅ [AgentMemory] Topic semantics migration 완료 (topics=${topicArtifactCount}, facets=${facetCount}, relations=${relationshipCount})`);
        }
    }

    async ensureUser(user = {}) {
        const id = String(user.id || '').trim();
        if (!id) return;
        const channel = String(user.channel || 'telegram').trim();
        const username = String(user.username || '').trim();
        const timestamp = new Date().toISOString().replace('T', ' ').replace('Z', '');
        await this._runQuery(
            'MERGE (u:AgentUserNode {id: $id}) ON CREATE SET u.channel = $channel, u.username = $username, u.created_at = CAST($created_at AS TIMESTAMP) ON MATCH SET u.channel = $channel, u.username = $username',
            { id, channel, username, created_at: timestamp }
        );
    }

    async ensureConversation(conversation = {}, user = {}) {
        const id = String(conversation.id || '').trim();
        if (!id) return;
        const channel = String(conversation.channel || user.channel || 'telegram').trim();
        const timestamp = new Date().toISOString().replace('T', ' ').replace('Z', '');
        await this._runQuery(
            'MERGE (c:ConversationNode {id: $id}) ON CREATE SET c.channel = $channel, c.started_at = CAST($started_at AS TIMESTAMP), c.last_activity_at = CAST($last_activity_at AS TIMESTAMP) ON MATCH SET c.last_activity_at = CAST($last_activity_at AS TIMESTAMP)',
            { id, channel, started_at: timestamp, last_activity_at: timestamp }
        );
        if (user?.id) {
            await this.ensureUser(user);
            await this._runQuery(
                'MATCH (u:AgentUserNode {id: $userId}), (c:ConversationNode {id: $conversationId}) MERGE (u)-[:UserHAS_CONVERSATION]->(c)',
                { userId: String(user.id), conversationId: id }
            );
        }
    }

    _messageNodeId(conversationId, channelMessageId) {
        const convo = String(conversationId || '').trim();
        const msg = String(channelMessageId || '').trim();
        if (!convo || !msg) return '';
        return `msg_${convo}_${msg}`;
    }

    _normalizeJson(value) {
        try {
            return JSON.stringify(value ?? {});
        } catch (_ignore) {
            return '{}';
        }
    }

    _compactString(value, maxLength = 400) {
        const text = String(value ?? '');
        if (text.length <= maxLength) return text;
        return `${text.slice(0, maxLength - 1)}…`;
    }

    _compactValue(value, options = {}) {
        const depth = Number.isFinite(Number(options.depth)) ? Number(options.depth) : 0;
        const maxDepth = Number.isFinite(Number(options.maxDepth)) ? Number(options.maxDepth) : 3;
        const maxArray = Number.isFinite(Number(options.maxArray)) ? Number(options.maxArray) : 8;
        const maxString = Number.isFinite(Number(options.maxString)) ? Number(options.maxString) : 400;

        if (value == null) return value;
        if (typeof value === 'string') return this._compactString(value, maxString);
        if (typeof value === 'number' || typeof value === 'boolean') return value;
        if (depth >= maxDepth) {
            if (Array.isArray(value)) return { truncated: true, count: value.length };
            if (typeof value === 'object') return { truncated: true };
            return value;
        }

        if (Array.isArray(value)) {
            return value.slice(0, maxArray).map((item) => this._compactValue(item, {
                depth: depth + 1,
                maxDepth,
                maxArray,
                maxString
            }));
        }

        if (typeof value === 'object') {
            const compacted = {};
            const deniedKeys = new Set([
                'memory',
                'recent_events',
                'recent_messages',
                'recent_actions',
                'recent_setting_changes',
                'recent_job_runs',
                'recent_artifacts',
                'preferences',
                'pending_confirmations',
                'runtimeContext'
            ]);
            Object.entries(value).forEach(([key, nested]) => {
                if (deniedKeys.has(String(key))) return;
                compacted[key] = this._compactValue(nested, {
                    depth: depth + 1,
                    maxDepth,
                    maxArray,
                    maxString
                });
            });
            return compacted;
        }

        return value;
    }

    _summarizeAction(action = {}) {
        return {
            id: String(action.id || '').trim(),
            type: String(action.type || '').trim(),
            domain: String(action.domain || '').trim(),
            name: String(action.name || '').trim(),
            params: this._compactValue(action.params || {}, { maxDepth: 2, maxArray: 6, maxString: 200 })
        };
    }

    _summarizePlan(plan = {}) {
        const steps = Array.isArray(plan.steps) ? plan.steps : [];
        return {
            id: String(plan.id || '').trim(),
            goal: this._compactString(plan.goal || '', 180),
            confirmation_mode: String(plan.confirmation_mode || '').trim(),
            step_count: steps.length,
            steps: steps.slice(0, 8).map((step) => ({
                id: String(step?.id || '').trim(),
                requires_confirmation: !!step?.requires_confirmation,
                action: this._summarizeAction(step?.action || {})
            }))
        };
    }

    _summarizeResult(result = {}) {
        const data = result && typeof result.data === 'object' ? result.data : {};
        const ideas = Array.isArray(data.ideas) ? data.ideas : [];
        const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
        return {
            success: result?.success !== false,
            message: this._compactString(result?.message || '', 240),
            data: {
                ...Object.fromEntries(Object.entries(this._compactValue(data, { maxDepth: 2, maxArray: 6, maxString: 180 }) || {}).filter(([key]) => !['ideas', 'suggestions'].includes(key))),
                ideas_count: ideas.length,
                idea_titles: ideas.slice(0, 5).map((item) => this._compactString(item?.title || '', 120)).filter(Boolean),
                suggestions_count: suggestions.length,
                suggestion_summaries: suggestions.slice(0, 5).map((item) => this._compactString(item?.summary || '', 140)).filter(Boolean)
            }
        };
    }

    _summarizeConfirmationPayload(payload = {}) {
        const actions = Array.isArray(payload.actions) ? payload.actions : [];
        const previews = Array.isArray(payload.previews) ? payload.previews : [];
        return {
            id: String(payload.id || '').trim(),
            kind: String(payload.kind || 'confirmation').trim(),
            status: String(payload.status || 'pending').trim(),
            superseded_confirmation_id: String(payload.supersededConfirmationId || payload.superseded_confirmation_id || '').trim(),
            correction: payload.correction ? this._compactValue(payload.correction, { maxDepth: 2, maxArray: 4, maxString: 140 }) : null,
            action_ids: actions.map((item) => String(item?.id || '').trim()).filter(Boolean),
            preview_summaries: previews.slice(0, 4).map((item) => this._compactString(item?.preview?.summary || '', 180)).filter(Boolean),
            plan: payload.plan ? this._summarizePlan(payload.plan) : null
        };
    }

    _summarizeArtifactPayload(payload = {}) {
        return {
            title: this._compactString(payload?.title || '', 180),
            summary: this._compactString(payload?.summary || '', 260),
            reason: this._compactString(payload?.reason || '', 220),
            keywords: Array.isArray(payload?.keywords) ? payload.keywords.slice(0, 8).map((item) => this._compactString(item, 60)).filter(Boolean) : [],
            source: String(payload?.source || '').trim(),
            feedback_key: String(payload?.feedback_key || '').trim()
        };
    }

    _summarizeSuggestionPayload(payload = {}) {
        return {
            source: String(payload?.source || '').trim(),
            preference: String(payload?.preference || '').trim(),
            top_title: this._compactString(payload?.top_title || '', 140),
            job_name: String(payload?.job_name || '').trim(),
            pending_count: Number(payload?.pending_count || 0),
            feedback_key: String(payload?.feedback_key || '').trim(),
            value: this._compactValue(payload?.value || {}, { maxDepth: 2, maxArray: 6, maxString: 120 })
        };
    }

    _summarizeEventPayload(eventType, payload = {}) {
        const compact = this._compactValue(payload, { maxDepth: 3, maxArray: 8, maxString: 240 }) || {};

        if (eventType === 'agent.intent.parsed') {
            return {
                envelope: {
                    version: String(payload.envelope?.version || '1.0'),
                    conversation_id: String(payload.envelope?.conversation_id || '').trim(),
                    message_id: String(payload.envelope?.message_id || '').trim(),
                    actions: Array.isArray(payload.envelope?.actions) ? payload.envelope.actions.map((action) => this._summarizeAction(action)) : []
                }
            };
        }

        if (eventType === 'agent.plan.created') {
            return {
                plan: this._summarizePlan(payload.plan || {})
            };
        }

        if (eventType === 'agent.confirmation.requested') {
            return this._summarizeConfirmationPayload(payload);
        }

        if (eventType === 'agent.confirmation.accepted' || eventType === 'agent.confirmation.rejected') {
            return {
                confirmation_id: String(payload.confirmation_id || '').trim(),
                decision: eventType.endsWith('accepted') ? 'accepted' : 'rejected'
            };
        }

        if (eventType.startsWith('capability.') && payload.action) {
            return {
                action: this._summarizeAction(payload.action),
                result: this._summarizeResult(payload.result || {}),
                plan: payload.plan ? this._summarizePlan(payload.plan) : null
            };
        }

        if (eventType === 'user.message.received') {
            return {
                text: this._compactString(payload.text || '', 500),
                intent: String(payload.intent || '').trim()
            };
        }

        if (eventType === 'agent.message.sent') {
            return {
                text: this._compactString(payload.text || '', 500),
                intent: String(payload.intent || '').trim()
            };
        }

        if (eventType === 'memory.insight.updated') {
            return {
                summary: this._compactString(payload.summary || '', 260)
            };
        }

        if (eventType === 'content.topic.registered') {
            return {
                subject: this._compactString(payload.subject || '', 180),
                category: this._compactString(payload.category || '', 80),
                platform: this._compactString(payload.platform || '', 80),
                keywords: this._compactString(payload.keywords || '', 200),
                instruction: this._compactString(payload.instruction || '', 240),
                source: this._compactString(payload.source || '', 80),
                request_id: this._compactString(payload.request_id || '', 300)
            };
        }

        if (eventType === 'shopping.item.recorded') {
            return {
                name: this._compactString(payload.name || '', 180),
                price: this._compactString(payload.price || '', 80),
                mall: this._compactString(payload.mall || '', 120),
                source: this._compactString(payload.source || '', 80),
                request_id: this._compactString(payload.request_id || '', 300)
            };
        }

        if (eventType.startsWith('suggestion.')) {
            return {
                suggestion_id: String(payload.suggestion_id || '').trim(),
                type: String(payload.type || '').trim(),
                summary: this._compactString(payload.summary || '', 200),
                feedback_key: String(payload.feedback_key || '').trim()
            };
        }

        if (eventType.startsWith('artifact.')) {
            return {
                artifact_id: String(payload.artifact_id || '').trim()
            };
        }

        if (eventType === 'domain.alias.accepted') {
            return {
                domain: String(payload.domain || '').trim(),
                raw_input: this._compactString(payload.raw_input || '', 120),
                canonical_value: this._compactString(payload.canonical_value || '', 120)
            };
        }

        return compact;
    }

    async _upsertMessageNode({ conversationId, actorId, actorType, channelMessageId, text, timestamp }) {
        const messageNodeId = this._messageNodeId(conversationId, channelMessageId);
        if (!messageNodeId) return null;

        await this._runQuery(
            'MERGE (m:MessageNode {id: $id}) ON CREATE SET m.role = $role, m.text = $text, m.timestamp = CAST($timestamp AS TIMESTAMP), m.channel_message_id = $channel_message_id ON MATCH SET m.role = $role, m.text = $text',
            {
                id: messageNodeId,
                role: String(actorType || 'user').trim(),
                text: String(text || '').trim(),
                timestamp,
                channel_message_id: String(channelMessageId || '').trim()
            }
        );

        if (conversationId) {
            await this._runQuery(
                'MATCH (c:ConversationNode {id: $conversation_id}), (m:MessageNode {id: $message_id}) MERGE (c)-[:ConversationHAS_MESSAGE]->(m)',
                { conversation_id: conversationId, message_id: messageNodeId }
            );
        }
        if (actorId) {
            await this._runQuery(
                'MATCH (u:AgentUserNode {id: $actor_id}), (m:MessageNode {id: $message_id}) MERGE (u)-[:UserSENT_MESSAGE]->(m)',
                { actor_id: actorId, message_id: messageNodeId }
            );
        }

        return messageNodeId;
    }

    async _upsertActionNode(action = {}, meta = {}) {
        const actionId = String(action.id || '').trim();
        if (!actionId) return null;

        const timestamp = String(meta.timestamp || new Date().toISOString()).replace('T', ' ').replace('Z', '');
        await this._runQuery(
            'MERGE (a:ActionNode {id: $id}) ON CREATE SET a.type = $type, a.domain = $domain, a.name = $name, a.params_json = $params_json, a.status = $status, a.timestamp = CAST($timestamp AS TIMESTAMP) ON MATCH SET a.type = $type, a.domain = $domain, a.name = $name, a.params_json = $params_json, a.status = $status',
            {
                id: actionId,
                type: String(action.type || '').trim(),
                domain: String(action.domain || '').trim(),
                name: String(action.name || '').trim(),
                params_json: this._normalizeJson(action.params),
                status: String(meta.status || 'parsed').trim(),
                timestamp
            }
        );

        if (meta.eventId) {
            await this._runQuery(
                'MATCH (e:EventNode {id: $event_id}), (a:ActionNode {id: $action_id}) MERGE (e)-[:EventHAS_ACTION]->(a)',
                { event_id: String(meta.eventId || '').trim(), action_id: actionId }
            );
        }

        const messageNodeId = this._messageNodeId(meta.conversationId, meta.messageId);
        if (messageNodeId) {
            await this._runQuery(
                'MATCH (m:MessageNode {id: $message_id}), (a:ActionNode {id: $action_id}) MERGE (m)-[:MessagePARSED_TO_ACTION]->(a)',
                { message_id: messageNodeId, action_id: actionId }
            );
        }

        return actionId;
    }

    async _createSettingChangeNode(change = {}, meta = {}) {
        const id = String(change.id || `setting_${crypto.randomUUID()}`);
        const timestamp = String(meta.timestamp || new Date().toISOString()).replace('T', ' ').replace('Z', '');
        await this._runQuery(
            'CREATE (s:SettingChangeNode {id: $id, domain: $domain, setting_key: $setting_key, before_json: $before_json, after_json: $after_json, timestamp: CAST($timestamp AS TIMESTAMP)})',
            {
                id,
                domain: String(change.domain || '').trim(),
                setting_key: String(change.key || '').trim(),
                before_json: this._normalizeJson(change.before),
                after_json: this._normalizeJson(change.after),
                timestamp
            }
        );
        if (meta.actionId) {
            await this._runQuery(
                'MATCH (a:ActionNode {id: $action_id}), (s:SettingChangeNode {id: $setting_id}) MERGE (a)-[:ActionCHANGED_SETTING]->(s)',
                { action_id: String(meta.actionId || '').trim(), setting_id: id }
            );
        }
        return id;
    }

    async _createJobRunNode(job = {}, meta = {}) {
        const id = String(job.id || `job_${crypto.randomUUID()}`);
        const startedAt = String(job.started_at || meta.timestamp || new Date().toISOString()).replace('T', ' ').replace('Z', '');
        const finishedAt = String(job.finished_at || meta.timestamp || new Date().toISOString()).replace('T', ' ').replace('Z', '');
        await this._runQuery(
            'CREATE (j:JobRunNode {id: $id, job_name: $job_name, status: $status, started_at: CAST($started_at AS TIMESTAMP), finished_at: CAST($finished_at AS TIMESTAMP), result_json: $result_json})',
            {
                id,
                job_name: String(job.job_name || '').trim(),
                status: String(job.status || '').trim(),
                started_at: startedAt,
                finished_at: finishedAt,
                result_json: this._normalizeJson(job.result)
            }
        );
        if (meta.actionId) {
            await this._runQuery(
                'MATCH (a:ActionNode {id: $action_id}), (j:JobRunNode {id: $job_id}) MERGE (a)-[:ActionTRIGGERED_JOB]->(j)',
                { action_id: String(meta.actionId || '').trim(), job_id: id }
            );
        }
        return id;
    }

    async _createArtifactNode(artifact = {}, meta = {}) {
        const id = String(artifact.id || `artifact_${crypto.randomUUID()}`);
        const timestamp = String(meta.timestamp || new Date().toISOString()).replace('T', ' ').replace('Z', '');
        await this._runQuery(
            'CREATE (a:ArtifactNode {id: $id, artifact_type: $artifact_type, title: $title, summary: $summary, payload_json: $payload_json, timestamp: CAST($timestamp AS TIMESTAMP)})',
            {
                id,
                artifact_type: String(artifact.artifact_type || '').trim(),
                title: String(artifact.title || '').trim(),
                summary: String(artifact.summary || '').trim(),
                payload_json: this._normalizeJson(artifact.payload),
                timestamp
            }
        );
        if (meta.actionId) {
            await this._runQuery(
                'MATCH (n:ActionNode {id: $action_id}), (a:ArtifactNode {id: $artifact_id}) MERGE (n)-[:ActionPRODUCED_ARTIFACT]->(a)',
                { action_id: String(meta.actionId || '').trim(), artifact_id: id }
            );
        }
        if (meta.ownerUserId) {
            await this._runQuery(
                'MATCH (o:OwnerNode {id: $owner_id}), (a:ArtifactNode {id: $artifact_id}) MERGE (o)-[:OwnerOWNS_ARTIFACT]->(a)',
                { owner_id: String(meta.ownerUserId || '').trim(), artifact_id: id }
            );
        }
        return id;
    }

    async _upsertPreferenceNode(preference = {}, meta = {}) {
        const userId = String(meta.userId || '').trim();
        const name = String(preference.name || '').trim();
        if (!userId || !name) return null;

        const id = `${userId}:${name}`;
        const timestamp = String(meta.timestamp || new Date().toISOString()).replace('T', ' ').replace('Z', '');

        const existingRes = await this._runQuery(
            'MATCH (p:PreferenceNode {id: $id}) RETURN p.confidence AS confidence, p.evidence_count AS evidence_count',
            { id }
        );

        let currentConfidence = 0;
        let currentEvidence = 0;
        if (existingRes.hasNext()) {
            const row = await existingRes.getNext();
            currentConfidence = Number(row.confidence || 0);
            currentEvidence = Number(row.evidence_count || 0);
        }

        const confidence = Number.isFinite(Number(preference.absoluteConfidence))
            ? Math.max(0, Math.min(1, Number(preference.absoluteConfidence)))
            : Math.max(0, Math.min(1, currentConfidence + Number(preference.confidenceDelta || 0.1)));
        const evidenceCount = currentEvidence + Number(preference.evidenceDelta || 1);

        await this._runQuery(
            'MERGE (p:PreferenceNode {id: $id}) ON CREATE SET p.name = $name, p.value_json = $value_json, p.confidence = $confidence, p.evidence_count = $evidence_count, p.updated_at = CAST($updated_at AS TIMESTAMP) ON MATCH SET p.name = $name, p.value_json = $value_json, p.confidence = $confidence, p.evidence_count = $evidence_count, p.updated_at = CAST($updated_at AS TIMESTAMP)',
            {
                id,
                name,
                value_json: this._normalizeJson(preference.value),
                confidence,
                evidence_count: evidenceCount,
                updated_at: timestamp
            }
        );

        await this._runQuery(
            'MATCH (u:AgentUserNode {id: $user_id}), (p:PreferenceNode {id: $preference_id}) MERGE (u)-[:UserHAS_PREFERENCE]->(p)',
            { user_id: userId, preference_id: id }
        );

        if (meta.actionId) {
            await this._runQuery(
                'MATCH (p:PreferenceNode {id: $preference_id}), (a:ActionNode {id: $action_id}) MERGE (p)-[:PreferenceDERIVED_FROM_ACTION]->(a)',
                { preference_id: id, action_id: String(meta.actionId || '').trim() }
            );
        }

        return {
            id,
            name,
            confidence,
            evidence_count: evidenceCount
        };
    }

    async _getSuggestionById(suggestionId) {
        const id = String(suggestionId || '').trim();
        if (!id) return null;
        const res = await this._runQuery(
            'MATCH (s:SuggestionNode {id: $id}) RETURN s.id AS id, s.type AS type, s.summary AS summary, s.payload_json AS payload_json, s.status AS status',
            { id }
        );
        if (!res.hasNext()) return null;
        const row = await res.getNext();
        return {
            id: row.id,
            type: row.type,
            summary: row.summary,
            status: row.status,
            payload: (() => { try { return JSON.parse(row.payload_json || '{}'); } catch (_ignore) { return {}; } })()
        };
    }

    async _getArtifactById(artifactId) {
        const id = String(artifactId || '').trim();
        if (!id) return null;
        const res = await this._runQuery(
            'MATCH (a:ArtifactNode {id: $id}) RETURN a.id AS id, a.artifact_type AS artifact_type, a.title AS title, a.summary AS summary, a.payload_json AS payload_json',
            { id }
        );
        if (!res.hasNext()) return null;
        const row = await res.getNext();
        return {
            id: row.id,
            artifact_type: row.artifact_type,
            title: row.title,
            summary: row.summary,
            payload: (() => { try { return JSON.parse(row.payload_json || '{}'); } catch (_ignore) { return {}; } })()
        };
    }

    async getFeedbackTarget(kind = '', targetId = '') {
        const normalizedKind = String(kind || '').trim().toLowerCase();
        if (normalizedKind !== 'artifact') return null;
        const artifact = await this._getArtifactById(targetId);
        if (!artifact) return null;
        return resolveArtifactFeedbackTarget(artifact);
    }

    async _upsertSuggestionFeedbackPreference(input = {}, meta = {}) {
        const userId = String(meta.userId || '').trim();
        const feedbackKey = String(input.feedbackKey || '').trim();
        if (!userId || !feedbackKey) return null;

        const preferenceId = `${userId}:suggestion_feedback.${feedbackKey}`;
        const name = `suggestion_feedback.${feedbackKey}`;
        const existingRes = await this._runQuery(
            'MATCH (p:PreferenceNode {id: $id}) RETURN p.value_json AS value_json',
            { id: preferenceId }
        );

        let currentValue = {
            accepted_count: 0,
            rejected_count: 0,
            helpful_count: 0,
            not_helpful_count: 0
        };
        if (existingRes.hasNext()) {
            const row = await existingRes.getNext();
            try {
                currentValue = {
                    ...currentValue,
                    ...(JSON.parse(row.value_json || '{}') || {})
                };
            } catch (_ignore) { }
        }

        const feedback = String(input.feedback || '').trim();
        if (feedback === 'accepted') currentValue.accepted_count += 1;
        if (feedback === 'rejected') currentValue.rejected_count += 1;
        if (feedback === 'helpful') currentValue.helpful_count += 1;
        if (feedback === 'not_helpful') currentValue.not_helpful_count += 1;

        const positive = currentValue.accepted_count + currentValue.helpful_count;
        const negative = currentValue.rejected_count + currentValue.not_helpful_count;
        const total = Math.max(1, positive + negative);
        const confidence = positive / total;

        return this._upsertPreferenceNode({
            name,
            value: {
                ...currentValue,
                feedback_key: feedbackKey,
                suggestion_type: input.suggestionType || '',
                last_feedback: feedback
            },
            absoluteConfidence: confidence,
            evidenceDelta: 1
        }, meta);
    }

    async _upsertArtifactFeedbackPreference(input = {}, meta = {}) {
        const userId = String(meta.userId || '').trim();
        const feedbackKey = String(input.feedbackKey || '').trim();
        if (!userId || !feedbackKey) return null;

        const preferenceId = `${userId}:artifact_feedback.${feedbackKey}`;
        const name = `artifact_feedback.${feedbackKey}`;
        const existingRes = await this._runQuery(
            'MATCH (p:PreferenceNode {id: $id}) RETURN p.value_json AS value_json',
            { id: preferenceId }
        );

        let currentValue = {
            helpful_count: 0,
            not_helpful_count: 0
        };
        if (existingRes.hasNext()) {
            const row = await existingRes.getNext();
            try {
                currentValue = {
                    ...currentValue,
                    ...(JSON.parse(row.value_json || '{}') || {})
                };
            } catch (_ignore) { }
        }

        const feedback = String(input.feedback || '').trim();
        if (feedback === 'helpful') currentValue.helpful_count += 1;
        if (feedback === 'not_helpful') currentValue.not_helpful_count += 1;

        const positive = currentValue.helpful_count;
        const negative = currentValue.not_helpful_count;
        const total = Math.max(1, positive + negative);
        const confidence = positive / total;

        return this._upsertPreferenceNode({
            name,
            value: {
                ...currentValue,
                feedback_key: feedbackKey,
                last_feedback: feedback
            },
            absoluteConfidence: confidence,
            evidenceDelta: 1
        }, meta);
    }

    async _upsertSuggestionNode(suggestion = {}, meta = {}) {
        const suggestionId = String(suggestion.id || '').trim();
        if (!suggestionId) return null;
        const createdAt = String(meta.timestamp || new Date().toISOString()).replace('T', ' ').replace('Z', '');
        await this._runQuery(
            'MERGE (s:SuggestionNode {id: $id}) ON CREATE SET s.type = $type, s.summary = $summary, s.payload_json = $payload_json, s.status = $status, s.created_at = CAST($created_at AS TIMESTAMP) ON MATCH SET s.type = $type, s.summary = $summary, s.payload_json = $payload_json, s.status = $status',
            {
                id: suggestionId,
                type: String(suggestion.type || 'confirmation').trim(),
                summary: String(suggestion.summary || '').trim(),
                payload_json: this._normalizeJson(suggestion.payload),
                status: String(suggestion.status || 'pending').trim(),
                created_at: createdAt
            }
        );
        if (meta.eventId) {
            await this._runQuery(
                'MATCH (e:EventNode {id: $event_id}), (s:SuggestionNode {id: $suggestion_id}) MERGE (e)-[:EventHAS_SUGGESTION]->(s)',
                { event_id: String(meta.eventId || '').trim(), suggestion_id: suggestionId }
            );
        }
        if (meta.actionIds && meta.actionIds.length > 0) {
            for (const actionId of meta.actionIds) {
                await this._runQuery(
                    'MATCH (s:SuggestionNode {id: $suggestion_id}), (a:ActionNode {id: $action_id}) MERGE (s)-[:SuggestionDERIVED_FROM_ACTION]->(a)',
                    { suggestion_id: suggestionId, action_id: String(actionId || '').trim() }
                );
            }
        }
        if (meta.actorId && meta.decision === 'accepted') {
            await this._runQuery(
                'MATCH (u:AgentUserNode {id: $actor_id}), (s:SuggestionNode {id: $suggestion_id}) MERGE (u)-[:UserACCEPTED_SUGGESTION]->(s)',
                { actor_id: String(meta.actorId || '').trim(), suggestion_id: suggestionId }
            );
        }
        if (meta.actorId && meta.decision === 'rejected') {
            await this._runQuery(
                'MATCH (u:AgentUserNode {id: $actor_id}), (s:SuggestionNode {id: $suggestion_id}) MERGE (u)-[:UserREJECTED_SUGGESTION]->(s)',
                { actor_id: String(meta.actorId || '').trim(), suggestion_id: suggestionId }
            );
        }
        return suggestionId;
    }

    async _upsertDomainKnowledgeNode(entry = {}, meta = {}) {
        const domain = String(entry.domain || '').trim();
        const canonicalValue = String(entry.canonical_value || '').trim();
        if (!domain || !canonicalValue) return null;

        const id = `${domain}:${canonicalValue}`;
        const timestamp = String(meta.timestamp || new Date().toISOString()).replace('T', ' ').replace('Z', '');
        const existingRes = await this._runQuery(
            'MATCH (d:DomainKnowledgeNode {id: $id}) RETURN d.aliases_json AS aliases_json, d.confidence AS confidence, d.evidence_count AS evidence_count',
            { id }
        );

        let aliases = [];
        let confidence = 0;
        let evidenceCount = 0;
        if (existingRes.hasNext()) {
            const row = await existingRes.getNext();
            try { aliases = JSON.parse(row.aliases_json || '[]') || []; } catch (_ignore) { aliases = []; }
            confidence = Number(row.confidence || 0);
            evidenceCount = Number(row.evidence_count || 0);
        }

        const nextAliases = Array.from(new Set([
            ...aliases.map((item) => String(item || '').trim()).filter(Boolean),
            ...((Array.isArray(entry.aliases) ? entry.aliases : []).map((item) => String(item || '').trim()).filter(Boolean))
        ]));
        const nextConfidence = Number.isFinite(Number(entry.absoluteConfidence))
            ? Math.max(0, Math.min(1, Number(entry.absoluteConfidence)))
            : Math.max(0, Math.min(1, confidence + Number(entry.confidenceDelta || 0.1)));
        const nextEvidence = evidenceCount + Number(entry.evidenceDelta || 1);

        await this._runQuery(
            'MERGE (d:DomainKnowledgeNode {id: $id}) ON CREATE SET d.domain = $domain, d.canonical_value = $canonical_value, d.aliases_json = $aliases_json, d.confidence = $confidence, d.evidence_count = $evidence_count, d.updated_at = CAST($updated_at AS TIMESTAMP) ON MATCH SET d.domain = $domain, d.canonical_value = $canonical_value, d.aliases_json = $aliases_json, d.confidence = $confidence, d.evidence_count = $evidence_count, d.updated_at = CAST($updated_at AS TIMESTAMP)',
            {
                id,
                domain,
                canonical_value: canonicalValue,
                aliases_json: this._normalizeJson(nextAliases),
                confidence: nextConfidence,
                evidence_count: nextEvidence,
                updated_at: timestamp
            }
        );

        if (meta.actionId) {
            await this._runQuery(
                'MATCH (d:DomainKnowledgeNode {id: $domain_knowledge_id}), (a:ActionNode {id: $action_id}) MERGE (d)-[:DomainKnowledgeDERIVED_FROM_ACTION]->(a)',
                { domain_knowledge_id: id, action_id: String(meta.actionId || '').trim() }
            );
        }

        return {
            id,
            domain,
            canonical_value: canonicalValue,
            aliases: nextAliases,
            confidence: nextConfidence,
            evidence_count: nextEvidence
        };
    }

    async _materializeTypedNodes(event = {}, meta = {}) {
        const payload = event.payload && typeof event.payload === 'object' ? event.payload : {};
        const eventType = String(event.event_type || '').trim();
        const actorType = String(event.actor_type || 'user').trim();
        const actorId = String(event.actor_id || '').trim();
        const conversationId = String(event.conversation_id || '').trim();
        const messageId = String(event.message_id || '').trim();
        const timestamp = String(event.timestamp || new Date().toISOString()).replace('T', ' ').replace('Z', '');

        if ((eventType === 'user.message.received' || eventType === 'agent.message.sent') && payload.text) {
            await this._upsertMessageNode({
                conversationId,
                actorId,
                actorType: eventType === 'agent.message.sent' ? 'agent' : actorType,
                channelMessageId: messageId,
                text: payload.text,
                timestamp
            });
        }

        if (eventType === 'agent.intent.parsed' && Array.isArray(payload.envelope?.actions)) {
            for (const action of payload.envelope.actions) {
                await this._upsertActionNode(action, {
                    eventId: meta.eventId,
                    conversationId,
                    messageId,
                    timestamp,
                    status: action.requires_confirmation ? 'pending_confirmation' : 'parsed'
                });
            }
        }

        if (eventType === 'agent.confirmation.requested' && payload.id) {
            const actionIds = Array.isArray(payload.actions) ? payload.actions.map((item) => String(item?.id || '').trim()).filter(Boolean) : [];
            await this._upsertSuggestionNode({
                id: payload.id,
                type: 'confirmation',
                summary: Array.isArray(payload.previews) && payload.previews[0] ? String(payload.previews[0].preview?.summary || '확인 요청').trim() : '확인 요청',
                payload: this._summarizeConfirmationPayload(payload),
                status: 'pending'
            }, {
                eventId: meta.eventId,
                actionIds,
                timestamp
            });
        }

        if ((eventType === 'agent.confirmation.accepted' || eventType === 'agent.confirmation.rejected') && payload.confirmation_id) {
            await this._upsertSuggestionNode({
                id: payload.confirmation_id,
                type: 'confirmation',
                summary: '확인 요청',
                payload: {
                    confirmation_id: String(payload.confirmation_id || '').trim(),
                    decision: eventType.endsWith('accepted') ? 'accepted' : 'rejected'
                },
                status: eventType.endsWith('accepted') ? 'accepted' : 'rejected'
            }, {
                eventId: meta.eventId,
                actorId,
                timestamp,
                decision: eventType.endsWith('accepted') ? 'accepted' : 'rejected'
            });
        }

        if (eventType === 'domain.alias.accepted' && payload.domain && payload.canonical_value) {
            await this._upsertDomainKnowledgeNode({
                domain: String(payload.domain || '').trim(),
                canonical_value: String(payload.canonical_value || '').trim(),
                aliases: [String(payload.raw_input || '').trim()].filter(Boolean),
                confidenceDelta: 0.2,
                evidenceDelta: 1
            }, {
                timestamp
            });
        }

        if (['suggestion.accepted', 'suggestion.rejected', 'suggestion.helpful', 'suggestion.not_helpful'].includes(eventType) && payload.suggestion_id) {
            const existingSuggestion = await this._getSuggestionById(payload.suggestion_id);
            let status = 'proposed';
            let decision = '';
            if (eventType === 'suggestion.accepted') {
                status = 'accepted';
                decision = 'accepted';
            } else if (eventType === 'suggestion.rejected') {
                status = 'rejected';
                decision = 'rejected';
            } else if (eventType === 'suggestion.helpful') {
                status = 'helpful';
                decision = 'helpful';
            } else if (eventType === 'suggestion.not_helpful') {
                status = 'not_helpful';
                decision = 'not_helpful';
            }
            await this._upsertSuggestionNode({
                id: payload.suggestion_id,
                type: String(payload.type || existingSuggestion?.type || 'recommendation').trim(),
                summary: String(payload.summary || existingSuggestion?.summary || '').trim(),
                payload: (payload.payload && typeof payload.payload === 'object')
                    ? this._summarizeSuggestionPayload(payload.payload)
                    : this._summarizeSuggestionPayload(existingSuggestion?.payload || {}),
                status
            }, {
                eventId: meta.eventId,
                actorId,
                timestamp,
                decision
            });

            const feedbackKey = String(payload.feedback_key || existingSuggestion?.payload?.feedback_key || '').trim();
            if (feedbackKey) {
                await this._upsertSuggestionFeedbackPreference({
                    feedbackKey,
                    feedback: decision,
                    suggestionType: String(payload.type || existingSuggestion?.type || '').trim()
                }, {
                    userId: actorId,
                    timestamp
                });
            }
        }

        if (['artifact.helpful', 'artifact.not_helpful'].includes(eventType) && payload.artifact_id) {
            const existingArtifact = await this._getArtifactById(payload.artifact_id);
            const feedbackKey = String(existingArtifact?.payload?.feedback_key || existingArtifact?.title || '').trim();
            if (feedbackKey) {
                await this._upsertArtifactFeedbackPreference({
                    feedbackKey,
                    feedback: eventType === 'artifact.helpful' ? 'helpful' : 'not_helpful'
                }, {
                    userId: actorId,
                    timestamp
                });
            }
        }

        if (eventType.startsWith('capability.') && payload.action) {
            const action = payload.action || {};
            const actionId = await this._upsertActionNode(action, {
                eventId: meta.eventId,
                conversationId,
                messageId,
                timestamp,
                status: payload.result?.success === false ? 'failed' : 'executed'
            });

            if (actionId && action.type === 'setting.update') {
                const afterData = payload.result?.data && typeof payload.result.data === 'object' ? payload.result.data : {};
                await this._createSettingChangeNode({
                    domain: String(action.domain || '').trim(),
                    key: `${String(action.domain || '').trim()}.${String(action.name || '').trim()}`,
                    before: {},
                    after: afterData
                }, {
                    actionId,
                    timestamp
                });
            }

            if (actionId && action.type === 'job.run') {
                await this._createJobRunNode({
                    job_name: `${String(action.domain || '').trim()}.${String(action.name || '').trim()}`,
                    status: payload.result?.success === false ? 'failed' : 'completed',
                    result: payload.result || {}
                }, {
                    actionId,
                    timestamp
                });
            }

            if (actionId && action.type === 'agent.query' && String(action.domain || '').trim() === 'agent.suggestions') {
                const suggestions = Array.isArray(payload.result?.data?.suggestions) ? payload.result.data.suggestions : [];
                for (const suggestion of suggestions) {
                    await this._upsertSuggestionNode({
                        id: suggestion.id,
                        type: suggestion.type || 'recommendation',
                        summary: suggestion.summary || '',
                        payload: this._summarizeSuggestionPayload(suggestion.payload || {}),
                        status: suggestion.status || 'proposed'
                    }, {
                        eventId: meta.eventId,
                        actionIds: [actionId],
                        timestamp
                    });
                }
            }

            if (actionId && action.type === 'content.generate') {
                const ideas = Array.isArray(payload.result?.data?.ideas) ? payload.result.data.ideas : [];
                for (const idea of ideas) {
                    await this._createArtifactNode({
                        id: String(idea.id || '').trim() || undefined,
                        artifact_type: 'content_idea',
                        title: String(idea.title || '').trim(),
                        summary: String(idea.summary || '').trim(),
                        payload: this._summarizeArtifactPayload(idea)
                    }, {
                        actionId,
                        ownerUserId: meta.ownerUserId,
                        timestamp
                    });
                }
            }

            if (actionId && action.type === 'setting.update' && String(action.domain || '').trim() === 'settings.trends') {
                if (String(action.name || '').trim() === 'add_category' && action.params?.category) {
                    await this._upsertDomainKnowledgeNode({
                        domain: 'trends.category',
                        canonical_value: String(action.params.category || '').trim(),
                        aliases: [],
                        confidenceDelta: 0.1,
                        evidenceDelta: 1
                    }, {
                        actionId,
                        timestamp
                    });
                }
            }

            const preferenceUpdates = buildPreferenceUpdatesFromEvent(event);
            for (const preference of preferenceUpdates) {
                await this._upsertPreferenceNode(preference, {
                    userId: actorId,
                    actionId,
                    timestamp
                });
            }
        }

        if (['content.topic.registered', 'shopping.item.recorded', 'memory.insight.updated'].includes(eventType)) {
            const artifactType = eventType === 'content.topic.registered'
                ? 'topic'
                : eventType === 'shopping.item.recorded'
                    ? 'shopping_item'
                    : 'user_insight';
            const artifactId = `${artifactType}_${crypto.randomUUID()}`;
            const artifact = {
                id: artifactId,
                artifact_type: artifactType,
                title: artifactType === 'user_insight'
                    ? '사용자 인사이트'
                    : artifactType === 'topic'
                        ? String(payload.subject || '').trim()
                        : String(payload.name || '').trim(),
                summary: artifactType === 'user_insight'
                    ? String(payload.summary || '').trim()
                    : artifactType === 'topic'
                        ? `${String(payload.category || '').trim()} | ${String(payload.subject || '').trim()}`
                        : `${String(payload.mall || '').trim()} | ${String(payload.name || '').trim()}`,
                payload: artifactType === 'user_insight'
                    ? { summary: String(payload.summary || '').trim() }
                    : this._compactValue(payload, { maxDepth: 2, maxArray: 6, maxString: 180 })
            };
            await this._createArtifactNode(artifact, { ownerUserId: meta.ownerUserId, timestamp });
            if (artifactType === 'topic') {
                await this._materializeTopicFacetsDirect(artifactId, artifact.payload, timestamp);
            }
            if (meta.eventId) {
                await this._runQuery(
                    'MATCH (e:EventNode {id: $event_id}), (a:ArtifactNode {id: $artifact_id}) MERGE (e)-[:EventHAS_ARTIFACT]->(a)',
                    { event_id: String(meta.eventId || '').trim(), artifact_id: artifactId }
                );
            }
        }
    }

    async appendEvent(event = {}) {
        await this.initialize();
        const id = String(event.id || `evt_${crypto.randomUUID()}`);
        const timestamp = String(event.timestamp || new Date().toISOString()).replace('T', ' ').replace('Z', '');
        const actorType = String(event.actor_type || 'user').trim();
        const actorId = String(event.actor_id || '').trim();
        const conversationId = String(event.conversation_id || '').trim();
        const messageId = String(event.message_id || '').trim();
        const payloadJson = this._normalizeJson(this._summarizeEventPayload(String(event.event_type || '').trim(), event.payload || {}));
        const user = event.user || { id: actorId, channel: event.channel || 'telegram', username: event.username || '' };
        const conversation = event.conversation || { id: conversationId, channel: event.channel || 'telegram' };
        const ownerUserId = String(event.owner_user_id || event.ownerUserId || this.owner?.owner_user_id || '').trim();
        if (!ownerUserId) throw new Error('이벤트 소유자를 확인할 수 없습니다.');
        await this._ensureOwnerDirect(ownerUserId === this.owner?.owner_user_id
            ? this.owner
            : {
                owner_user_id: ownerUserId,
                identity_kind: String(event.owner_identity_kind || event.ownerIdentityKind || ownerUserId.split(':')[0] || 'external').trim(),
                created_at: new Date().toISOString()
            });

        if (conversationId) await this.ensureConversation(conversation, user);
        else if (user?.id) await this.ensureUser(user);

        await this._runQuery(
            'CREATE (e:EventNode {id: $id, event_type: $event_type, timestamp: CAST($timestamp AS TIMESTAMP), actor_type: $actor_type, actor_id: $actor_id, conversation_id: $conversation_id, message_id: $message_id, payload_json: $payload_json})',
            {
                id,
                event_type: String(event.event_type || '').trim(),
                timestamp,
                actor_type: actorType,
                actor_id: actorId,
                conversation_id: conversationId,
                message_id: messageId,
                payload_json: payloadJson
            }
        );

        if (conversationId) {
            await this._runQuery(
                'MATCH (c:ConversationNode {id: $conversation_id}), (e:EventNode {id: $event_id}) MERGE (c)-[:ConversationHAS_EVENT]->(e)',
                { conversation_id: conversationId, event_id: id }
            );
        }
        if (actorId) {
            await this._runQuery(
                'MATCH (u:AgentUserNode {id: $actor_id}), (e:EventNode {id: $event_id}) MERGE (u)-[:UserTRIGGERED_EVENT]->(e)',
                { actor_id: actorId, event_id: id }
            );
            await this._runQuery(
                'MATCH (o:OwnerNode {id: $owner_id}), (u:AgentUserNode {id: $actor_id}) MERGE (o)-[:OwnerHAS_ACTOR]->(u)',
                { owner_id: ownerUserId, actor_id: actorId }
            );
        }
        await this._runQuery(
            'MATCH (o:OwnerNode {id: $owner_id}), (e:EventNode {id: $event_id}) MERGE (o)-[:OwnerOWNS_EVENT]->(e)',
            { owner_id: ownerUserId, event_id: id }
        );

        await this._materializeTypedNodes(event, { eventId: id, ownerUserId });

        return { id, owner_user_id: ownerUserId };
    }

    async listConversationEvents(conversationId, limit = 20) {
        const res = await this._runQuery(
            'MATCH (c:ConversationNode {id: $conversation_id})-[:ConversationHAS_EVENT]->(e:EventNode) RETURN e.id AS id, e.event_type AS event_type, e.timestamp AS timestamp, e.payload_json AS payload_json ORDER BY e.timestamp DESC LIMIT $limit',
            { conversation_id: String(conversationId || '').trim(), limit: parseInt(limit, 10) || 20 }
        );
        const items = [];
        while (res.hasNext()) {
            const row = await res.getNext();
            items.push({
                id: row.id,
                event_type: row.event_type,
                timestamp: row.timestamp,
                payload: (() => { try { return JSON.parse(row.payload_json || '{}'); } catch (_ignore) { return {}; } })()
            });
        }
        return items;
    }

    async listRecentMessages(conversationId, limit = 10) {
        const res = await this._runQuery(
            'MATCH (c:ConversationNode {id: $conversation_id})-[:ConversationHAS_MESSAGE]->(m:MessageNode) RETURN m.id AS id, m.role AS role, m.text AS text, m.timestamp AS timestamp, m.channel_message_id AS channel_message_id ORDER BY m.timestamp DESC LIMIT $limit',
            { conversation_id: String(conversationId || '').trim(), limit: parseInt(limit, 10) || 10 }
        );
        const items = [];
        while (res.hasNext()) {
            const row = await res.getNext();
            items.push({
                id: row.id,
                role: row.role,
                text: row.text,
                timestamp: row.timestamp,
                channel_message_id: row.channel_message_id
            });
        }
        return items;
    }

    async listRecentActions(conversationId, limit = 10) {
        const res = await this._runQuery(
            'MATCH (c:ConversationNode {id: $conversation_id})-[:ConversationHAS_MESSAGE]->(:MessageNode)-[:MessagePARSED_TO_ACTION]->(a:ActionNode) RETURN a.id AS id, a.type AS type, a.domain AS domain, a.name AS name, a.params_json AS params_json, a.status AS status, a.timestamp AS timestamp ORDER BY a.timestamp DESC LIMIT $limit',
            { conversation_id: String(conversationId || '').trim(), limit: parseInt(limit, 10) || 10 }
        );
        const items = [];
        while (res.hasNext()) {
            const row = await res.getNext();
            items.push({
                id: row.id,
                type: row.type,
                domain: row.domain,
                name: row.name,
                status: row.status,
                timestamp: row.timestamp,
                params: (() => { try { return JSON.parse(row.params_json || '{}'); } catch (_ignore) { return {}; } })()
            });
        }
        return items;
    }

    async listRecentSettingChanges(conversationId, limit = 10) {
        const res = await this._runQuery(
            'MATCH (c:ConversationNode {id: $conversation_id})-[:ConversationHAS_MESSAGE]->(:MessageNode)-[:MessagePARSED_TO_ACTION]->(:ActionNode)-[:ActionCHANGED_SETTING]->(s:SettingChangeNode) RETURN s.id AS id, s.domain AS domain, s.setting_key AS setting_key, s.before_json AS before_json, s.after_json AS after_json, s.timestamp AS timestamp ORDER BY s.timestamp DESC LIMIT $limit',
            { conversation_id: String(conversationId || '').trim(), limit: parseInt(limit, 10) || 10 }
        );
        const items = [];
        while (res.hasNext()) {
            const row = await res.getNext();
            items.push({
                id: row.id,
                domain: row.domain,
                setting_key: row.setting_key,
                timestamp: row.timestamp,
                before: (() => { try { return JSON.parse(row.before_json || '{}'); } catch (_ignore) { return {}; } })(),
                after: (() => { try { return JSON.parse(row.after_json || '{}'); } catch (_ignore) { return {}; } })()
            });
        }
        return items;
    }

    async listRecentJobRuns(conversationId, limit = 10) {
        const res = await this._runQuery(
            'MATCH (c:ConversationNode {id: $conversation_id})-[:ConversationHAS_MESSAGE]->(:MessageNode)-[:MessagePARSED_TO_ACTION]->(:ActionNode)-[:ActionTRIGGERED_JOB]->(j:JobRunNode) RETURN j.id AS id, j.job_name AS job_name, j.status AS status, j.started_at AS started_at, j.finished_at AS finished_at, j.result_json AS result_json ORDER BY j.started_at DESC LIMIT $limit',
            { conversation_id: String(conversationId || '').trim(), limit: parseInt(limit, 10) || 10 }
        );
        const items = [];
        while (res.hasNext()) {
            const row = await res.getNext();
            items.push({
                id: row.id,
                job_name: row.job_name,
                status: row.status,
                started_at: row.started_at,
                finished_at: row.finished_at,
                result: (() => { try { return JSON.parse(row.result_json || '{}'); } catch (_ignore) { return {}; } })()
            });
        }
        return items;
    }

    async listRecentArtifacts(conversationId, artifactType = '', limit = 10) {
        const artifactTypeValue = String(artifactType || '').trim();
        const query = artifactTypeValue
            ? 'MATCH (c:ConversationNode {id: $conversation_id})-[:ConversationHAS_MESSAGE]->(:MessageNode)-[:MessagePARSED_TO_ACTION]->(:ActionNode)-[:ActionPRODUCED_ARTIFACT]->(a:ArtifactNode {artifact_type: $artifact_type}) RETURN a.id AS id, a.artifact_type AS artifact_type, a.title AS title, a.summary AS summary, a.payload_json AS payload_json, a.timestamp AS timestamp ORDER BY a.timestamp DESC LIMIT $limit'
            : 'MATCH (c:ConversationNode {id: $conversation_id})-[:ConversationHAS_MESSAGE]->(:MessageNode)-[:MessagePARSED_TO_ACTION]->(:ActionNode)-[:ActionPRODUCED_ARTIFACT]->(a:ArtifactNode) RETURN a.id AS id, a.artifact_type AS artifact_type, a.title AS title, a.summary AS summary, a.payload_json AS payload_json, a.timestamp AS timestamp ORDER BY a.timestamp DESC LIMIT $limit';
        const res = await this._runQuery(query, {
            conversation_id: String(conversationId || '').trim(),
            artifact_type: artifactTypeValue,
            limit: parseInt(limit, 10) || 10
        });
        const items = [];
        while (res.hasNext()) {
            const row = await res.getNext();
            items.push({
                id: row.id,
                artifact_type: row.artifact_type,
                title: row.title,
                summary: row.summary,
                timestamp: row.timestamp,
                payload: (() => { try { return JSON.parse(row.payload_json || '{}'); } catch (_ignore) { return {}; } })()
            });
        }
        return items;
    }

    _resolveOwnerUserId(ownerUserId = '') {
        const resolved = String(ownerUserId || this.owner?.owner_user_id || '').trim();
        if (!resolved) throw new Error('owner_user_id가 필요합니다.');
        return resolved;
    }

    async listOwnerEvents(ownerUserId = '', options = {}) {
        await this.initialize();
        const resolvedOwnerUserId = this._resolveOwnerUserId(ownerUserId);
        const eventType = String(options.eventType || options.event_type || '').trim();
        const eventTypePrefix = String(options.eventTypePrefix || options.event_type_prefix || '').trim();
        const limit = Math.max(1, Math.min(500, parseInt(options.limit, 10) || 100));
        const query = eventType
            ? 'MATCH (o:OwnerNode {id: $owner_id})-[:OwnerOWNS_EVENT]->(e:EventNode {event_type: $event_type}) RETURN e.id AS id, e.event_type AS event_type, e.timestamp AS timestamp, e.actor_type AS actor_type, e.actor_id AS actor_id, e.conversation_id AS conversation_id, e.message_id AS message_id, e.payload_json AS payload_json ORDER BY e.timestamp DESC LIMIT $limit'
            : eventTypePrefix
                ? 'MATCH (o:OwnerNode {id: $owner_id})-[:OwnerOWNS_EVENT]->(e:EventNode) WHERE e.event_type STARTS WITH $event_type_prefix RETURN e.id AS id, e.event_type AS event_type, e.timestamp AS timestamp, e.actor_type AS actor_type, e.actor_id AS actor_id, e.conversation_id AS conversation_id, e.message_id AS message_id, e.payload_json AS payload_json ORDER BY e.timestamp DESC LIMIT $limit'
            : 'MATCH (o:OwnerNode {id: $owner_id})-[:OwnerOWNS_EVENT]->(e:EventNode) RETURN e.id AS id, e.event_type AS event_type, e.timestamp AS timestamp, e.actor_type AS actor_type, e.actor_id AS actor_id, e.conversation_id AS conversation_id, e.message_id AS message_id, e.payload_json AS payload_json ORDER BY e.timestamp DESC LIMIT $limit';
        const params = {
            owner_id: resolvedOwnerUserId,
            limit
        };
        if (eventType) params.event_type = eventType;
        if (!eventType && eventTypePrefix) params.event_type_prefix = eventTypePrefix;
        const res = await this._runQuery(query, params);
        const items = [];
        while (res.hasNext()) {
            const row = await res.getNext();
            items.push({
                id: row.id,
                event_type: row.event_type,
                timestamp: row.timestamp,
                actor_type: row.actor_type,
                actor_id: row.actor_id,
                conversation_id: row.conversation_id,
                message_id: row.message_id,
                payload: (() => { try { return JSON.parse(row.payload_json || '{}'); } catch (_ignore) { return {}; } })()
            });
        }
        return items;
    }

    async listOwnerArtifacts(ownerUserId = '', options = {}) {
        await this.initialize();
        const resolvedOwnerUserId = this._resolveOwnerUserId(ownerUserId);
        const artifactType = String(options.artifactType || options.artifact_type || '').trim();
        const limit = Math.max(1, Math.min(500, parseInt(options.limit, 10) || 100));
        const query = artifactType
            ? 'MATCH (o:OwnerNode {id: $owner_id})-[:OwnerOWNS_ARTIFACT]->(a:ArtifactNode {artifact_type: $artifact_type}) RETURN a.id AS id, a.artifact_type AS artifact_type, a.title AS title, a.summary AS summary, a.payload_json AS payload_json, a.timestamp AS timestamp ORDER BY a.timestamp DESC LIMIT $limit'
            : 'MATCH (o:OwnerNode {id: $owner_id})-[:OwnerOWNS_ARTIFACT]->(a:ArtifactNode) RETURN a.id AS id, a.artifact_type AS artifact_type, a.title AS title, a.summary AS summary, a.payload_json AS payload_json, a.timestamp AS timestamp ORDER BY a.timestamp DESC LIMIT $limit';
        const params = {
            owner_id: resolvedOwnerUserId,
            limit
        };
        if (artifactType) params.artifact_type = artifactType;
        const res = await this._runQuery(query, params);
        const items = [];
        while (res.hasNext()) {
            const row = await res.getNext();
            items.push({
                id: row.id,
                artifact_type: row.artifact_type,
                title: row.title,
                summary: row.summary,
                timestamp: row.timestamp,
                payload: (() => { try { return JSON.parse(row.payload_json || '{}'); } catch (_ignore) { return {}; } })()
            });
        }
        return items;
    }

    async getOwnerActivitySignalSummary(ownerUserId = '', options = {}) {
        await this.initialize();
        const resolvedOwnerUserId = this._resolveOwnerUserId(ownerUserId);
        const scanLimit = Math.max(1, Math.min(500, parseInt(options.scanLimit || options.scan_limit, 10) || 200));
        const artifacts = await this.listOwnerArtifacts(resolvedOwnerUserId, { limit: scanLimit });
        const events = await this.listOwnerEvents(resolvedOwnerUserId, {
            eventTypePrefix: 'activity.lifecycle.',
            limit: scanLimit
        });
        return buildOwnerActivitySignalSummary({
            owner_user_id: resolvedOwnerUserId,
            artifacts,
            events,
            domains: options.domains,
            limit: options.limit
        });
    }

    async listOwnerTopicFacets(ownerUserId = '', options = {}) {
        await this.initialize();
        const resolvedOwnerUserId = this._resolveOwnerUserId(ownerUserId);
        const kind = String(options.kind || '').trim().toLowerCase();
        const scope = String(options.scope || '').trim().toLowerCase();
        if (kind && !TOPIC_FACET_KINDS.includes(kind)) throw new Error(`지원하지 않는 topic facet kind입니다: ${kind}`);
        if (scope && !TOPIC_FACET_SCOPES.includes(scope)) throw new Error(`지원하지 않는 topic facet scope입니다: ${scope}`);
        const limit = Math.max(1, Math.min(100, parseInt(options.limit, 10) || 20));
        const conditions = [];
        const params = { owner_id: resolvedOwnerUserId, artifact_type: 'topic', limit };
        if (kind) {
            conditions.push('f.kind = $kind');
            params.kind = kind;
        }
        if (scope) {
            conditions.push('f.scope = $scope');
            params.scope = scope;
        }
        const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
        const query = `MATCH (o:OwnerNode {id: $owner_id})-[:OwnerOWNS_ARTIFACT]->(a:ArtifactNode {artifact_type: $artifact_type})-[:ArtifactHAS_TOPIC_FACET]->(f:TopicFacetNode)${whereClause} RETURN f.id AS id, f.kind AS kind, f.scope AS scope, f.normalized_value AS normalized_value, f.display_value AS display_value, count(a) AS evidence_count, max(a.timestamp) AS last_used_at ORDER BY evidence_count DESC, last_used_at DESC, normalized_value ASC LIMIT $limit`;
        const res = await this._runQuery(query, params);
        const items = [];
        while (res.hasNext()) {
            const row = await res.getNext();
            items.push({
                id: row.id,
                kind: row.kind,
                scope: row.scope,
                normalized_value: row.normalized_value,
                display_value: row.display_value,
                evidence_count: Number(row.evidence_count || 0),
                last_used_at: row.last_used_at
            });
        }
        return items;
    }

    async getOwnerTopicSemanticSummary(ownerUserId = '', options = {}) {
        await this.initialize();
        const resolvedOwnerUserId = this._resolveOwnerUserId(ownerUserId);
        const limit = Math.max(1, Math.min(50, parseInt(options.limit, 10) || 10));
        return {
            owner_user_id: resolvedOwnerUserId,
            keywords: await this.listOwnerTopicFacets(resolvedOwnerUserId, { kind: 'keyword', limit }),
            categories: await this.listOwnerTopicFacets(resolvedOwnerUserId, { kind: 'category', limit }),
            platforms: await this.listOwnerTopicFacets(resolvedOwnerUserId, { kind: 'platform', limit })
        };
    }

    async recordMessage(chatId, text, intent = 'UNKNOWN', sender = 'USER') {
        const userId = String(chatId || '').trim();
        if (!userId || !String(text || '').trim()) return null;
        const eventType = String(sender || 'USER').trim().toUpperCase() === 'AGENT' ? 'agent.message.sent' : 'user.message.received';
        const eventId = `${eventType.startsWith('agent') ? 'agent' : 'user'}_msg_${crypto.randomUUID()}`;
        const result = await this.appendEvent({
            id: eventId,
            event_type: eventType,
            actor_type: eventType.startsWith('agent') ? 'agent' : 'user',
            actor_id: userId,
            conversation_id: `telegram:${userId}`,
            message_id: eventId,
            channel: 'telegram',
            user: { id: userId, channel: 'telegram', username: '' },
            conversation: { id: `telegram:${userId}`, channel: 'telegram' },
            payload: {
                text: String(text || '').trim(),
                intent: String(intent || 'UNKNOWN').trim()
            }
        });
        return result?.id || null;
    }

    async recordInteractionMessage(provenanceInput = {}, text = '', intent = 'UNKNOWN', sender = 'USER') {
        const messageText = String(text || '').trim();
        if (!messageText) return null;
        const provenance = normalizeInteractionProvenance(provenanceInput);
        const isAgent = String(sender || 'USER').trim().toUpperCase() === 'AGENT';
        const identity = [
            provenance.channel,
            provenance.conversation_id,
            provenance.message_id,
            isAgent ? 'agent' : 'user'
        ].join(':');
        const eventId = provenance.message_id
            ? `message_${crypto.createHash('sha256').update(identity).digest('hex')}`
            : '';

        if (eventId) {
            await this.initialize();
            const existing = await this._runQuery(
                'MATCH (e:EventNode {id: $event_id}) RETURN e.id AS id LIMIT 1',
                { event_id: eventId }
            );
            if (existing.hasNext()) return eventId;
        }

        const result = await this.appendEvent({
            ...(eventId ? { id: eventId } : {}),
            event_type: isAgent ? 'agent.message.sent' : 'user.message.received',
            actor_type: isAgent ? 'agent' : provenance.actor_type,
            actor_id: isAgent ? 'AGENT' : provenance.actor_id,
            conversation_id: provenance.conversation_id,
            message_id: provenance.message_id,
            channel: provenance.channel,
            user: { id: isAgent ? 'AGENT' : provenance.actor_id, channel: provenance.channel, username: '' },
            conversation: provenance.conversation_id
                ? { id: provenance.conversation_id, channel: provenance.channel }
                : null,
            payload: {
                text: messageText,
                intent: String(intent || 'UNKNOWN').trim(),
                request_id: provenance.request_id
            }
        });
        return result?.id || null;
    }

    async getHistory(chatId, limit = 10) {
        const items = await this.listRecentMessages(`telegram:${String(chatId || '').trim()}`, limit);
        return items.map((item) => ({
            text: item.text,
            intent: String(item.role || '').trim().toUpperCase() === 'AGENT' ? 'AGENT' : 'UNKNOWN',
            timestamp: item.timestamp,
            sender: String(item.role || '').trim().toUpperCase() === 'AGENT' ? 'AGENT' : 'USER'
        }));
    }

    async updateUserInsight(chatId, summary) {
        const userId = String(chatId || '').trim();
        const insight = String(summary || '').trim();
        if (!userId || !insight) return null;
        const result = await this.appendEvent({
            event_type: 'memory.insight.updated',
            actor_type: 'agent',
            actor_id: userId,
            conversation_id: `telegram:${userId}`,
            channel: 'telegram',
            user: { id: userId, channel: 'telegram', username: '' },
            conversation: { id: `telegram:${userId}`, channel: 'telegram' },
            payload: { summary: insight }
        });
        return result?.id || null;
    }

    async getUserInsight(chatId) {
        const userId = String(chatId || '').trim();
        const res = await this._runQuery(
            'MATCH (u:AgentUserNode {id: $user_id})-[:UserTRIGGERED_EVENT]->(:EventNode)-[:EventHAS_ARTIFACT]->(a:ArtifactNode {artifact_type: $artifact_type}) RETURN a.summary AS summary, a.timestamp AS timestamp ORDER BY a.timestamp DESC LIMIT 1',
            { user_id: userId, artifact_type: 'user_insight' }
        );
        if (res.hasNext()) {
            const row = await res.getNext();
            return String(row.summary || '').trim();
        }
        return '';
    }

    async recordTopic(chatId, topicData = {}, provenanceInput = {}) {
        const legacyUserId = String(chatId || '').trim();
        const provenance = normalizeInteractionProvenance(provenanceInput, legacyUserId ? {
            channel: 'telegram',
            actor_type: 'user',
            actor_id: legacyUserId,
            conversation_id: `telegram:${legacyUserId}`
        } : {
            channel: 'local',
            actor_type: 'system',
            actor_id: 'SYSTEM'
        });
        return this.appendEvent({
            event_type: 'content.topic.registered',
            actor_type: provenance.actor_type,
            actor_id: provenance.actor_id,
            conversation_id: provenance.conversation_id,
            message_id: provenance.message_id,
            channel: provenance.channel,
            user: { id: provenance.actor_id, channel: provenance.channel, username: '' },
            conversation: provenance.conversation_id
                ? { id: provenance.conversation_id, channel: provenance.channel }
                : null,
            payload: {
                subject: topicData.subject || '',
                platform: topicData.platform || '',
                category: topicData.category || '',
                keywords: topicData.keywords || '',
                instruction: topicData.instruction || '',
                source: topicData.source || 'manual',
                request_id: provenance.request_id
            }
        });
    }

    async recordShoppingItem(chatId, itemData = {}, provenanceInput = {}) {
        const legacyUserId = String(chatId || '').trim();
        const provenance = normalizeInteractionProvenance(provenanceInput, legacyUserId ? {
            channel: 'telegram',
            actor_type: 'user',
            actor_id: legacyUserId,
            conversation_id: `telegram:${legacyUserId}`
        } : {
            channel: 'local',
            actor_type: 'system',
            actor_id: 'SYSTEM'
        });
        return this.appendEvent({
            event_type: 'shopping.item.recorded',
            actor_type: provenance.actor_type,
            actor_id: provenance.actor_id,
            conversation_id: provenance.conversation_id,
            message_id: provenance.message_id,
            channel: provenance.channel,
            user: { id: provenance.actor_id, channel: provenance.channel, username: '' },
            conversation: provenance.conversation_id
                ? { id: provenance.conversation_id, channel: provenance.channel }
                : null,
            payload: {
                name: itemData.name || '',
                price: itemData.price || '',
                mall: itemData.mall || '',
                source: itemData.source || 'manual',
                request_id: provenance.request_id
            }
        });
    }

    async recordActivityLifecycle(input = {}) {
        await this.initialize();
        const evidence = normalizeActivityEvidence(input);
        if (evidence.id) {
            const existing = await this._runQuery(
                'MATCH (e:EventNode {id: $event_id}) RETURN e.id AS id LIMIT 1',
                { event_id: evidence.id }
            );
            if (existing.hasNext()) {
                const row = await existing.getNext();
                return { id: row.id, owner_user_id: this._resolveOwnerUserId(evidence.owner_user_id), deduplicated: true };
            }
        }

        const result = await this.appendEvent({
            ...(evidence.id ? { id: evidence.id } : {}),
            event_type: evidence.event_type,
            actor_type: evidence.actor_type,
            actor_id: evidence.actor_id,
            conversation_id: evidence.conversation_id,
            message_id: evidence.message_id,
            channel: evidence.channel,
            timestamp: evidence.timestamp,
            owner_user_id: evidence.owner_user_id,
            payload: evidence.payload
        });
        return { ...result, deduplicated: false };
    }

    async getTopicSummary(chatId, options = {}) {
        const limit = options.limit || 5;
        const category = String(options.category || '').trim();
        const query = category
            ? 'MATCH (u:AgentUserNode {id: $user_id})-[:UserTRIGGERED_EVENT]->(:EventNode)-[:EventHAS_ARTIFACT]->(a:ArtifactNode {artifact_type: $artifact_type}) WHERE a.summary STARTS WITH $category_prefix RETURN a.title AS title, a.payload_json AS payload_json, a.timestamp AS timestamp ORDER BY a.timestamp DESC LIMIT $limit'
            : 'MATCH (u:AgentUserNode {id: $user_id})-[:UserTRIGGERED_EVENT]->(:EventNode)-[:EventHAS_ARTIFACT]->(a:ArtifactNode {artifact_type: $artifact_type}) RETURN a.title AS title, a.payload_json AS payload_json, a.timestamp AS timestamp ORDER BY a.timestamp DESC LIMIT $limit';
        const res = await this._runQuery(query, {
            user_id: String(chatId || '').trim(),
            artifact_type: 'topic',
            category_prefix: `${category} |`,
            limit: parseInt(limit, 10) || 5
        });
        const results = [];
        while (res.hasNext()) {
            const row = await res.getNext();
            const payload = (() => { try { return JSON.parse(row.payload_json || '{}'); } catch (_ignore) { return {}; } })();
            results.push({
                subject: row.title || payload.subject || '',
                category: payload.category || '',
                timestamp: row.timestamp,
                source: payload.source || ''
            });
        }
        return results;
    }

    async getShoppingSummary(chatId, options = {}) {
        const limit = options.limit || 5;
        const res = await this._runQuery(
            'MATCH (u:AgentUserNode {id: $user_id})-[:UserTRIGGERED_EVENT]->(:EventNode)-[:EventHAS_ARTIFACT]->(a:ArtifactNode {artifact_type: $artifact_type}) RETURN a.title AS title, a.payload_json AS payload_json, a.timestamp AS timestamp ORDER BY a.timestamp DESC LIMIT $limit',
            { user_id: String(chatId || '').trim(), artifact_type: 'shopping_item', limit: parseInt(limit, 10) || 5 }
        );
        const results = [];
        while (res.hasNext()) {
            const row = await res.getNext();
            const payload = (() => { try { return JSON.parse(row.payload_json || '{}'); } catch (_ignore) { return {}; } })();
            results.push({
                name: row.title || payload.name || '',
                price: payload.price || '',
                mall: payload.mall || '',
                timestamp: row.timestamp
            });
        }
        return results;
    }

    async getGlobalStats() {
        const stats = {};
        const queries = {
            users: 'MATCH (u:AgentUserNode) RETURN count(u) AS count',
            messages: 'MATCH (m:MessageNode) RETURN count(m) AS count',
            topics: 'MATCH (a:ArtifactNode {artifact_type: $artifact_type}) RETURN count(a) AS count',
            shopping: 'MATCH (a:ArtifactNode {artifact_type: $artifact_type}) RETURN count(a) AS count'
        };
        for (const [key, query] of Object.entries(queries)) {
            const params = key === 'topics'
                ? { artifact_type: 'topic' }
                : key === 'shopping'
                    ? { artifact_type: 'shopping_item' }
                    : {};
            const res = await this._runQuery(query, params);
            const row = await res.getNext();
            stats[key] = Number(row.count || row[0] || 0);
        }
        return stats;
    }

    async listDomainKnowledge(domain, limit = 20) {
        const res = await this._runQuery(
            'MATCH (d:DomainKnowledgeNode {domain: $domain}) RETURN d.id AS id, d.domain AS domain, d.canonical_value AS canonical_value, d.aliases_json AS aliases_json, d.confidence AS confidence, d.evidence_count AS evidence_count, d.updated_at AS updated_at ORDER BY d.updated_at DESC LIMIT $limit',
            { domain: String(domain || '').trim(), limit: parseInt(limit, 10) || 20 }
        );
        const items = [];
        while (res.hasNext()) {
            const row = await res.getNext();
            items.push({
                id: row.id,
                domain: row.domain,
                canonical_value: row.canonical_value,
                aliases: (() => { try { return JSON.parse(row.aliases_json || '[]'); } catch (_ignore) { return []; } })(),
                confidence: Number(row.confidence || 0),
                evidence_count: Number(row.evidence_count || 0),
                updated_at: row.updated_at
            });
        }
        return items;
    }

    async listUserPreferences(userId, limit = 10) {
        const res = await this._runQuery(
            'MATCH (u:AgentUserNode {id: $user_id})-[:UserHAS_PREFERENCE]->(p:PreferenceNode) RETURN p.id AS id, p.name AS name, p.value_json AS value_json, p.confidence AS confidence, p.evidence_count AS evidence_count, p.updated_at AS updated_at ORDER BY p.updated_at DESC LIMIT $limit',
            { user_id: String(userId || '').trim(), limit: parseInt(limit, 10) || 10 }
        );
        const items = [];
        while (res.hasNext()) {
            const row = await res.getNext();
            items.push({
                id: row.id,
                name: row.name,
                confidence: Number(row.confidence || 0),
                evidence_count: Number(row.evidence_count || 0),
                updated_at: row.updated_at,
                value: (() => { try { return JSON.parse(row.value_json || '{}'); } catch (_ignore) { return {}; } })()
            });
        }
        return items;
    }

    getLocalOwnerIdentity() {
        return this.owner ? { ...this.owner } : this.ownerIdentity.resolve();
    }

    async getOwnerMemoryStats(ownerUserId = '') {
        await this.initialize();
        const resolvedOwnerUserId = String(ownerUserId || this.owner?.owner_user_id || '').trim();
        if (!resolvedOwnerUserId) throw new Error('owner_user_id가 필요합니다.');

        const eventCount = await this._countDirect(
            'MATCH (o:OwnerNode {id: $owner_id})-[:OwnerOWNS_EVENT]->(e:EventNode) RETURN count(e) AS count',
            { owner_id: resolvedOwnerUserId }
        );
        const artifactCount = await this._countDirect(
            'MATCH (o:OwnerNode {id: $owner_id})-[:OwnerOWNS_ARTIFACT]->(a:ArtifactNode) RETURN count(a) AS count',
            { owner_id: resolvedOwnerUserId }
        );
        const totalEventCount = await this._countDirect('MATCH (e:EventNode) RETURN count(e) AS count');
        const totalArtifactCount = await this._countDirect('MATCH (a:ArtifactNode) RETURN count(a) AS count');
        const ownedEventCount = await this._countDirect('MATCH (:OwnerNode)-[:OwnerOWNS_EVENT]->(e:EventNode) RETURN count(DISTINCT e) AS count');
        const ownedArtifactCount = await this._countDirect('MATCH (:OwnerNode)-[:OwnerOWNS_ARTIFACT]->(a:ArtifactNode) RETURN count(DISTINCT a) AS count');

        return {
            owner_user_id: resolvedOwnerUserId,
            event_count: eventCount,
            artifact_count: artifactCount,
            orphan_event_count: Math.max(0, totalEventCount - ownedEventCount),
            orphan_artifact_count: Math.max(0, totalArtifactCount - ownedArtifactCount)
        };
    }
}

module.exports = {
    KuzuEventStore,
    loadKuzu,
    getKuzuLoadError
};
