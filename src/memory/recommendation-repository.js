const ACTIVE_STATUSES = Object.freeze(['available', 'snoozed', 'action_in_progress', 'action_failed']);
const MIGRATION_ID = '004_recommendation_lifecycle';
const MIGRATION_VERSION = 4;

function toKuzuTimestamp(value) {
    return String(value || new Date().toISOString()).replace('T', ' ').replace('Z', '');
}

function parseRecommendationRow(row = {}) {
    let recommendation;
    try {
        recommendation = JSON.parse(row.recommendation_json || '{}');
    } catch (_error) {
        throw new Error('저장된 recommendation projection JSON이 손상되었습니다.');
    }
    if (!recommendation || recommendation.recommendation_id !== row.id) {
        throw new Error('저장된 recommendation projection identity가 일치하지 않습니다.');
    }
    if (String(recommendation.owner_user_id || '') !== String(row.owner_user_id || '')) {
        throw new Error('저장된 recommendation projection owner가 일치하지 않습니다.');
    }
    return recommendation;
}

async function rowsFromResult(result) {
    const rows = [];
    while (result.hasNext()) rows.push(await result.getNext());
    return rows;
}

class KuzuRecommendationRepository {
    constructor(options = {}) {
        if (typeof options.executeQuery !== 'function') throw new Error('executeQuery가 필요합니다.');
        this.executeQuery = options.executeQuery;
        this.ensureOwner = options.ensureOwner;
        this.mode = 'persistent';
        this.transactionTail = Promise.resolve();
    }

    async initializeSchema() {
        const queries = [
            'CREATE NODE TABLE RecommendationNode(id STRING, owner_user_id STRING, candidate_id STRING, kind STRING, producer_id STRING, title STRING, summary STRING, status STRING, dedupe_key STRING, recommendation_json STRING, available_at TIMESTAMP, snoozed_until TIMESTAMP, expires_at TIMESTAMP, last_event_at TIMESTAMP, created_at TIMESTAMP, PRIMARY KEY(id))',
            'CREATE REL TABLE OwnerOWNS_RECOMMENDATION(FROM OwnerNode TO RecommendationNode)',
            'CREATE REL TABLE EventHAS_RECOMMENDATION(FROM EventNode TO RecommendationNode)'
        ];
        for (const query of queries) {
            try {
                await this.executeQuery(query);
            } catch (error) {
                if (!String(error.message || '').includes('already exists')) throw error;
            }
        }
        await this.executeQuery(
            'MERGE (m:MemoryMigrationNode {id: $id}) ON CREATE SET m.version = $version, m.status = $status, m.applied_at = CAST($applied_at AS TIMESTAMP), m.details_json = $details_json ON MATCH SET m.version = $version, m.status = $status, m.applied_at = CAST($applied_at AS TIMESTAMP), m.details_json = $details_json',
            {
                id: MIGRATION_ID,
                version: MIGRATION_VERSION,
                status: 'completed',
                applied_at: toKuzuTimestamp(new Date().toISOString()),
                details_json: JSON.stringify({ historic_suggestion_backfill: false })
            }
        );
    }

    async hasEvent(eventId) {
        const result = await this.executeQuery(
            'MATCH (e:EventNode {id: $id}) RETURN e.id AS id LIMIT 1',
            { id: String(eventId || '') }
        );
        return result.hasNext();
    }

    async get(ownerUserId, recommendationId) {
        const result = await this.executeQuery(
            'MATCH (o:OwnerNode {id: $owner_id})-[:OwnerOWNS_RECOMMENDATION]->(r:RecommendationNode {id: $recommendation_id, owner_user_id: $owner_id}) RETURN r.id AS id, r.owner_user_id AS owner_user_id, r.recommendation_json AS recommendation_json LIMIT 1',
            { owner_id: String(ownerUserId || ''), recommendation_id: String(recommendationId || '') }
        );
        if (!result.hasNext()) return null;
        return parseRecommendationRow(await result.getNext());
    }

