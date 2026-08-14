const {
    ACTIVITY_SIGNAL_DOMAINS,
    ACTIVITY_SIGNAL_STAGES,
    ACTIVITY_SIGNAL_STRENGTHS,
    parseActivityEventType
} = require('./activity-lifecycle');

function normalizePayload(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function classifyOwnerArtifact(artifact = {}) {
    const artifactType = String(artifact.artifact_type || '').trim();
    const payload = normalizePayload(artifact.payload);
    let domain = '';
    let stage = '';
    let strength = '';

    if (artifactType === 'content_idea') {
        domain = 'blog';
        stage = 'generated';
        strength = 'weak';
    } else if (artifactType === 'topic') {
        domain = 'blog';
        stage = 'saved';
        strength = 'medium';
    } else if (artifactType === 'shopping_item') {
        domain = 'shopping';
        stage = 'saved';
        strength = 'medium';
    } else {
        return null;
    }

    return {
        id: `artifact:${String(artifact.id || '').trim()}`,
        domain,
        stage,
        strength,
        subject: String(artifact.title || payload.subject || payload.name || payload.title || '').trim(),
        category: String(payload.category || '').trim(),
        source: String(payload.source || '').trim(),
        timestamp: artifact.timestamp || null,
        evidence: {
            kind: 'artifact',
            id: String(artifact.id || '').trim(),
            type: artifactType
        },
        payload
    };
}

function classifyOwnerEvent(event = {}) {
    const parsedType = parseActivityEventType(event.event_type);
    if (!parsedType) return null;
    const payload = normalizePayload(event.payload);
    const payloadDomain = String(payload.domain || '').trim().toLowerCase();
    const payloadStage = String(payload.stage || '').trim().toLowerCase();
    if (payloadDomain !== parsedType.domain || payloadStage !== parsedType.stage) return null;
    const strength = String(payload.strength || '').trim().toLowerCase();
    if (!ACTIVITY_SIGNAL_STRENGTHS.includes(strength)) return null;

    return {
        id: `event:${String(event.id || '').trim()}`,
        domain: parsedType.domain,
        stage: parsedType.stage,
        strength,
        subject: String(payload.subject || '').trim(),
        category: String(payload.category || '').trim(),
        source: String(payload.source || '').trim(),
        platform: String(payload.platform || '').trim(),
        entity_ref: String(payload.entity_ref || '').trim(),
        result_ref: String(payload.result_ref || '').trim(),
        timestamp: event.timestamp || null,
        evidence: {
            kind: 'event',
            id: String(event.id || '').trim(),
            type: String(event.event_type || '').trim(),
            evidence_id: String(payload.evidence_id || '').trim()
        },
        payload
    };
}

function compareTimestampDesc(left, right) {
    const leftTime = new Date(left?.timestamp || 0).getTime();
    const rightTime = new Date(right?.timestamp || 0).getTime();
    const safeLeft = Number.isFinite(leftTime) ? leftTime : 0;
    const safeRight = Number.isFinite(rightTime) ? rightTime : 0;
    return safeRight - safeLeft;
}

function normalizeDomainFilter(value) {
    const requested = Array.isArray(value) ? value : [];
    return {
        active: requested.length > 0,
        domains: new Set(requested
            .map((item) => String(item || '').trim().toLowerCase())
            .filter((item) => ACTIVITY_SIGNAL_DOMAINS.includes(item)))
    };
}

function buildOwnerActivitySignalSummary(input = {}) {
    const ownerUserId = String(input.owner_user_id || input.ownerUserId || '').trim();
    const artifacts = Array.isArray(input.artifacts) ? input.artifacts : [];
    const events = Array.isArray(input.events) ? input.events : [];
    const requestedLimit = Number(input.limit);
    const limit = Number.isFinite(requestedLimit)
        ? Math.max(1, Math.min(200, Math.trunc(requestedLimit)))
        : 100;
    const domainFilter = normalizeDomainFilter(input.domains);
    const supportedSignals = [];
    let excludedEvidenceCount = 0;

    for (const artifact of artifacts) {
        const signal = classifyOwnerArtifact(artifact);
        if (signal) supportedSignals.push(signal);
        else excludedEvidenceCount += 1;
    }
    for (const event of events) {
        const signal = classifyOwnerEvent(event);
        if (signal) supportedSignals.push(signal);
        else excludedEvidenceCount += 1;
    }

    const filteredSignals = domainFilter.active
        ? supportedSignals.filter((signal) => domainFilter.domains.has(signal.domain))
        : supportedSignals;
    const filteredEvidenceCount = supportedSignals.length - filteredSignals.length;
    filteredSignals.sort(compareTimestampDesc);
    const limitedSignals = filteredSignals.slice(0, limit);
    const countsByDomain = Object.fromEntries(ACTIVITY_SIGNAL_DOMAINS.map((domain) => [domain, 0]));
    const countsByStage = Object.fromEntries(ACTIVITY_SIGNAL_STAGES.map((stage) => [stage, 0]));
    const countsByStrength = Object.fromEntries(ACTIVITY_SIGNAL_STRENGTHS.map((strength) => [strength, 0]));

    for (const signal of filteredSignals) {
        countsByDomain[signal.domain] += 1;
        countsByStage[signal.stage] += 1;
        countsByStrength[signal.strength] += 1;
    }

    return {
        owner_user_id: ownerUserId,
        domains: domainFilter.active ? [...domainFilter.domains] : [...ACTIVITY_SIGNAL_DOMAINS],
        signals: limitedSignals,
        counts_by_domain: countsByDomain,
        counts_by_stage: countsByStage,
        counts_by_strength: countsByStrength,
        scanned_evidence_count: artifacts.length + events.length,
        supported_evidence_count: supportedSignals.length,
        filtered_evidence_count: filteredEvidenceCount,
        excluded_evidence_count: excludedEvidenceCount,
        truncated: filteredSignals.length > limitedSignals.length
    };
}

module.exports = {
    ACTIVITY_SIGNAL_DOMAINS,
    ACTIVITY_SIGNAL_STAGES,
    ACTIVITY_SIGNAL_STRENGTHS,
    classifyOwnerArtifact,
    classifyOwnerEvent,
    buildOwnerActivitySignalSummary
};
