const { OBSERVATIONAL_EVENTS } = require('../recommendations/core/lifecycle');

const SQLITE_RECOMMENDATION_SCHEMA_VERSION = 1;

function toIso(value) {
    const date = new Date(value || Date.now());
    if (Number.isNaN(date.getTime())) throw new Error('추천 시각이 올바르지 않습니다.');
    return date.toISOString();
}

function parseJson(value, field) {
    try {
        return JSON.parse(String(value || '{}'));
    } catch (_error) {
        throw new Error(`저장된 ${field} JSON이 손상되었습니다.`);
    }
}

function parseRecommendationRow(row = {}) {
    if (!row.id) return null;
    const candidate = parseJson(row.candidate_json, 'recommendation candidate');
    const policy = parseJson(row.policy_json, 'recommendation policy');
    if (String(candidate.owner_user_id || '') !== String(row.owner_id || '')) {
        throw new Error('저장된 recommendation candidate owner가 일치하지 않습니다.');
    }
    return {
        schema_version: Number(row.schema_version || 1),
        recommendation_id: String(row.id),
        owner_user_id: String(row.owner_id),
        candidate,
        policy,
        status: String(row.status),
        available_at: String(row.available_at),
        snoozed_until: row.snoozed_until == null ? null : String(row.snoozed_until),
        expires_at: String(row.expires_at),
        last_event_at: String(row.last_event_at)
    };
}

class SQLiteRecommendationRepository {
    constructor(options = {}) {
        if (!options.database) throw new Error('SQLite database가 필요합니다.');
        this.database = options.database;
        this.ensureOwner = options.ensureOwner;
        this.mode = 'persistent';
    }

    initializeSchema() {
        this.database.exec(`
            CREATE TABLE IF NOT EXISTS recommendations (
                id TEXT PRIMARY KEY,
                schema_version INTEGER NOT NULL,
                owner_id TEXT NOT NULL,
                candidate_id TEXT NOT NULL,
                kind TEXT NOT NULL,
                producer_id TEXT NOT NULL,
                title TEXT NOT NULL,
                summary TEXT NOT NULL,
                dedupe_key TEXT NOT NULL,
                candidate_json TEXT NOT NULL,
                policy_json TEXT NOT NULL,
                status TEXT NOT NULL,
                available_at TEXT NOT NULL,
                snoozed_until TEXT,
                expires_at TEXT NOT NULL,
                last_event_at TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(owner_id) REFERENCES owners(id) ON DELETE CASCADE
            ) STRICT;
            CREATE INDEX IF NOT EXISTS idx_recommendations_owner_status_available
                ON recommendations(owner_id, status, available_at DESC);
            CREATE INDEX IF NOT EXISTS idx_recommendations_owner_dedupe_expires
                ON recommendations(owner_id, dedupe_key, expires_at DESC);
            CREATE INDEX IF NOT EXISTS idx_recommendations_terminal_retention
                ON recommendations(status, last_event_at);

            CREATE TABLE IF NOT EXISTS recommendation_events (
                id TEXT PRIMARY KEY,
                recommendation_id TEXT NOT NULL,
                owner_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                occurred_at TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                FOREIGN KEY(recommendation_id) REFERENCES recommendations(id) ON DELETE CASCADE,
                FOREIGN KEY(owner_id) REFERENCES owners(id) ON DELETE CASCADE
            ) STRICT;
            CREATE INDEX IF NOT EXISTS idx_recommendation_events_owner_time
                ON recommendation_events(owner_id, occurred_at DESC);
            CREATE INDEX IF NOT EXISTS idx_recommendation_events_recommendation_time
                ON recommendation_events(recommendation_id, occurred_at DESC);
        `);
    }

    async hasEvent(eventId) {
        return !!this.database.get(
            'SELECT 1 AS found FROM recommendation_events WHERE id = :id LIMIT 1',
            { id: String(eventId || '') }
        );
    }

    async get(ownerUserId, recommendationId) {
        return parseRecommendationRow(this.database.get(
            'SELECT * FROM recommendations WHERE owner_id = :owner_id AND id = :id LIMIT 1',
            { owner_id: String(ownerUserId || ''), id: String(recommendationId || '') }
        ));
    }

