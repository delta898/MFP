function text(value) {
    return String(value ?? '').trim();
}

function logicalEventKey(event = {}) {
    const payload = event.payload && typeof event.payload === 'object' ? event.payload : {};
    const provenance = payload.provenance && typeof payload.provenance === 'object' ? payload.provenance : {};
    const reference = text(
        provenance.request_id
        || payload.evidence_id
        || payload.artifact_id
        || payload.suggestion_id
        || event.message_id
    );
    return reference ? `${text(event.event_type)}:${reference}` : '';
}

function buildMemoryCollectionAudit(input = {}) {
    const ownerUserId = text(input.owner_user_id || input.ownerUserId);
    const events = Array.isArray(input.events) ? input.events : [];
    const artifacts = Array.isArray(input.artifacts) ? input.artifacts : [];
    const stats = input.stats && typeof input.stats === 'object' ? input.stats : {};
    const eventTypes = {};
    const channels = {};
    const logicalKeys = new Map();
    let missingProvenanceCount = 0;
    let incompleteProvenanceCount = 0;

    for (const event of events) {
        const eventType = text(event.event_type) || 'unknown';
        eventTypes[eventType] = (eventTypes[eventType] || 0) + 1;
        const payload = event.payload && typeof event.payload === 'object' ? event.payload : {};
        const provenance = payload.provenance && typeof payload.provenance === 'object' ? payload.provenance : null;
        if (!provenance) {
            missingProvenanceCount += 1;
        } else {
            const channel = text(provenance.channel) || 'unknown';
            channels[channel] = (channels[channel] || 0) + 1;
            if (!text(provenance.actor_type) || !text(provenance.actor_id)) incompleteProvenanceCount += 1;
        }
        const key = logicalEventKey(event);
        if (key) logicalKeys.set(key, (logicalKeys.get(key) || 0) + 1);
    }

    const duplicateLogicalKeys = [...logicalKeys.entries()]
        .filter(([, count]) => count > 1)
        .map(([key, count]) => ({ key, count }))
        .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));

    return {
        schema_version: 1,
        owner_user_id: ownerUserId,
        scanned_event_count: events.length,
        scanned_artifact_count: artifacts.length,
        event_types: eventTypes,
        channels,
        missing_provenance_count: missingProvenanceCount,
        incomplete_provenance_count: incompleteProvenanceCount,
        duplicate_logical_event_count: duplicateLogicalKeys.reduce((sum, item) => sum + item.count - 1, 0),
        duplicate_logical_keys: duplicateLogicalKeys.slice(0, 20),
        orphan_event_count: Number(stats.orphan_event_count || 0),
        orphan_artifact_count: Number(stats.orphan_artifact_count || 0),
        truncated: Boolean(input.truncated)
    };
}

module.exports = {
    buildMemoryCollectionAudit,
    logicalEventKey
};
