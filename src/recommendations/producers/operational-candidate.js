const crypto = require('crypto');

function compact(value, maxLength = 240) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function stableOperationalHash(producerId, key) {
    return crypto.createHash('sha256').update(`${producerId}:${key}`).digest('hex');
}

function createOperationalCandidate(input = {}) {
    const producerId = compact(input.producer_id, 160);
    const key = compact(input.key, 300);
    const createdAt = new Date(input.created_at).toISOString();
    const ttlMs = Math.max(60 * 1000, Number(input.ttl_ms) || 24 * 60 * 60 * 1000);
    const hash = stableOperationalHash(producerId, key);
    return {
        candidate_id: `candidate:operational:${hash}`,
        kind: compact(input.kind, 60),
        producer_id: producerId,
        owner_user_id: compact(input.owner_user_id, 240),
        title: compact(input.title, 180),
        summary: compact(input.summary, 300),
        explanation: compact(input.explanation, 500),
        evidence: Array.isArray(input.evidence) ? input.evidence.slice(0, 12) : [],
        handoff: input.handoff || null,
        dedupe_key: `operational:${producerId}:${hash}`,
        created_at: createdAt,
        expires_at: new Date(Date.parse(createdAt) + ttlMs).toISOString(),
        metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {}
    };
}

function createSystemStateEvidence(input = {}) {
    const observedAt = new Date(input.observed_at).toISOString();
    const ttlMs = Math.max(60 * 1000, Number(input.ttl_ms) || 24 * 60 * 60 * 1000);
    const sourceKind = compact(input.source_kind || 'setting', 40);
    const sourceId = compact(input.source_id, 240);
    const identity = stableOperationalHash(compact(input.evidence_namespace || 'system', 80), `${sourceKind}:${sourceId}`);
    return {
        evidence_id: `evidence:operational:${identity}`,
        kind: 'system_state',
        stage: 'observed',
        strength: compact(input.strength || 'medium', 40),
        summary: compact(input.summary, 300),
        observed_at: observedAt,
        expires_at: new Date(Date.parse(observedAt) + ttlMs).toISOString(),
        source_ref: {
            kind: sourceKind,
            id: sourceId,
            label: compact(input.label, 160),
            provider_id: '',
            transport: '',
            url: '',
            timestamp: observedAt
        },
        features: input.features && typeof input.features === 'object' ? input.features : {}
    };
}

module.exports = {
    compact,
    createOperationalCandidate,
    createSystemStateEvidence,
    stableOperationalHash
};
