const crypto = require('crypto');

const KNOWLEDGE_SNAPSHOT_SCHEMA_VERSION = 1;
const KNOWLEDGE_KINDS = new Set(['trends', 'news']);
const SNAPSHOT_FRESHNESS = new Set(['fresh', 'stale']);
const CHANGE_TYPES = new Set(['new', 'up', 'down', 'steady', 'unknown']);
const SENSITIVE_KEY_PATTERN = /(api[_-]?key|secret|authorization|credential|access[_-]?token|license[_-]?key|hwid|raw[_-]?(response|payload)|headers?)/i;

function compact(value, maxLength) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function finiteNumberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function normalizeIso(value, field, required = false) {
    const text = compact(value, 80);
    if (!text) {
        if (required) throw new Error(`${field} is required`);
        return '';
    }
    const timestamp = Date.parse(text);
    if (!Number.isFinite(timestamp)) throw new Error(`${field} must be ISO-8601`);
    return new Date(timestamp).toISOString();
}

function normalizeHttpsUrl(value, field = 'url') {
    const text = compact(value, 2048);
    if (!text) return '';
    let parsed;
    try {
        parsed = new URL(text);
    } catch (_error) {
        throw new Error(`${field} must be a valid URL`);
    }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
        throw new Error(`${field} must be a credential-free HTTPS URL`);
    }
    return parsed.toString();
}

function assertNoSensitiveKeys(value, path = 'snapshot', seen = new Set()) {
    if (!value || typeof value !== 'object') return;
    if (seen.has(value)) throw new Error(`${path} must not contain circular data`);
    seen.add(value);
    for (const [key, child] of Object.entries(value)) {
        if (SENSITIVE_KEY_PATTERN.test(key)) throw new Error(`${path}.${key} is not allowed`);
        assertNoSensitiveKeys(child, `${path}.${key}`, seen);
    }
    seen.delete(value);
}

function assertOnlyKeys(value, allowed, path) {
    for (const key of Object.keys(value || {})) {
        if (!allowed.has(key)) throw new Error(`${path}.${key} is not allowed`);
    }
}

function normalizeCommonItem(raw = {}, path = 'item') {
    const item = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const id = compact(item.id, 180);
    const title = compact(item.title, 300);
    if (!id) throw new Error(`${path}.id is required`);
    if (!title) throw new Error(`${path}.title is required`);
    return {
        id,
        title,
        summary: compact(item.summary, 1000),
        observed_at: normalizeIso(item.observed_at, `${path}.observed_at`, true),
        url: normalizeHttpsUrl(item.url, `${path}.url`),
        source: compact(item.source, 120),
        publisher: compact(item.publisher, 160)
    };
}

function normalizeTrendItem(raw = {}, path = 'item') {
    assertOnlyKeys(raw, new Set([
        'id', 'title', 'summary', 'observed_at', 'url', 'source', 'publisher',
        'keyword', 'categories', 'change_type', 'change_amount', 'score', 'display_order'
    ]), path);
    const common = normalizeCommonItem(raw, path);
    const keyword = compact(raw.keyword || raw.title, 180);
    if (!keyword) throw new Error(`${path}.keyword is required`);
    const categories = Array.from(new Set(
        (Array.isArray(raw.categories) ? raw.categories : [])
            .map((item) => compact(item, 80))
            .filter(Boolean)
    )).slice(0, 10);
    const changeType = compact(raw.change_type || 'unknown', 20).toLowerCase();
    if (!CHANGE_TYPES.has(changeType)) throw new Error(`${path}.change_type is invalid`);
    return {
        ...common,
        keyword,
        categories,
        change_type: changeType,
        change_amount: finiteNumberOrNull(raw.change_amount),
        score: finiteNumberOrNull(raw.score),
        display_order: finiteNumberOrNull(raw.display_order)
    };
}

function normalizeNewsItem(raw = {}, path = 'item') {
    assertOnlyKeys(raw, new Set([
        'id', 'title', 'summary', 'observed_at', 'url', 'source', 'publisher', 'published_at'
    ]), path);
    const common = normalizeCommonItem(raw, path);
    if (!common.url) throw new Error(`${path}.url is required`);
    if (!common.publisher) throw new Error(`${path}.publisher is required`);
    return {
        ...common,
        published_at: normalizeIso(raw.published_at, `${path}.published_at`, true)
    };
}

