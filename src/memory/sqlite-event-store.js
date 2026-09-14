const crypto = require('node:crypto');
const path = require('node:path');
const { MemoryPayloadCodec } = require('./payload-codec');
const { LocalOwnerIdentity } = require('../identity/local-owner-identity');
const { normalizeInteractionProvenance } = require('./interaction-provenance');
const { normalizeActivityEvidence } = require('./activity-lifecycle');
const { TOPIC_FACET_KINDS, TOPIC_FACET_SCOPES, buildTopicFacets } = require('./topic-semantics');
const { buildOwnerActivitySignalSummary } = require('./owner-activity-signals');
const { buildOwnerProfileProjection } = require('./owner-profile');
const { buildMemoryCollectionAudit } = require('./collection-audit');
const { resolveArtifactFeedbackTarget } = require('./feedback-target');
const { buildPreferenceUpdatesFromEvent } = require('./extractors/preferences');
const { RecommendationLifecycleStore } = require('../recommendations/lifecycle-store');
const { SQLiteDatabase } = require('./sqlite-database');
const { SQLiteRecommendationRepository } = require('./sqlite-recommendation-repository');

const SQLITE_MEMORY_GENERATION = 2;
const SQLITE_MEMORY_FILENAME = 'agent_memory_v2.sqlite3';

function json(value, fallback = {}) {
    try { return JSON.parse(String(value || '')) || fallback; } catch (_error) { return fallback; }
}

function iso(value) {
    const date = new Date(value || Date.now());
    if (Number.isNaN(date.getTime())) throw new Error('memory timestamp가 올바르지 않습니다.');
    return date.toISOString();
}

function boundedLimit(value, fallback, maximum = 500) {
    return Math.max(1, Math.min(maximum, Number.parseInt(value, 10) || fallback));
}

class SQLiteEventStore extends MemoryPayloadCodec {
    constructor(options = {}) {
        super();
        this.Logger = options.Logger || console;
        this.baseDir = String(options.baseDir || process.cwd());
        this.dbPath = String(options.dbPath || path.join(this.baseDir, 'data', SQLITE_MEMORY_FILENAME));
        this.ownerIdentity = options.ownerIdentity || new LocalOwnerIdentity({ baseDir: this.baseDir });
        this.databaseFactory = options.databaseFactory || ((filePath) => new SQLiteDatabase({ filePath }));
        this.database = null;
        this.disabled = false;
        this.owner = null;
        this.isInitialized = false;
        this.initPromise = null;
        this.recommendationStore = null;
    }

    async initialize() {
        if (this.isInitialized) return true;
        if (this.initPromise) return this.initPromise;
        this.initPromise = Promise.resolve().then(() => {
            this.database = this.databaseFactory(this.dbPath).open();
            this._initializeSchema();
            const check = this.database.quickCheck();
            if (!check.ok) throw new Error(`SQLite quick_check 실패: ${check.result || 'unknown'}`);
            this.owner = this.ownerIdentity.resolve();
            this._ensureOwner(this.owner);
            const repository = new SQLiteRecommendationRepository({
                database: this.database,
                ensureOwner: async (owner) => this._ensureOwner(owner)
            });
            repository.initializeSchema();
            this.recommendationStore = new RecommendationLifecycleStore({ repository });
            this.isInitialized = true;
            return true;
        }).catch((error) => {
            try { this.database?.close(); } catch (_ignore) { }
            this.database = null;
            this.initPromise = null;
            throw error;
        });
        return this.initPromise;
    }