    async findActiveByDedupeKey(ownerUserId, dedupeKey, now) {
        return parseRecommendationRow(this.database.get(`
            SELECT * FROM recommendations
            WHERE owner_id = :owner_id AND dedupe_key = :dedupe_key
              AND status IN ('available', 'snoozed', 'action_in_progress', 'action_failed')
              AND expires_at > :now
            ORDER BY available_at DESC, id ASC LIMIT 1
        `, { owner_id: String(ownerUserId || ''), dedupe_key: String(dedupeKey || ''), now: toIso(now) }));
    }

    async list(ownerUserId, options = {}) {
        const limit = Math.max(1, Math.min(500, Number.parseInt(options.limit, 10) || 100));
        const status = String(options.status || '').trim();
        const rows = status
            ? this.database.all('SELECT * FROM recommendations WHERE owner_id = :owner_id AND status = :status ORDER BY available_at DESC, id ASC LIMIT :limit', { owner_id: String(ownerUserId || ''), status, limit })
            : this.database.all('SELECT * FROM recommendations WHERE owner_id = :owner_id ORDER BY available_at DESC, id ASC LIMIT :limit', { owner_id: String(ownerUserId || ''), limit });
        return rows.map(parseRecommendationRow);
    }

    async listAvailable(ownerUserId, options = {}) {
        const limit = Math.max(1, Math.min(500, Number.parseInt(options.limit, 10) || 100));
        return this.database.all(`
            SELECT * FROM recommendations
            WHERE owner_id = :owner_id AND status = 'available'
              AND available_at <= :now AND expires_at > :now
            ORDER BY available_at DESC, id ASC LIMIT :limit
        `, { owner_id: String(ownerUserId || ''), now: toIso(options.now), limit }).map(parseRecommendationRow);
    }

    async listDue(ownerUserId, options = {}) {
        const limit = Math.max(1, Math.min(200, Number.parseInt(options.limit, 10) || 50));
        return this.database.all(`
            SELECT * FROM recommendations
            WHERE owner_id = :owner_id
              AND status IN ('available', 'snoozed', 'action_failed')
              AND (expires_at <= :now OR (status = 'snoozed' AND snoozed_until <= :now))
            ORDER BY last_event_at ASC, id ASC LIMIT :limit
        `, { owner_id: String(ownerUserId || ''), now: toIso(options.now), limit }).map(parseRecommendationRow);
    }