function normalizeKnowledgeItem(kind, raw, path) {
    if (kind === 'trends') return normalizeTrendItem(raw, path);
    if (kind === 'news') return normalizeNewsItem(raw, path);
    throw new Error(`unsupported knowledge kind: ${kind}`);
}

function normalizeKnowledgeSnapshot(raw = {}, expected = {}) {
    const snapshot = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    assertNoSensitiveKeys(snapshot);
    assertOnlyKeys(snapshot, new Set([
        'schema_version', 'snapshot_id', 'kind', 'provider_id', 'transport', 'freshness',
        'observed_at', 'expires_at', 'items'
    ]), 'snapshot');
    if (Number(snapshot.schema_version) !== KNOWLEDGE_SNAPSHOT_SCHEMA_VERSION) {
        throw new Error(`unsupported knowledge snapshot schema_version: ${snapshot.schema_version || 'missing'}`);
    }
    const kind = compact(snapshot.kind, 40);
    const providerId = compact(snapshot.provider_id, 120);
    const transport = compact(snapshot.transport, 80);
    const snapshotId = compact(snapshot.snapshot_id, 180);
    const freshness = compact(snapshot.freshness, 20).toLowerCase();
    if (!KNOWLEDGE_KINDS.has(kind)) throw new Error(`unsupported knowledge kind: ${kind || 'missing'}`);
    if (!providerId || !transport || !snapshotId.startsWith('ks_')) throw new Error('snapshot identity is required');
    if (!SNAPSHOT_FRESHNESS.has(freshness)) throw new Error('snapshot freshness is invalid');
    if (expected.kind && kind !== expected.kind) throw new Error('snapshot kind does not match provider definition');
    if (expected.provider_id && providerId !== expected.provider_id) throw new Error('snapshot provider does not match provider definition');
    if (expected.transport && transport !== expected.transport) throw new Error('snapshot transport does not match provider definition');
    const observedAt = normalizeIso(snapshot.observed_at, 'snapshot.observed_at', true);
    const expiresAt = normalizeIso(snapshot.expires_at, 'snapshot.expires_at', true);
    if (Date.parse(expiresAt) < Date.parse(observedAt)) throw new Error('snapshot expiry precedes observation');
    if (!Array.isArray(snapshot.items) || snapshot.items.length > 50) {
        throw new Error('snapshot items must be an array of at most 50 items');
    }
    return {
        schema_version: KNOWLEDGE_SNAPSHOT_SCHEMA_VERSION,
        snapshot_id: snapshotId,
        kind,
        provider_id: providerId,
        transport,
        freshness,
        observed_at: observedAt,
        expires_at: expiresAt,
        items: snapshot.items.map((item, index) => normalizeKnowledgeItem(kind, item, `snapshot.items[${index}]`))
    };
}

function materializeLegacyKnowledgeSnapshot(definition = {}, items = [], options = {}) {
    const observedAt = normalizeIso(
        typeof options.now === 'function' ? options.now() : (options.now || new Date()),
        'observed_at',
        true
    );
    const ttlSeconds = Math.max(60, Math.min(86400, Number(definition?.config?.snapshot_ttl_seconds) || 900));
    const expiresAt = new Date(Date.parse(observedAt) + ttlSeconds * 1000).toISOString();
    const providerId = compact(definition.id, 120);
    const kind = compact(definition.kind, 40);
    const transport = compact(definition.transport, 80);
    const identity = `${KNOWLEDGE_SNAPSHOT_SCHEMA_VERSION}:${providerId}:${kind}:${transport}:${observedAt}`;
    return {
        schema_version: KNOWLEDGE_SNAPSHOT_SCHEMA_VERSION,
        snapshot_id: `ks_${crypto.createHash('sha256').update(identity).digest('hex')}`,
        kind,
        provider_id: providerId,
        transport,
        freshness: 'fresh',
        observed_at: observedAt,
        expires_at: expiresAt,
        items: Array.isArray(items) ? items : []
    };
}

module.exports = {
    KNOWLEDGE_SNAPSHOT_SCHEMA_VERSION,
    assertNoSensitiveKeys,
    materializeLegacyKnowledgeSnapshot,
    normalizeKnowledgeItem,
    normalizeKnowledgeSnapshot
};