    _initializeSchema() {
        this.database.exec(`
            CREATE TABLE IF NOT EXISTS memory_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
            INSERT INTO memory_meta(key, value) VALUES ('storage_generation', '${SQLITE_MEMORY_GENERATION}')
                ON CONFLICT(key) DO UPDATE SET value = excluded.value;
            CREATE TABLE IF NOT EXISTS owners (
                id TEXT PRIMARY KEY, identity_kind TEXT NOT NULL, created_at TEXT NOT NULL
            ) STRICT;
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY, channel TEXT NOT NULL, username TEXT NOT NULL, created_at TEXT NOT NULL
            ) STRICT;
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY, channel TEXT NOT NULL, started_at TEXT NOT NULL, last_activity_at TEXT NOT NULL
            ) STRICT;
            CREATE TABLE IF NOT EXISTS events (
                id TEXT PRIMARY KEY,
                owner_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                occurred_at TEXT NOT NULL,
                actor_type TEXT NOT NULL,
                actor_id TEXT NOT NULL,
                conversation_id TEXT NOT NULL,
                message_id TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                FOREIGN KEY(owner_id) REFERENCES owners(id) ON DELETE CASCADE
            ) STRICT;
            CREATE INDEX IF NOT EXISTS idx_events_owner_type_time ON events(owner_id, event_type, occurred_at DESC);
            CREATE INDEX IF NOT EXISTS idx_events_conversation_time ON events(conversation_id, occurred_at DESC);
            CREATE INDEX IF NOT EXISTS idx_events_actor_time ON events(actor_id, occurred_at DESC);
            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, actor_id TEXT NOT NULL,
                role TEXT NOT NULL, text TEXT NOT NULL, occurred_at TEXT NOT NULL, channel_message_id TEXT NOT NULL
            ) STRICT;
            CREATE INDEX IF NOT EXISTS idx_messages_conversation_time ON messages(conversation_id, occurred_at DESC);
            CREATE TABLE IF NOT EXISTS actions (
                id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, event_id TEXT NOT NULL, conversation_id TEXT NOT NULL,
                message_id TEXT NOT NULL, type TEXT NOT NULL, domain TEXT NOT NULL, name TEXT NOT NULL,
                params_json TEXT NOT NULL, status TEXT NOT NULL, occurred_at TEXT NOT NULL,
                FOREIGN KEY(owner_id) REFERENCES owners(id) ON DELETE CASCADE,
                FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE CASCADE
            ) STRICT;
            CREATE INDEX IF NOT EXISTS idx_actions_conversation_time ON actions(conversation_id, occurred_at DESC);
            CREATE TABLE IF NOT EXISTS job_runs (
                id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, action_id TEXT NOT NULL, job_name TEXT NOT NULL,
                status TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT NOT NULL, result_json TEXT NOT NULL,
                FOREIGN KEY(owner_id) REFERENCES owners(id) ON DELETE CASCADE,
                FOREIGN KEY(action_id) REFERENCES actions(id) ON DELETE CASCADE
            ) STRICT;
            CREATE INDEX IF NOT EXISTS idx_job_runs_owner_time ON job_runs(owner_id, started_at DESC);
            CREATE TABLE IF NOT EXISTS setting_changes (
                id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, action_id TEXT NOT NULL, domain TEXT NOT NULL,
                setting_key TEXT NOT NULL, before_json TEXT NOT NULL, after_json TEXT NOT NULL, occurred_at TEXT NOT NULL,
                FOREIGN KEY(owner_id) REFERENCES owners(id) ON DELETE CASCADE,
                FOREIGN KEY(action_id) REFERENCES actions(id) ON DELETE CASCADE
            ) STRICT;
            CREATE TABLE IF NOT EXISTS artifacts (
                id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, event_id TEXT, action_id TEXT,
                artifact_type TEXT NOT NULL, title TEXT NOT NULL, summary TEXT NOT NULL,
                payload_json TEXT NOT NULL, occurred_at TEXT NOT NULL,
                FOREIGN KEY(owner_id) REFERENCES owners(id) ON DELETE CASCADE,
                FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE SET NULL,
                FOREIGN KEY(action_id) REFERENCES actions(id) ON DELETE SET NULL
            ) STRICT;
            CREATE INDEX IF NOT EXISTS idx_artifacts_owner_type_time ON artifacts(owner_id, artifact_type, occurred_at DESC);
            CREATE TABLE IF NOT EXISTS suggestions (
                id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, event_id TEXT,
                type TEXT NOT NULL, summary TEXT NOT NULL, payload_json TEXT NOT NULL,
                status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                FOREIGN KEY(owner_id) REFERENCES owners(id) ON DELETE CASCADE,
                FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE SET NULL
            ) STRICT;
            CREATE INDEX IF NOT EXISTS idx_suggestions_owner_time ON suggestions(owner_id, updated_at DESC);
            CREATE TABLE IF NOT EXISTS suggestion_actions (
                suggestion_id TEXT NOT NULL, action_id TEXT NOT NULL,
                PRIMARY KEY(suggestion_id, action_id),
                FOREIGN KEY(suggestion_id) REFERENCES suggestions(id) ON DELETE CASCADE,
                FOREIGN KEY(action_id) REFERENCES actions(id) ON DELETE CASCADE
            ) STRICT;
            CREATE TABLE IF NOT EXISTS topic_facets (
                id TEXT PRIMARY KEY, kind TEXT NOT NULL, scope TEXT NOT NULL,
                normalized_value TEXT NOT NULL, display_value TEXT NOT NULL, created_at TEXT NOT NULL
            ) STRICT;
            CREATE TABLE IF NOT EXISTS artifact_topic_facets (
                artifact_id TEXT NOT NULL, facet_id TEXT NOT NULL,
                PRIMARY KEY(artifact_id, facet_id),
                FOREIGN KEY(artifact_id) REFERENCES artifacts(id) ON DELETE CASCADE,
                FOREIGN KEY(facet_id) REFERENCES topic_facets(id) ON DELETE CASCADE
            ) STRICT;
            CREATE INDEX IF NOT EXISTS idx_artifact_topic_facets_facet ON artifact_topic_facets(facet_id, artifact_id);
            CREATE TABLE IF NOT EXISTS owner_topic_affinity (
                owner_id TEXT NOT NULL, kind TEXT NOT NULL, scope TEXT NOT NULL,
                normalized_value TEXT NOT NULL, display_value TEXT NOT NULL,
                score REAL NOT NULL, evidence_count INTEGER NOT NULL,
                last_observed_at TEXT NOT NULL, updated_at TEXT NOT NULL,
                PRIMARY KEY(owner_id, kind, scope, normalized_value),
                FOREIGN KEY(owner_id) REFERENCES owners(id) ON DELETE CASCADE
            ) STRICT;
            CREATE INDEX IF NOT EXISTS idx_owner_topic_affinity_rank
                ON owner_topic_affinity(owner_id, kind, score DESC, last_observed_at DESC);
            CREATE TABLE IF NOT EXISTS preferences (
                id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, value_json TEXT NOT NULL,
                confidence REAL NOT NULL, evidence_count INTEGER NOT NULL, updated_at TEXT NOT NULL
            ) STRICT;
            CREATE INDEX IF NOT EXISTS idx_preferences_user_time ON preferences(user_id, updated_at DESC);
            CREATE TABLE IF NOT EXISTS domain_knowledge (
                id TEXT PRIMARY KEY, domain TEXT NOT NULL, canonical_value TEXT NOT NULL,
                aliases_json TEXT NOT NULL, confidence REAL NOT NULL, evidence_count INTEGER NOT NULL, updated_at TEXT NOT NULL
            ) STRICT;
            CREATE INDEX IF NOT EXISTS idx_domain_knowledge_domain_time ON domain_knowledge(domain, updated_at DESC);
        `);
    }

    _ensureOwner(owner = {}) {
        const id = String(owner.owner_user_id || owner.id || '').trim();
        if (!id) throw new Error('owner_user_id가 필요합니다.');
        this.database.run(`INSERT INTO owners(id, identity_kind, created_at) VALUES (:id, :kind, :created_at)
            ON CONFLICT(id) DO UPDATE SET identity_kind = excluded.identity_kind`, {
            id,
            kind: String(owner.identity_kind || id.split(':')[0] || 'external'),
            created_at: iso(owner.created_at)
        });
        return id;
    }

    async ensureUser(user = {}) {
        await this.initialize();
        const id = String(user.id || '').trim();
        if (!id) return;
        this.database.run(`INSERT INTO users(id, channel, username, created_at) VALUES (:id, :channel, :username, :created_at)
            ON CONFLICT(id) DO UPDATE SET channel = excluded.channel, username = excluded.username`, {
            id, channel: String(user.channel || 'telegram'), username: String(user.username || ''), created_at: iso()
        });
    }

    async ensureConversation(conversation = {}, user = {}) {
        await this.initialize();
        const id = String(conversation.id || '').trim();
        if (!id) return;
        const timestamp = iso();
        this.database.run(`INSERT INTO conversations(id, channel, started_at, last_activity_at)
            VALUES (:id, :channel, :started_at, :last_activity_at)
            ON CONFLICT(id) DO UPDATE SET last_activity_at = excluded.last_activity_at`, {
            id, channel: String(conversation.channel || user.channel || 'telegram'), started_at: timestamp, last_activity_at: timestamp
        });
        if (user?.id) await this.ensureUser(user);
    }

    _insertArtifact(input = {}) {
        const id = String(input.id || `artifact_${crypto.randomUUID()}`);
        this.database.run(`INSERT OR IGNORE INTO artifacts(
            id, owner_id, event_id, action_id, artifact_type, title, summary, payload_json, occurred_at
        ) VALUES (:id, :owner_id, :event_id, :action_id, :artifact_type, :title, :summary, :payload_json, :occurred_at)`, {
            id,
            owner_id: input.ownerId,
            event_id: input.eventId || null,
            action_id: input.actionId || null,
            artifact_type: String(input.artifact_type || ''),
            title: String(input.title || ''),
            summary: String(input.summary || ''),
            payload_json: JSON.stringify(input.payload || {}),
            occurred_at: iso(input.timestamp)
        });
        if (input.artifact_type === 'topic') this._materializeTopicFacets(id, input.ownerId, input.payload, input.timestamp);
        return id;
    }