    async findActiveByDedupeKey(ownerUserId, dedupeKey, now) {
        const result = await this.executeQuery(
            "MATCH (o:OwnerNode {id: $owner_id})-[:OwnerOWNS_RECOMMENDATION]->(r:RecommendationNode {owner_user_id: $owner_id, dedupe_key: $dedupe_key}) WHERE r.status IN ['available', 'snoozed', 'action_in_progress', 'action_failed'] AND r.expires_at > CAST($now AS TIMESTAMP) RETURN r.id AS id, r.owner_user_id AS owner_user_id, r.recommendation_json AS recommendation_json, r.available_at AS available_at ORDER BY r.available_at DESC, r.id ASC LIMIT 1",
            { owner_id: String(ownerUserId || ''), dedupe_key: String(dedupeKey || ''), now: toKuzuTimestamp(now) }
        );
        if (!result.hasNext()) return null;
        return parseRecommendationRow(await result.getNext());
    }

    async list(ownerUserId, options = {}) {
        const limit = Math.max(1, Math.min(500, Number.parseInt(options.limit, 10) || 100));
        const status = String(options.status || '').trim();
        const result = await this.executeQuery(
            status
                ? 'MATCH (o:OwnerNode {id: $owner_id})-[:OwnerOWNS_RECOMMENDATION]->(r:RecommendationNode {owner_user_id: $owner_id, status: $status}) RETURN r.id AS id, r.owner_user_id AS owner_user_id, r.recommendation_json AS recommendation_json, r.available_at AS available_at ORDER BY r.available_at DESC, r.id ASC LIMIT $limit'
                : 'MATCH (o:OwnerNode {id: $owner_id})-[:OwnerOWNS_RECOMMENDATION]->(r:RecommendationNode {owner_user_id: $owner_id}) RETURN r.id AS id, r.owner_user_id AS owner_user_id, r.recommendation_json AS recommendation_json, r.available_at AS available_at ORDER BY r.available_at DESC, r.id ASC LIMIT $limit',
            { owner_id: String(ownerUserId || ''), status, limit }
        );
        return (await rowsFromResult(result)).map(parseRecommendationRow);
    }

    async listAvailable(ownerUserId, options = {}) {
        const limit = Math.max(1, Math.min(500, Number.parseInt(options.limit, 10) || 100));
        const result = await this.executeQuery(
            "MATCH (o:OwnerNode {id: $owner_id})-[:OwnerOWNS_RECOMMENDATION]->(r:RecommendationNode {owner_user_id: $owner_id, status: 'available'}) WHERE r.available_at <= CAST($now AS TIMESTAMP) AND r.expires_at > CAST($now AS TIMESTAMP) RETURN r.id AS id, r.owner_user_id AS owner_user_id, r.recommendation_json AS recommendation_json, r.available_at AS available_at ORDER BY r.available_at DESC, r.id ASC LIMIT $limit",
            { owner_id: String(ownerUserId || ''), now: toKuzuTimestamp(options.now), limit }
        );
        return (await rowsFromResult(result)).map(parseRecommendationRow);
    }

    async listDue(ownerUserId, options = {}) {
        const limit = Math.max(1, Math.min(200, Number.parseInt(options.limit, 10) || 50));
        const result = await this.executeQuery(
            "MATCH (o:OwnerNode {id: $owner_id})-[:OwnerOWNS_RECOMMENDATION]->(r:RecommendationNode {owner_user_id: $owner_id}) WHERE r.status IN ['available', 'snoozed', 'action_failed'] AND (r.expires_at <= CAST($now AS TIMESTAMP) OR (r.status = 'snoozed' AND r.snoozed_until <= CAST($now AS TIMESTAMP))) RETURN r.id AS id, r.owner_user_id AS owner_user_id, r.recommendation_json AS recommendation_json, r.available_at AS available_at ORDER BY r.last_event_at ASC, r.id ASC LIMIT $limit",
            { owner_id: String(ownerUserId || ''), now: toKuzuTimestamp(options.now), limit }
        );
        return (await rowsFromResult(result)).map(parseRecommendationRow);
    }

    async saveEventAndProjection(event, recommendation) {
        const previous = this.transactionTail;
        let release;
        this.transactionTail = new Promise((resolve) => { release = resolve; });
        await previous.catch(() => undefined);
        try {
            return await this._saveEventAndProjectionTransaction(event, recommendation);
        } finally {
            release();
        }
    }