    async saveEventAndProjection(event, recommendation) {
        if (typeof this.ensureOwner === 'function') {
            await this.ensureOwner({
                owner_user_id: recommendation.owner_user_id,
                identity_kind: String(recommendation.owner_user_id || '').split(':')[0] || 'external',
                created_at: recommendation.candidate?.created_at
            });
        }
        const candidate = recommendation.candidate || {};
        const existing = this.database.get('SELECT owner_id FROM recommendations WHERE id = :id LIMIT 1', {
            id: recommendation.recommendation_id
        });
        if (existing && String(existing.owner_id) !== String(recommendation.owner_user_id)) {
            throw new Error('recommendation id가 다른 owner에게 이미 사용 중입니다.');
        }
        const isCreate = event.event_type === 'recommendation.created';
        if (isCreate && existing) return recommendation;
        if (!isCreate && !existing) throw new Error('recommendation을 찾을 수 없습니다.');

        this.database.transaction(() => {
            if (isCreate) {
                this.database.run(`
                    INSERT INTO recommendations (
                        id, schema_version, owner_id, candidate_id, kind, producer_id, title, summary,
                        dedupe_key, candidate_json, policy_json, status, available_at, snoozed_until,
                        expires_at, last_event_at, created_at
                    ) VALUES (
                        :id, :schema_version, :owner_id, :candidate_id, :kind, :producer_id, :title, :summary,
                        :dedupe_key, :candidate_json, :policy_json, :status, :available_at, :snoozed_until,
                        :expires_at, :last_event_at, :created_at
                    )
                `, {
                    id: recommendation.recommendation_id,
                    schema_version: Number(recommendation.schema_version || SQLITE_RECOMMENDATION_SCHEMA_VERSION),
                    owner_id: recommendation.owner_user_id,
                    candidate_id: candidate.candidate_id,
                    kind: candidate.kind,
                    producer_id: candidate.producer_id,
                    title: candidate.title,
                    summary: candidate.summary,
                    dedupe_key: candidate.dedupe_key,
                    candidate_json: JSON.stringify(candidate),
                    policy_json: JSON.stringify(recommendation.policy || {}),
                    status: recommendation.status,
                    available_at: toIso(recommendation.available_at),
                    snoozed_until: recommendation.snoozed_until ? toIso(recommendation.snoozed_until) : null,
                    expires_at: toIso(recommendation.expires_at),
                    last_event_at: toIso(recommendation.last_event_at),
                    created_at: toIso(candidate.created_at)
                });
            } else if (!OBSERVATIONAL_EVENTS.includes(event.event_type)) {
                this.database.run(`
                    UPDATE recommendations
                    SET status = :status, snoozed_until = :snoozed_until, last_event_at = :last_event_at
                    WHERE id = :id AND owner_id = :owner_id
                `, {
                    id: recommendation.recommendation_id,
                    owner_id: recommendation.owner_user_id,
                    status: recommendation.status,
                    snoozed_until: recommendation.snoozed_until ? toIso(recommendation.snoozed_until) : null,
                    last_event_at: toIso(recommendation.last_event_at)
                });
            }
            this.database.run(`
                INSERT INTO recommendation_events (
                    id, recommendation_id, owner_id, event_type, occurred_at, payload_json
                ) VALUES (:id, :recommendation_id, :owner_id, :event_type, :occurred_at, :payload_json)
            `, {
                id: event.id,
                recommendation_id: recommendation.recommendation_id,
                owner_id: recommendation.owner_user_id,
                event_type: event.event_type,
                occurred_at: toIso(event.timestamp),
                payload_json: JSON.stringify(event.payload || {})
            });
        });
        return recommendation;
    }

    prune(options = {}) {
        const now = new Date(options.now || Date.now());
        const terminalDays = Math.max(1, Number.parseInt(options.terminalDays, 10) || 30);
        const batchSize = Math.max(1, Math.min(500, Number.parseInt(options.batchSize, 10) || 200));
        const cutoff = new Date(now.getTime() - terminalDays * 86400000).toISOString();
        const terminalCap = Math.max(1, Number.parseInt(options.terminalCap, 10) || 500);
        const eventCap = Math.max(1, Number.parseInt(options.eventCap, 10) || 2000);
        return this.database.transaction(() => {
            const expired = this.database.run(`
                DELETE FROM recommendations WHERE id IN (
                    SELECT id FROM recommendations
                    WHERE status IN ('action_completed', 'dismissed', 'rotated', 'expired')
                      AND last_event_at < :cutoff
                    ORDER BY last_event_at ASC LIMIT :limit
                )
            `, { cutoff, limit: batchSize });
            const overCap = this.database.run(`
                DELETE FROM recommendations WHERE id IN (
                    SELECT id FROM (
                        SELECT id, row_number() OVER (PARTITION BY owner_id ORDER BY last_event_at DESC, id DESC) AS position
                        FROM recommendations WHERE status IN ('action_completed', 'dismissed', 'rotated', 'expired')
                    ) WHERE position > :cap LIMIT :limit
                )
            `, { cap: terminalCap, limit: batchSize });
            const events = this.database.run(`
                DELETE FROM recommendation_events WHERE id IN (
                    SELECT id FROM (
                        SELECT id, row_number() OVER (PARTITION BY owner_id ORDER BY occurred_at DESC, id DESC) AS position
                        FROM recommendation_events
                    ) WHERE position > :cap LIMIT :limit
                )
            `, { cap: eventCap, limit: batchSize });
            return {
                expired: Number(expired.changes || 0),
                over_cap: Number(overCap.changes || 0),
                events: Number(events.changes || 0)
            };
        });
    }
}

module.exports = {
    SQLITE_RECOMMENDATION_SCHEMA_VERSION,
    SQLiteRecommendationRepository,
    parseRecommendationRow
};