    _materializeTopicFacets(artifactId, ownerId, payload, timestamp) {
        for (const facet of buildTopicFacets(payload)) {
            this.database.run(`INSERT INTO topic_facets(id, kind, scope, normalized_value, display_value, created_at)
                VALUES (:id, :kind, :scope, :normalized_value, :display_value, :created_at)
                ON CONFLICT(id) DO UPDATE SET display_value = excluded.display_value`, {
                ...facet, created_at: iso(timestamp)
            });
            this.database.run('INSERT OR IGNORE INTO artifact_topic_facets(artifact_id, facet_id) VALUES (:artifact_id, :facet_id)', {
                artifact_id: artifactId, facet_id: facet.id
            });
            this.database.run(`INSERT INTO owner_topic_affinity(
                owner_id, kind, scope, normalized_value, display_value, score, evidence_count, last_observed_at, updated_at
            ) VALUES (:owner_id, :kind, :scope, :normalized_value, :display_value, 1.0, 1, :observed_at, :observed_at)
            ON CONFLICT(owner_id, kind, scope, normalized_value) DO UPDATE SET
                display_value = excluded.display_value,
                score = min(100.0, owner_topic_affinity.score + 1.0),
                evidence_count = owner_topic_affinity.evidence_count + 1,
                last_observed_at = excluded.last_observed_at,
                updated_at = excluded.updated_at`, {
                owner_id: ownerId,
                kind: facet.kind,
                scope: facet.scope,
                normalized_value: facet.normalized_value,
                display_value: facet.display_value,
                observed_at: iso(timestamp)
            });
        }
    }

    _upsertPreference(preference = {}, meta = {}) {
        const userId = String(meta.userId || '').trim();
        const name = String(preference.name || '').trim();
        if (!userId || !name) return null;
        const id = `${userId}:${name}`;
        const current = this.database.get('SELECT confidence, evidence_count FROM preferences WHERE id = :id', { id }) || {};
        const confidence = Number.isFinite(Number(preference.absoluteConfidence))
            ? Math.max(0, Math.min(1, Number(preference.absoluteConfidence)))
            : Math.max(0, Math.min(1, Number(current.confidence || 0) + Number(preference.confidenceDelta || 0.1)));
        const evidenceCount = Number(current.evidence_count || 0) + Number(preference.evidenceDelta || 1);
        this.database.run(`INSERT INTO preferences(id, user_id, name, value_json, confidence, evidence_count, updated_at)
            VALUES (:id, :user_id, :name, :value_json, :confidence, :evidence_count, :updated_at)
            ON CONFLICT(id) DO UPDATE SET value_json = excluded.value_json, confidence = excluded.confidence,
                evidence_count = excluded.evidence_count, updated_at = excluded.updated_at`, {
            id, user_id: userId, name, value_json: JSON.stringify(preference.value || {}), confidence,
            evidence_count: evidenceCount, updated_at: iso(meta.timestamp)
        });
        return { id, name, confidence, evidence_count: evidenceCount };
    }

    _upsertDomainKnowledge(entry = {}, timestamp) {
        const domain = String(entry.domain || '').trim();
        const canonicalValue = String(entry.canonical_value || '').trim();
        if (!domain || !canonicalValue) return null;
        const id = `${domain}:${canonicalValue}`;
        const current = this.database.get('SELECT aliases_json, confidence, evidence_count FROM domain_knowledge WHERE id = :id', { id }) || {};
        const aliases = Array.from(new Set([
            ...json(current.aliases_json, []),
            ...(Array.isArray(entry.aliases) ? entry.aliases : [])
        ].map((item) => String(item || '').trim()).filter(Boolean)));
        const confidence = Number.isFinite(Number(entry.absoluteConfidence)) ? Number(entry.absoluteConfidence)
            : Math.max(0, Math.min(1, Number(current.confidence || 0) + Number(entry.confidenceDelta || 0.1)));
        const evidenceCount = Number(current.evidence_count || 0) + Number(entry.evidenceDelta || 1);
        this.database.run(`INSERT INTO domain_knowledge(id, domain, canonical_value, aliases_json, confidence, evidence_count, updated_at)
            VALUES (:id, :domain, :canonical_value, :aliases_json, :confidence, :evidence_count, :updated_at)
            ON CONFLICT(id) DO UPDATE SET aliases_json = excluded.aliases_json, confidence = excluded.confidence,
                evidence_count = excluded.evidence_count, updated_at = excluded.updated_at`, {
            id, domain, canonical_value: canonicalValue, aliases_json: JSON.stringify(aliases), confidence,
            evidence_count: evidenceCount, updated_at: iso(timestamp)
        });
        return { id, domain, canonical_value: canonicalValue, aliases, confidence, evidence_count: evidenceCount };
    }

    _recordFeedbackPreference(kind, feedbackKey, feedback, userId, timestamp) {
        const key = String(feedbackKey || '').trim();
        const actor = String(userId || '').trim();
        if (!key || !actor) return null;
        const name = `${kind}_feedback.${key}`;
        const id = `${actor}:${name}`;
        const current = json(this.database.get('SELECT value_json FROM preferences WHERE id = :id', { id })?.value_json, {});
        const value = {
            helpful_count: Number(current.helpful_count || 0),
            not_helpful_count: Number(current.not_helpful_count || 0),
            accepted_count: Number(current.accepted_count || 0),
            rejected_count: Number(current.rejected_count || 0),
            feedback_key: key,
            last_feedback: feedback
        };
        const counter = `${String(feedback || '').trim()}_count`;
        if (Object.hasOwn(value, counter)) value[counter] += 1;
        const positive = value.helpful_count + value.accepted_count;
        const total = positive + value.not_helpful_count + value.rejected_count;
        return this._upsertPreference({ name, value, absoluteConfidence: total ? positive / total : 0, evidenceDelta: 1 }, { userId: actor, timestamp });
    }

    _upsertSuggestion(suggestion = {}, meta = {}) {
        const id = String(suggestion.id || '').trim();
        if (!id) return null;
        const existing = this.database.get('SELECT created_at, payload_json FROM suggestions WHERE id = :id', { id });
        const payload = suggestion.payload && typeof suggestion.payload === 'object'
            ? suggestion.payload
            : json(existing?.payload_json);
        const timestamp = iso(meta.timestamp);
        this.database.run(`INSERT INTO suggestions(
            id, owner_id, event_id, type, summary, payload_json, status, created_at, updated_at
        ) VALUES (:id, :owner_id, :event_id, :type, :summary, :payload_json, :status, :created_at, :updated_at)
        ON CONFLICT(id) DO UPDATE SET
            event_id = excluded.event_id, type = excluded.type, summary = excluded.summary,
            payload_json = excluded.payload_json, status = excluded.status, updated_at = excluded.updated_at`, {
            id,
            owner_id: meta.ownerId,
            event_id: meta.eventId || null,
            type: String(suggestion.type || 'recommendation'),
            summary: String(suggestion.summary || ''),
            payload_json: JSON.stringify(payload || {}),
            status: String(suggestion.status || 'proposed'),
            created_at: existing?.created_at || timestamp,
            updated_at: timestamp
        });
        for (const actionId of Array.isArray(meta.actionIds) ? meta.actionIds : []) {
            if (!String(actionId || '').trim()) continue;
            if (!this.database.get('SELECT 1 FROM actions WHERE id = :id', { id: String(actionId).trim() })) continue;
            this.database.run('INSERT OR IGNORE INTO suggestion_actions(suggestion_id, action_id) VALUES (:suggestion_id, :action_id)', {
                suggestion_id: id,
                action_id: String(actionId).trim()
            });
        }
        return { id, payload };
    }