    async _saveEventAndProjectionTransaction(event, recommendation) {
        let transactionStarted = false;
        try {
            await this.executeQuery('BEGIN TRANSACTION');
            transactionStarted = true;
            if (typeof this.ensureOwner === 'function') {
                await this.ensureOwner({
                    owner_user_id: recommendation.owner_user_id,
                    identity_kind: recommendation.owner_user_id.split(':')[0] || 'external',
                    created_at: recommendation.candidate.created_at
                });
            }
            const ownerCheck = await this.executeQuery(
                'MATCH (r:RecommendationNode {id: $id}) RETURN r.owner_user_id AS owner_user_id LIMIT 1',
                { id: recommendation.recommendation_id }
            );
            if (ownerCheck.hasNext()) {
                const row = await ownerCheck.getNext();
                if (String(row.owner_user_id || '') !== recommendation.owner_user_id) {
                    throw new Error('recommendation id가 다른 owner에게 이미 사용 중입니다.');
                }
            }
            await this.executeQuery(
                'CREATE (e:EventNode {id: $id, event_type: $event_type, timestamp: CAST($timestamp AS TIMESTAMP), actor_type: $actor_type, actor_id: $actor_id, conversation_id: $conversation_id, message_id: $message_id, payload_json: $payload_json})',
                {
                    id: event.id,
                    event_type: event.event_type,
                    timestamp: toKuzuTimestamp(event.timestamp),
                    actor_type: 'system',
                    actor_id: '',
                    conversation_id: '',
                    message_id: '',
                    payload_json: JSON.stringify(event.payload)
                }
            );
            const candidate = recommendation.candidate;
            await this.executeQuery(
                'MERGE (r:RecommendationNode {id: $id}) ON CREATE SET r.created_at = CAST($created_at AS TIMESTAMP) SET r.owner_user_id = $owner_user_id, r.candidate_id = $candidate_id, r.kind = $kind, r.producer_id = $producer_id, r.title = $title, r.summary = $summary, r.status = $status, r.dedupe_key = $dedupe_key, r.recommendation_json = $recommendation_json, r.available_at = CAST($available_at AS TIMESTAMP), r.snoozed_until = CASE WHEN $snoozed_until = $empty THEN NULL ELSE CAST($snoozed_until AS TIMESTAMP) END, r.expires_at = CAST($expires_at AS TIMESTAMP), r.last_event_at = CAST($last_event_at AS TIMESTAMP)',
                {
                    id: recommendation.recommendation_id,
                    owner_user_id: recommendation.owner_user_id,
                    candidate_id: candidate.candidate_id,
                    kind: candidate.kind,
                    producer_id: candidate.producer_id,
                    title: candidate.title,
                    summary: candidate.summary,
                    status: recommendation.status,
                    dedupe_key: candidate.dedupe_key,
                    recommendation_json: JSON.stringify(recommendation),
                    available_at: toKuzuTimestamp(recommendation.available_at),
                    snoozed_until: recommendation.snoozed_until ? toKuzuTimestamp(recommendation.snoozed_until) : '',
                    empty: '',
                    expires_at: toKuzuTimestamp(recommendation.expires_at),
                    last_event_at: toKuzuTimestamp(recommendation.last_event_at),
                    created_at: toKuzuTimestamp(candidate.created_at)
                }
            );
            await this.executeQuery(
                'MATCH (o:OwnerNode {id: $owner_id}), (r:RecommendationNode {id: $recommendation_id, owner_user_id: $owner_id}) MERGE (o)-[:OwnerOWNS_RECOMMENDATION]->(r)',
                { owner_id: recommendation.owner_user_id, recommendation_id: recommendation.recommendation_id }
            );
            await this.executeQuery(
                'MATCH (e:EventNode {id: $event_id}), (r:RecommendationNode {id: $recommendation_id, owner_user_id: $owner_id}) MERGE (e)-[:EventHAS_RECOMMENDATION]->(r)',
                { event_id: event.id, recommendation_id: recommendation.recommendation_id, owner_id: recommendation.owner_user_id }
            );
            await this.executeQuery(
                'MATCH (o:OwnerNode {id: $owner_id}), (e:EventNode {id: $event_id}) MERGE (o)-[:OwnerOWNS_EVENT]->(e)',
                { owner_id: recommendation.owner_user_id, event_id: event.id }
            );
            await this.executeQuery('COMMIT');
            return recommendation;
        } catch (error) {
            if (transactionStarted) {
                try { await this.executeQuery('ROLLBACK'); } catch (_rollbackError) { }
            }
            throw error;
        }
    }
}

module.exports = {
    ACTIVE_STATUSES,
    MIGRATION_ID,
    MIGRATION_VERSION,
    parseRecommendationRow,
    KuzuRecommendationRepository
};
