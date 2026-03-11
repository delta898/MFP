const kuzu = require('kuzu');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { buildPreferenceUpdatesFromEvent } = require('./extractors/preferences');

class KuzuEventStore {
    constructor(options = {}) {
        this.Logger = options.Logger || console;
        this.baseDir = String(options.baseDir || process.cwd());
        this.dbPath = String(options.dbPath || path.join(this.baseDir, 'data', 'agent_memory_db'));
        this.db = null;
        this.conn = null;
        this.isInitialized = false;
        this.initPromise = null;
    }

    async initialize() {
        if (this.isInitialized) return;
        if (this.initPromise) return this.initPromise;

        this.initPromise = (async () => {
            const dataDir = path.dirname(this.dbPath);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }

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
                'CREATE REL TABLE UserHAS_CONVERSATION(FROM AgentUserNode TO ConversationNode)',
                'CREATE REL TABLE ConversationHAS_EVENT(FROM ConversationNode TO EventNode)',
                'CREATE REL TABLE UserTRIGGERED_EVENT(FROM AgentUserNode TO EventNode)',
                'CREATE REL TABLE ConversationHAS_MESSAGE(FROM ConversationNode TO MessageNode)',
                'CREATE REL TABLE UserSENT_MESSAGE(FROM AgentUserNode TO MessageNode)',
                'CREATE REL TABLE MessagePARSED_TO_ACTION(FROM MessageNode TO ActionNode)',
                'CREATE REL TABLE ActionCHANGED_SETTING(FROM ActionNode TO SettingChangeNode)',
                'CREATE REL TABLE ActionTRIGGERED_JOB(FROM ActionNode TO JobRunNode)',
                'CREATE REL TABLE ActionPRODUCED_ARTIFACT(FROM ActionNode TO ArtifactNode)',
                'CREATE REL TABLE UserHAS_PREFERENCE(FROM AgentUserNode TO PreferenceNode)',
                'CREATE REL TABLE UserACCEPTED_SUGGESTION(FROM AgentUserNode TO SuggestionNode)',
                'CREATE REL TABLE UserREJECTED_SUGGESTION(FROM AgentUserNode TO SuggestionNode)',
                'CREATE REL TABLE PreferenceDERIVED_FROM_ACTION(FROM PreferenceNode TO ActionNode)',
                'CREATE REL TABLE DomainKnowledgeDERIVED_FROM_ACTION(FROM DomainKnowledgeNode TO ActionNode)',
                'CREATE REL TABLE SuggestionDERIVED_FROM_ACTION(FROM SuggestionNode TO ActionNode)',
                'CREATE REL TABLE EventHAS_ACTION(FROM EventNode TO ActionNode)',
                'CREATE REL TABLE EventHAS_SUGGESTION(FROM EventNode TO SuggestionNode)'
            ];

            for (const query of queries) {
                try {
                    await this.conn.query(query);
                } catch (error) {
                    if (!String(error.message || '').includes('already exists')) throw error;
                }
            }

            this.isInitialized = true;
        })();

        return this.initPromise;
    }

    async _runQuery(query, params = {}) {
        await this.initialize();
        if (!params || Object.keys(params).length === 0) {
            return this.conn.query(query);
        }
        const prepared = await this.conn.prepare(query);
        return this.conn.execute(prepared, params);
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

        if (eventType === 'user.message.received' && payload.text) {
            await this._upsertMessageNode({
                conversationId,
                actorId,
                actorType,
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
                payload,
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
                payload,
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
                payload: (payload.payload && typeof payload.payload === 'object') ? payload.payload : (existingSuggestion?.payload || {}),
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
                        payload: suggestion.payload || {},
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
                        payload: idea
                    }, {
                        actionId,
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
    }

    async appendEvent(event = {}) {
        const id = String(event.id || `evt_${crypto.randomUUID()}`);
        const timestamp = String(event.timestamp || new Date().toISOString()).replace('T', ' ').replace('Z', '');
        const actorType = String(event.actor_type || 'user').trim();
        const actorId = String(event.actor_id || '').trim();
        const conversationId = String(event.conversation_id || '').trim();
        const messageId = String(event.message_id || '').trim();
        const payloadJson = JSON.stringify(event.payload || {});
        const user = event.user || { id: actorId, channel: event.channel || 'telegram', username: event.username || '' };
        const conversation = event.conversation || { id: conversationId, channel: event.channel || 'telegram' };

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
        }

        await this._materializeTypedNodes(event, { eventId: id });

        return { id };
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
}

module.exports = {
    KuzuEventStore
};