    _materializeEvent(event, meta) {
        const payload = event.payload && typeof event.payload === 'object' ? event.payload : {};
        const type = String(event.event_type || '');
        if (['user.message.received', 'agent.message.sent'].includes(type) && payload.text) {
            const messageId = String(event.message_id || meta.eventId);
            this.database.run(`INSERT INTO messages(id, conversation_id, actor_id, role, text, occurred_at, channel_message_id)
                VALUES (:id, :conversation_id, :actor_id, :role, :text, :occurred_at, :channel_message_id)
                ON CONFLICT(id) DO UPDATE SET text = excluded.text`, {
                id: messageId,
                conversation_id: String(event.conversation_id || ''),
                actor_id: String(event.actor_id || ''),
                role: type.startsWith('agent') ? 'agent' : 'user',
                text: String(payload.text),
                occurred_at: iso(event.timestamp),
                channel_message_id: String(event.message_id || '')
            });
        }
        if (['content.topic.registered', 'shopping.item.recorded', 'memory.insight.updated'].includes(type)) {
            const artifactType = type === 'content.topic.registered' ? 'topic' : type === 'shopping.item.recorded' ? 'shopping_item' : 'user_insight';
            this._insertArtifact({
                ownerId: meta.ownerId,
                eventId: meta.eventId,
                artifact_type: artifactType,
                title: artifactType === 'topic' ? payload.subject : artifactType === 'shopping_item' ? payload.name : '사용자 인사이트',
                summary: artifactType === 'topic' ? `${payload.category || ''} | ${payload.subject || ''}` : artifactType === 'shopping_item' ? `${payload.mall || ''} | ${payload.name || ''}` : payload.summary,
                payload,
                timestamp: event.timestamp
            });
        }
        if (type === 'domain.alias.accepted' && payload.domain && payload.canonical_value) {
            this._upsertDomainKnowledge({
                domain: payload.domain,
                canonical_value: payload.canonical_value,
                aliases: [payload.raw_input].filter(Boolean),
                confidenceDelta: 0.2,
                evidenceDelta: 1
            }, event.timestamp);
        }
        if (type === 'agent.confirmation.requested' && payload.id) {
            this._upsertSuggestion({
                id: payload.id,
                type: 'confirmation',
                summary: Array.isArray(payload.previews) && payload.previews[0]
                    ? String(payload.previews[0].preview?.summary || '확인 요청')
                    : '확인 요청',
                payload: this._summarizeConfirmationPayload(payload),
                status: 'pending'
            }, {
                ownerId: meta.ownerId,
                eventId: meta.eventId,
                actionIds: Array.isArray(payload.actions) ? payload.actions.map((item) => item?.id).filter(Boolean) : [],
                timestamp: event.timestamp
            });
        }
        if (['agent.confirmation.accepted', 'agent.confirmation.rejected'].includes(type) && payload.confirmation_id) {
            this._upsertSuggestion({
                id: payload.confirmation_id,
                type: 'confirmation',
                summary: '확인 요청',
                status: type.endsWith('accepted') ? 'accepted' : 'rejected'
            }, { ownerId: meta.ownerId, eventId: meta.eventId, timestamp: event.timestamp });
        }
        if (['artifact.helpful', 'artifact.not_helpful'].includes(type) && payload.artifact_id) {
            const artifact = this.database.get('SELECT title, payload_json FROM artifacts WHERE id = :id', { id: String(payload.artifact_id) });
            const artifactPayload = json(artifact?.payload_json);
            this._recordFeedbackPreference('artifact', artifactPayload.feedback_key || artifact?.title, type.endsWith('helpful') && !type.endsWith('not_helpful') ? 'helpful' : 'not_helpful', event.actor_id, event.timestamp);
        }
        if (['suggestion.accepted', 'suggestion.rejected', 'suggestion.helpful', 'suggestion.not_helpful'].includes(type) && payload.suggestion_id) {
            const existing = this.database.get('SELECT type, summary, payload_json FROM suggestions WHERE id = :id', {
                id: String(payload.suggestion_id)
            });
            const existingPayload = json(existing?.payload_json);
            const feedback = type.split('.').pop();
            const feedbackKey = String(payload.feedback_key || existingPayload.feedback_key || '').trim();
            const suggestionPayload = payload.payload && typeof payload.payload === 'object'
                ? this._summarizeSuggestionPayload(payload.payload)
                : existingPayload;
            if (feedbackKey) suggestionPayload.feedback_key = feedbackKey;
            this._upsertSuggestion({
                id: payload.suggestion_id,
                type: payload.type || existing?.type || 'recommendation',
                summary: payload.summary || existing?.summary || '',
                payload: suggestionPayload,
                status: feedback
            }, { ownerId: meta.ownerId, eventId: meta.eventId, timestamp: event.timestamp });
            this._recordFeedbackPreference('suggestion', feedbackKey, feedback, event.actor_id, event.timestamp);
        }
        if (type === 'agent.intent.parsed' && Array.isArray(payload.envelope?.actions)) {
            for (const action of payload.envelope.actions) {
                this._insertAction(action, event, meta, action.requires_confirmation ? 'pending_confirmation' : 'parsed');
            }
        }
        if (type.startsWith('capability.') && payload.action) {
            const action = payload.action;
            const actionId = this._insertAction(action, event, meta, payload.result?.success === false ? 'failed' : 'executed');
            if (action.type === 'setting.update') {
                this.database.run(`INSERT OR IGNORE INTO setting_changes(id, owner_id, action_id, domain, setting_key, before_json, after_json, occurred_at)
                    VALUES (:id, :owner_id, :action_id, :domain, :setting_key, :before_json, :after_json, :occurred_at)`, {
                    id: `setting_${crypto.randomUUID()}`, owner_id: meta.ownerId, action_id: actionId,
                    domain: String(action.domain || ''), setting_key: `${action.domain || ''}.${action.name || ''}`,
                    before_json: '{}', after_json: JSON.stringify(payload.result?.data || {}), occurred_at: iso(event.timestamp)
                });
            }
            if (action.type === 'setting.update' && action.domain === 'settings.trends' && action.name === 'add_category' && action.params?.category) {
                this._upsertDomainKnowledge({ domain: 'trends.category', canonical_value: action.params.category, confidenceDelta: 0.1, evidenceDelta: 1 }, event.timestamp);
            }
            for (const preference of buildPreferenceUpdatesFromEvent(event)) {
                this._upsertPreference(preference, { userId: String(event.actor_id || ''), timestamp: event.timestamp });
            }
            if (action.type === 'content.generate') {
                for (const idea of Array.isArray(payload.result?.data?.ideas) ? payload.result.data.ideas : []) {
                    this._insertArtifact({
                        id: idea.id, ownerId: meta.ownerId, eventId: meta.eventId, actionId,
                        artifact_type: 'content_idea', title: idea.title, summary: idea.summary,
                        payload: this._summarizeArtifactPayload(idea), timestamp: event.timestamp
                    });
                }
            }
            if (action.type === 'job.run') {
                this.database.run(`INSERT OR IGNORE INTO job_runs(id, owner_id, action_id, job_name, status, started_at, finished_at, result_json)
                    VALUES (:id, :owner_id, :action_id, :job_name, :status, :started_at, :finished_at, :result_json)`, {
                    id: `job_${crypto.randomUUID()}`, owner_id: meta.ownerId, action_id: actionId,
                    job_name: `${action.domain || ''}.${action.name || ''}`, status: payload.result?.success === false ? 'failed' : 'completed',
                    started_at: iso(event.timestamp), finished_at: iso(event.timestamp), result_json: JSON.stringify(this._summarizeResult(payload.result || {}))
                });
            }
        }
    }

    _insertAction(action = {}, event = {}, meta = {}, status = 'parsed') {
        const actionId = String(action.id || `action_${crypto.randomUUID()}`);
        this.database.run(`INSERT INTO actions(id, owner_id, event_id, conversation_id, message_id, type, domain, name, params_json, status, occurred_at)
            VALUES (:id, :owner_id, :event_id, :conversation_id, :message_id, :type, :domain, :name, :params_json, :status, :occurred_at)
            ON CONFLICT(id) DO UPDATE SET status = excluded.status`, {
            id: actionId, owner_id: meta.ownerId, event_id: meta.eventId,
            conversation_id: String(event.conversation_id || ''), message_id: String(event.message_id || ''),
            type: String(action.type || ''), domain: String(action.domain || ''), name: String(action.name || ''),
            params_json: JSON.stringify(this._compactValue(action.params || {}, { maxDepth: 2, maxArray: 6, maxString: 200 })),
            status, occurred_at: iso(event.timestamp)
        });
        return actionId;
    }

    async appendEvent(event = {}) {
        await this.initialize();
        const id = String(event.id || `evt_${crypto.randomUUID()}`);
        const ownerId = String(event.owner_user_id || event.ownerUserId || this.owner?.owner_user_id || '').trim();
        if (!ownerId) throw new Error('이벤트 소유자를 확인할 수 없습니다.');
        this._ensureOwner(ownerId === this.owner?.owner_user_id ? this.owner : { owner_user_id: ownerId });
        const actorId = String(event.actor_id || '').trim();
        const conversationId = String(event.conversation_id || '').trim();
        if (conversationId) await this.ensureConversation(event.conversation || { id: conversationId, channel: event.channel || 'local' }, event.user || { id: actorId, channel: event.channel || 'local' });
        else if (actorId) await this.ensureUser(event.user || { id: actorId, channel: event.channel || 'local' });
        const summarized = this._summarizeEventPayload(String(event.event_type || ''), event.payload || {});
        const provenance = normalizeInteractionProvenance(event, { request_id: event.payload?.request_id, source: event.payload?.source });
        const normalizedEvent = { ...event, id, timestamp: iso(event.timestamp) };
        this.database.transaction(() => {
            this.database.run(`INSERT INTO events(id, owner_id, event_type, occurred_at, actor_type, actor_id, conversation_id, message_id, payload_json)
                VALUES (:id, :owner_id, :event_type, :occurred_at, :actor_type, :actor_id, :conversation_id, :message_id, :payload_json)`, {
                id, owner_id: ownerId, event_type: String(event.event_type || ''), occurred_at: normalizedEvent.timestamp,
                actor_type: String(event.actor_type || 'user'), actor_id: actorId, conversation_id: conversationId,
                message_id: String(event.message_id || ''), payload_json: JSON.stringify({ ...summarized, provenance })
            });
            this._materializeEvent(normalizedEvent, { eventId: id, ownerId });
        });
        return { id, owner_user_id: ownerId };
    }

    _event(row) {
        return row ? { id: row.id, event_type: row.event_type, timestamp: row.occurred_at, actor_type: row.actor_type, actor_id: row.actor_id, conversation_id: row.conversation_id, message_id: row.message_id, payload: json(row.payload_json) } : null;
    }

    _artifact(row) {
        return row ? { id: row.id, artifact_type: row.artifact_type, title: row.title, summary: row.summary, timestamp: row.occurred_at, payload: json(row.payload_json) } : null;
    }

    async listConversationEvents(conversationId, limit = 20) {
        await this.initialize();
        return this.database.all('SELECT * FROM events WHERE conversation_id = :id ORDER BY occurred_at DESC LIMIT :limit', { id: String(conversationId || ''), limit: boundedLimit(limit, 20) }).map((r) => this._event(r));
    }

    async listRecentMessages(conversationId, limit = 10) {
        await this.initialize();
        return this.database.all('SELECT id, role, text, occurred_at AS timestamp, channel_message_id FROM messages WHERE conversation_id = :id ORDER BY occurred_at DESC LIMIT :limit', { id: String(conversationId || ''), limit: boundedLimit(limit, 10) });
    }

    async listRecentActions(conversationId, limit = 10) {
        await this.initialize();
        return this.database.all('SELECT id, type, domain, name, params_json, status, occurred_at AS timestamp FROM actions WHERE conversation_id = :id ORDER BY occurred_at DESC LIMIT :limit', { id: String(conversationId || ''), limit: boundedLimit(limit, 10) }).map((r) => ({ ...r, params: json(r.params_json) }));
    }

    async listRecentSettingChanges(conversationId, limit = 10) {
        await this.initialize();
        return this.database.all(`SELECT s.id, s.domain, s.setting_key, s.before_json, s.after_json, s.occurred_at AS timestamp
            FROM setting_changes s JOIN actions a ON a.id = s.action_id WHERE a.conversation_id = :id
            ORDER BY s.occurred_at DESC LIMIT :limit`, { id: String(conversationId || ''), limit: boundedLimit(limit, 10) });
    }

    async listRecentJobRuns(conversationId, limit = 10) {
        await this.initialize();
        return this.database.all(`SELECT j.id, j.job_name, j.status, j.started_at, j.finished_at, j.result_json
            FROM job_runs j JOIN actions a ON a.id = j.action_id WHERE a.conversation_id = :id
            ORDER BY j.started_at DESC LIMIT :limit`, { id: String(conversationId || ''), limit: boundedLimit(limit, 10) });
    }

    async listRecentArtifacts(conversationId, artifactType = '', limit = 10) {
        await this.initialize();
        const condition = artifactType ? 'AND artifact_type = :type' : '';
        const params = { id: String(conversationId || ''), limit: boundedLimit(limit, 10) };
        if (artifactType) params.type = String(artifactType);
        return this.database.all(`SELECT * FROM artifacts WHERE event_id IN (SELECT id FROM events WHERE conversation_id = :id) ${condition} ORDER BY occurred_at DESC LIMIT :limit`, params).map((r) => this._artifact(r));
    }

    _resolveOwnerUserId(ownerUserId = '') {
        const value = String(ownerUserId || this.owner?.owner_user_id || '').trim();
        if (!value) throw new Error('owner_user_id가 필요합니다.');
        return value;
    }

    async listOwnerEvents(ownerUserId = '', options = {}) {
        await this.initialize();
        const owner = this._resolveOwnerUserId(ownerUserId);
        const limit = boundedLimit(options.limit, 100, 5000);
        const type = String(options.eventType || options.event_type || '');
        const prefix = String(options.eventTypePrefix || options.event_type_prefix || '');
        let sql = 'SELECT * FROM events WHERE owner_id = :owner';
        if (type) sql += ' AND event_type = :type';
        else if (prefix) sql += ' AND event_type LIKE :prefix';
        sql += ' ORDER BY occurred_at DESC LIMIT :limit';
        const params = { owner, limit };
        if (type) params.type = type;
        else if (prefix) params.prefix = `${prefix}%`;
        return this.database.all(sql, params).map((r) => this._event(r));
    }

    async listOwnerBlogPublishResultEvents(ownerUserId = '', options = {}) {
        return this.listOwnerEvents(ownerUserId, { eventTypePrefix: 'activity.lifecycle.blog.', limit: boundedLimit(options.limit, 5000, 5000) });
    }

    async listOwnerJobRuns(ownerUserId = '', options = {}) {
        await this.initialize();
        return this.database.all('SELECT id, job_name, status, started_at, finished_at FROM job_runs WHERE owner_id = :owner ORDER BY started_at DESC LIMIT :limit', { owner: this._resolveOwnerUserId(ownerUserId), limit: boundedLimit(options.limit, 40, 200) });
    }

    async listOwnerArtifacts(ownerUserId = '', options = {}) {
        await this.initialize();
        const type = String(options.artifactType || options.artifact_type || '');
        const sql = `SELECT * FROM artifacts WHERE owner_id = :owner ${type ? 'AND artifact_type = :type' : ''} ORDER BY occurred_at DESC LIMIT :limit`;
        const params = { owner: this._resolveOwnerUserId(ownerUserId), limit: boundedLimit(options.limit, 100) };
        if (type) params.type = type;
        return this.database.all(sql, params).map((r) => this._artifact(r));
    }

    async getOwnerActivitySignalSummary(ownerUserId = '', options = {}) {
        const owner = this._resolveOwnerUserId(ownerUserId);
        const scanLimit = boundedLimit(options.scanLimit || options.scan_limit, 200);
        return buildOwnerActivitySignalSummary({ owner_user_id: owner, artifacts: await this.listOwnerArtifacts(owner, { limit: scanLimit }), events: await this.listOwnerEvents(owner, { eventTypePrefix: 'activity.lifecycle.', limit: scanLimit }), domains: options.domains, limit: options.limit });
    }

    async listOwnerTopicFacets(ownerUserId = '', options = {}) {
        await this.initialize();
        const owner = this._resolveOwnerUserId(ownerUserId);
        const kind = String(options.kind || '').trim().toLowerCase();
        const scope = String(options.scope || '').trim().toLowerCase();
        if (kind && !TOPIC_FACET_KINDS.includes(kind)) throw new Error(`지원하지 않는 topic facet kind입니다: ${kind}`);
        if (scope && !TOPIC_FACET_SCOPES.includes(scope)) throw new Error(`지원하지 않는 topic facet scope입니다: ${scope}`);
        let where = 'owner_id = :owner';
        if (kind) where += ' AND kind = :kind';
        if (scope) where += ' AND scope = :scope';
        const params = { owner, limit: boundedLimit(options.limit, 20, 100) };
        if (kind) params.kind = kind;
        if (scope) params.scope = scope;
        const rows = this.database.all(`SELECT kind || ':' || scope || ':' || normalized_value AS id,
            kind, scope, normalized_value, display_value, evidence_count, last_observed_at AS last_used_at
            FROM owner_topic_affinity WHERE ${where}
            ORDER BY score DESC, last_observed_at DESC, normalized_value ASC LIMIT :limit`, {
            ...params
        });
        return rows.map((row) => {
            const contexts = this.database.all(`SELECT a.title, a.payload_json, a.occurred_at FROM artifacts a
                JOIN artifact_topic_facets af ON af.artifact_id = a.id JOIN topic_facets f ON f.id = af.facet_id
                WHERE f.kind = :kind AND f.scope = :scope AND f.normalized_value = :value AND a.owner_id = :owner
                ORDER BY a.occurred_at DESC LIMIT 3`, { kind: row.kind, scope: row.scope, value: row.normalized_value, owner }).map((item) => {
                const payload = json(item.payload_json);
                return { title: item.title, subject: payload.subject || item.title, source: payload.source || '', category: payload.category || '', platform: payload.platform || '', instruction: payload.instruction || '', timestamp: item.occurred_at };
            });
            return { ...row, evidence_count: Number(row.evidence_count || 0), evidence_contexts: contexts };
        });
    }

    async getOwnerTopicSemanticSummary(ownerUserId = '', options = {}) {
        const owner = this._resolveOwnerUserId(ownerUserId);
        const limit = boundedLimit(options.limit, 10, 50);
        return { owner_user_id: owner, keywords: await this.listOwnerTopicFacets(owner, { kind: 'keyword', limit }), categories: await this.listOwnerTopicFacets(owner, { kind: 'category', limit }), platforms: await this.listOwnerTopicFacets(owner, { kind: 'platform', limit }) };
    }

    async getOwnerProfileProjection(ownerUserId = '', options = {}) {
        const owner = this._resolveOwnerUserId(ownerUserId);
        const limit = boundedLimit(options.limit, 20, 50);
        return buildOwnerProfileProjection({ owner_user_id: owner, activity: await this.getOwnerActivitySignalSummary(owner, { limit: Math.max(30, limit * 3), scanLimit: options.scanLimit || 300 }), topic_semantics: await this.getOwnerTopicSemanticSummary(owner, { limit }) });
    }

    async recordMessage(chatId, text, intent = 'UNKNOWN', sender = 'USER') {
        const userId = String(chatId || '').trim();
        if (!userId || !String(text || '').trim()) return null;
        const agent = String(sender).toUpperCase() === 'AGENT';
        const id = `${agent ? 'agent' : 'user'}_msg_${crypto.randomUUID()}`;
        const result = await this.appendEvent({ id, event_type: agent ? 'agent.message.sent' : 'user.message.received', actor_type: agent ? 'agent' : 'user', actor_id: userId, conversation_id: `telegram:${userId}`, message_id: id, channel: 'telegram', payload: { text: String(text).trim(), intent: String(intent || 'UNKNOWN') } });
        return result.id;
    }

    async recordInteractionMessage(provenanceInput = {}, text = '', intent = 'UNKNOWN', sender = 'USER') {
        if (!String(text || '').trim()) return null;
        const provenance = normalizeInteractionProvenance(provenanceInput);
        const agent = String(sender).toUpperCase() === 'AGENT';
        const identity = [provenance.channel, provenance.conversation_id, provenance.message_id, agent ? 'agent' : 'user'].join(':');
        const id = provenance.message_id ? `message_${crypto.createHash('sha256').update(identity).digest('hex')}` : '';
        if (id) { await this.initialize(); if (this.database.get('SELECT 1 FROM events WHERE id = :id', { id })) return id; }
        const result = await this.appendEvent({ ...(id ? { id } : {}), event_type: agent ? 'agent.message.sent' : 'user.message.received', actor_type: agent ? 'agent' : provenance.actor_type, actor_id: agent ? 'AGENT' : provenance.actor_id, conversation_id: provenance.conversation_id, message_id: provenance.message_id, channel: provenance.channel, payload: { text: String(text || '').trim(), intent: String(intent || 'UNKNOWN'), request_id: provenance.request_id } });
        return result.id;
    }

    async getHistory(chatId, limit = 10) {
        return (await this.listRecentMessages(`telegram:${String(chatId || '').trim()}`, limit)).map((item) => ({ text: item.text, intent: String(item.role).toUpperCase() === 'AGENT' ? 'AGENT' : 'UNKNOWN', timestamp: item.timestamp, sender: String(item.role).toUpperCase() === 'AGENT' ? 'AGENT' : 'USER' }));
    }

    async updateUserInsight(chatId, summary) {
        const userId = String(chatId || '').trim();
        const insight = String(summary || '').trim();
        if (!userId || !insight) return null;
        const result = await this.appendEvent({ event_type: 'memory.insight.updated', actor_type: 'agent', actor_id: userId, conversation_id: `telegram:${userId}`, channel: 'telegram', payload: { summary: insight } });
        return result.id;
    }

    async getUserInsight(chatId) {
        await this.initialize();
        return String(this.database.get(`SELECT a.summary FROM artifacts a JOIN events e ON e.id = a.event_id
            WHERE e.actor_id = :id AND a.artifact_type = 'user_insight' ORDER BY a.occurred_at DESC LIMIT 1`, { id: String(chatId || '') })?.summary || '');
    }

    async getFeedbackTarget(kind = '', targetId = '') {
        if (String(kind || '').trim().toLowerCase() !== 'artifact') return null;
        await this.initialize();
        const row = this.database.get('SELECT * FROM artifacts WHERE id = :id LIMIT 1', { id: String(targetId || '') });
        return row ? resolveArtifactFeedbackTarget(this._artifact(row)) : null;
    }

    async recordTopic(chatId, topicData = {}, provenanceInput = {}) {
        const actor = String(chatId || 'SYSTEM');
        const p = normalizeInteractionProvenance(provenanceInput, chatId ? { channel: 'telegram', actor_type: 'user', actor_id: actor, conversation_id: `telegram:${actor}` } : { channel: 'local', actor_type: 'system', actor_id: 'SYSTEM' });
        return this.appendEvent({ event_type: 'content.topic.registered', actor_type: p.actor_type, actor_id: p.actor_id, conversation_id: p.conversation_id, message_id: p.message_id, channel: p.channel, payload: { subject: topicData.subject || '', platform: topicData.platform || '', category: topicData.category || '', keywords: topicData.keywords || '', instruction: topicData.instruction || '', source: topicData.source || 'manual', request_id: p.request_id } });
    }

    async recordShoppingItem(chatId, itemData = {}, provenanceInput = {}) {
        const actor = String(chatId || 'SYSTEM');
        const p = normalizeInteractionProvenance(provenanceInput, chatId ? { channel: 'telegram', actor_type: 'user', actor_id: actor, conversation_id: `telegram:${actor}` } : { channel: 'local', actor_type: 'system', actor_id: 'SYSTEM' });
        return this.appendEvent({ event_type: 'shopping.item.recorded', actor_type: p.actor_type, actor_id: p.actor_id, conversation_id: p.conversation_id, message_id: p.message_id, channel: p.channel, payload: { name: itemData.name || '', price: itemData.price || '', mall: itemData.mall || '', source: itemData.source || 'manual', request_id: p.request_id } });
    }

    async recordActivityLifecycle(input = {}) {
        const evidence = normalizeActivityEvidence(input);
        await this.initialize();
        if (evidence.id && this.database.get('SELECT 1 FROM events WHERE id = :id', { id: evidence.id })) return { id: evidence.id, owner_user_id: this._resolveOwnerUserId(evidence.owner_user_id), deduplicated: true };
        return { ...(await this.appendEvent({ ...evidence, owner_user_id: evidence.owner_user_id })), deduplicated: false };
    }

    async getTopicSummary(chatId, options = {}) {
        await this.initialize();
        const category = String(options.category || '');
        const params = { actor: String(chatId || ''), limit: boundedLimit(options.limit, 5) };
        if (category) params.category = `${category} |%`;
        return this.database.all(`SELECT a.* FROM artifacts a JOIN events e ON e.id = a.event_id
            WHERE e.actor_id = :actor AND a.artifact_type = 'topic' ${category ? 'AND a.summary LIKE :category' : ''}
            ORDER BY a.occurred_at DESC LIMIT :limit`, params).map((r) => { const p = json(r.payload_json); return { subject: r.title || p.subject || '', category: p.category || '', timestamp: r.occurred_at, source: p.source || '' }; });
    }

    async getShoppingSummary(chatId, options = {}) {
        await this.initialize();
        return this.database.all(`SELECT a.* FROM artifacts a JOIN events e ON e.id = a.event_id
            WHERE e.actor_id = :actor AND a.artifact_type = 'shopping_item' ORDER BY a.occurred_at DESC LIMIT :limit`, { actor: String(chatId || ''), limit: boundedLimit(options.limit, 5) }).map((r) => { const p = json(r.payload_json); return { name: r.title || p.name || '', price: p.price || '', mall: p.mall || '', timestamp: r.occurred_at }; });
    }

    async getGlobalStats() {
        await this.initialize();
        return { users: Number(this.database.get('SELECT count(*) AS n FROM users').n), messages: Number(this.database.get('SELECT count(*) AS n FROM messages').n), topics: Number(this.database.get("SELECT count(*) AS n FROM artifacts WHERE artifact_type = 'topic'").n), shopping: Number(this.database.get("SELECT count(*) AS n FROM artifacts WHERE artifact_type = 'shopping_item'").n) };
    }

    async listDomainKnowledge(domain, limit = 20) {
        await this.initialize();
        return this.database.all('SELECT * FROM domain_knowledge WHERE domain = :domain ORDER BY updated_at DESC LIMIT :limit', { domain: String(domain || ''), limit: boundedLimit(limit, 20) }).map((r) => ({ ...r, aliases: json(r.aliases_json, []) }));
    }

    async listUserPreferences(userId, limit = 10) {
        await this.initialize();
        return this.database.all('SELECT * FROM preferences WHERE user_id = :id ORDER BY updated_at DESC LIMIT :limit', { id: String(userId || ''), limit: boundedLimit(limit, 10) }).map((r) => ({ ...r, value: json(r.value_json) }));
    }

    getLocalOwnerIdentity() { return this.owner ? { ...this.owner } : this.ownerIdentity.resolve(); }

    async getOwnerMemoryStats(ownerUserId = '') {
        await this.initialize();
        const owner = this._resolveOwnerUserId(ownerUserId);
        return { owner_user_id: owner, event_count: Number(this.database.get('SELECT count(*) AS n FROM events WHERE owner_id = :owner', { owner }).n), artifact_count: Number(this.database.get('SELECT count(*) AS n FROM artifacts WHERE owner_id = :owner', { owner }).n), orphan_event_count: 0, orphan_artifact_count: 0 };
    }

    async getOwnerCollectionAudit(ownerUserId = '', options = {}) {
        const owner = this._resolveOwnerUserId(ownerUserId);
        const limit = boundedLimit(options.limit, 500, 5000);
        const events = await this.listOwnerEvents(owner, { limit });
        const artifacts = await this.listOwnerArtifacts(owner, { limit });
        return buildMemoryCollectionAudit({ owner_user_id: owner, events, artifacts, stats: await this.getOwnerMemoryStats(owner), truncated: events.length >= limit || artifacts.length >= limit });
    }

    async createRecommendation(recommendation, context = {}) { await this.initialize(); return this.recommendationStore.createRecommendation(recommendation, context); }
    async transitionRecommendation(command = {}) { await this.initialize(); return this.recommendationStore.transitionRecommendation(command); }
    async getRecommendation(ownerUserId, recommendationId) { await this.initialize(); return this.recommendationStore.getRecommendation(ownerUserId, recommendationId); }
    async findActiveByDedupeKey(ownerUserId, dedupeKey, now) { await this.initialize(); return this.recommendationStore.findActiveByDedupeKey(ownerUserId, dedupeKey, now); }
    async listAvailableRecommendations(ownerUserId, options = {}) { await this.initialize(); return this.recommendationStore.listAvailableRecommendations(ownerUserId, options); }
    async listRecommendations(ownerUserId, options = {}) { await this.initialize(); return this.recommendationStore.listRecommendations(ownerUserId, options); }
    async reconcileDueRecommendations(ownerUserId, options = {}) { await this.initialize(); return this.recommendationStore.reconcileDueRecommendations(ownerUserId, options); }
    getRecommendationStoreStatus() { return this.recommendationStore?.getRecommendationStoreStatus?.() || { mode: 'unavailable', reason: 'not_initialized' }; }

    async runMaintenance(options = {}) {
        await this.initialize();
        const prune = this.recommendationStore.repository?.prune?.(options) || null;
        const now = new Date(options.now || Date.now());
        const cutoff = (days) => new Date(now.getTime() - days * 86400000).toISOString();
        const batchSize = Math.max(1, Math.min(500, Number.parseInt(options.batchSize, 10) || 200));
        const memory = this.database.transaction(() => {
            const messages = this.database.run(`DELETE FROM messages WHERE id IN (
                SELECT id FROM messages WHERE occurred_at < :cutoff ORDER BY occurred_at ASC LIMIT :limit
            )`, { cutoff: cutoff(30), limit: batchSize });
            const messageCap = this.database.run(`DELETE FROM messages WHERE id IN (
                SELECT id FROM (SELECT id, row_number() OVER (PARTITION BY conversation_id ORDER BY occurred_at DESC, id DESC) AS position FROM messages)
                WHERE position > 500 LIMIT :limit
            )`, { limit: batchSize });
            const artifacts = this.database.run(`DELETE FROM artifacts WHERE id IN (
                SELECT id FROM artifacts WHERE occurred_at < :cutoff ORDER BY occurred_at ASC LIMIT :limit
            )`, { cutoff: cutoff(180), limit: batchSize });
            const artifactCap = this.database.run(`DELETE FROM artifacts WHERE id IN (
                SELECT id FROM (SELECT id, row_number() OVER (PARTITION BY owner_id ORDER BY occurred_at DESC, id DESC) AS position FROM artifacts)
                WHERE position > 2000 LIMIT :limit
            )`, { limit: batchSize });
            const suggestions = this.database.run(`DELETE FROM suggestions WHERE id IN (
                SELECT id FROM suggestions WHERE updated_at < :cutoff ORDER BY updated_at ASC LIMIT :limit
            )`, { cutoff: cutoff(180), limit: batchSize });
            const suggestionCap = this.database.run(`DELETE FROM suggestions WHERE id IN (
                SELECT id FROM (SELECT id, row_number() OVER (PARTITION BY owner_id ORDER BY updated_at DESC, id DESC) AS position FROM suggestions)
                WHERE position > 1000 LIMIT :limit
            )`, { limit: batchSize });
            const events = this.database.run(`DELETE FROM events WHERE id IN (
                SELECT id FROM events WHERE occurred_at < :cutoff ORDER BY occurred_at ASC LIMIT :limit
            )`, { cutoff: cutoff(90), limit: batchSize });
            const eventCap = this.database.run(`DELETE FROM events WHERE id IN (
                SELECT id FROM (SELECT id, row_number() OVER (PARTITION BY owner_id ORDER BY occurred_at DESC, id DESC) AS position FROM events)
                WHERE position > 10000 LIMIT :limit
            )`, { limit: batchSize });
            this.database.run(`UPDATE owner_topic_affinity SET score = score * 0.98, updated_at = :now
                WHERE last_observed_at < :cutoff`, { now: now.toISOString(), cutoff: cutoff(30) });
            const insights = this.database.run(`DELETE FROM owner_topic_affinity
                WHERE score < 0.1 AND last_observed_at < :cutoff`, { cutoff: cutoff(180) });
            const facets = this.database.run('DELETE FROM topic_facets WHERE id NOT IN (SELECT DISTINCT facet_id FROM artifact_topic_facets)');
            return {
                messages: Number(messages.changes || 0) + Number(messageCap.changes || 0),
                artifacts: Number(artifacts.changes || 0) + Number(artifactCap.changes || 0),
                suggestions: Number(suggestions.changes || 0) + Number(suggestionCap.changes || 0),
                events: Number(events.changes || 0) + Number(eventCap.changes || 0),
                orphan_facets: Number(facets.changes || 0),
                expired_insights: Number(insights.changes || 0)
            };
        });
        this.database.checkpoint('PASSIVE');
        const before = this.database.diagnostics();
        if (before.free_pages > 256) this.database.incrementalVacuum(Math.min(before.free_pages, 1024));
        return { recommendations: prune, memory, before, after: this.database.diagnostics() };
    }

    close() {
        try { this.database?.checkpoint('TRUNCATE'); } catch (_ignore) { }
        this.database?.close();
        this.database = null;
        this.isInitialized = false;
        this.initPromise = null;
    }
}

module.exports = { SQLITE_MEMORY_FILENAME, SQLITE_MEMORY_GENERATION, SQLiteEventStore };
