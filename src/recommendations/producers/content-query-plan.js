const ALLOWED_OWNER_STAGES = new Set(['saved', 'selected', 'drafted', 'published']);
const GENERIC_TOPIC_TOKENS = new Set(['뉴스', '최신', '오늘', '추천', '이슈', '소식', '정보']);

function compact(value, maxLength = 180) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeTopicKey(value) {
    return compact(value, 180)
        .toLocaleLowerCase('ko-KR')
        .replace(/[^\p{L}\p{N}]+/gu, '');
}

function isUsableTopic(value) {
    const topic = compact(value, 180);
    const key = normalizeTopicKey(topic);
    if (key.length < 2) return false;
    const tokens = topic.split(/[^\p{L}\p{N}]+/u).map((item) => item.trim()).filter(Boolean);
    return tokens.length > 0 && !tokens.every((token) => GENERIC_TOPIC_TOKENS.has(token));
}

function validTimestamp(value) {
    return Number.isFinite(Date.parse(String(value || '')));
}

function compareNewest(left, right) {
    return Date.parse(right.timestamp) - Date.parse(left.timestamp);
}

function collectOwnerTopics(context = {}) {
    const ownerMemory = context?.memory?.owner_memory || {};
    const directSignals = [
        ...(Array.isArray(context?.owner_activity?.signals) ? context.owner_activity.signals : []),
        ...(Array.isArray(ownerMemory?.activity?.signals) ? ownerMemory.activity.signals : []),
        ...(Array.isArray(ownerMemory?.profile?.activity?.recent_subjects)
            ? ownerMemory.profile.activity.recent_subjects
            : [])
    ];
    const artifactSignals = (Array.isArray(ownerMemory.recent_artifacts) ? ownerMemory.recent_artifacts : [])
        .map((artifact) => ({
            subject: artifact?.title || artifact?.payload?.subject || artifact?.payload?.title,
            stage: artifact?.artifact_type === 'topic' ? 'saved' : '',
            strength: 'medium',
            timestamp: artifact?.timestamp,
            evidence: { kind: 'artifact', id: artifact?.id }
        }));

    return [...directSignals, ...artifactSignals]
        .map((signal) => ({
            topic: compact(signal?.subject || signal?.title, 180),
            stage: compact(signal?.stage, 40).toLowerCase(),
            strength: ['strong', 'explicit'].includes(compact(signal?.strength, 40).toLowerCase())
                ? compact(signal.strength, 40).toLowerCase()
                : 'medium',
            timestamp: compact(signal?.timestamp, 80),
            source_kind: ['event', 'artifact'].includes(compact(signal?.evidence?.kind, 40))
                ? compact(signal.evidence.kind, 40)
                : 'event',
            source_id: compact(signal?.evidence?.id || signal?.id, 240)
        }))
        .filter((item) => ALLOWED_OWNER_STAGES.has(item.stage)
            && isUsableTopic(item.topic)
            && validTimestamp(item.timestamp)
            && item.source_id)
        .sort(compareNewest);
}

function collectTrendTopics(knowledge = [], now = new Date()) {
    const currentTime = new Date(now).getTime();
    return (Array.isArray(knowledge) ? knowledge : [])
        .filter((snapshot) => snapshot?.kind === 'trends'
            && validTimestamp(snapshot.expires_at)
            && Date.parse(snapshot.expires_at) > currentTime)
        .flatMap((snapshot) => (Array.isArray(snapshot.items) ? snapshot.items : []).map((item) => ({
            topic: compact(item?.keyword || item?.title, 180),
            snapshot_id: compact(snapshot.snapshot_id, 180),
            provider_id: compact(snapshot.provider_id, 120),
            transport: compact(snapshot.transport, 80),
            snapshot_expires_at: compact(snapshot.expires_at, 80),
            item_id: compact(item?.id, 180),
            item_title: compact(item?.title, 300),
            observed_at: compact(item?.observed_at || snapshot.observed_at, 80),
            categories: Array.isArray(item?.categories) ? item.categories.slice(0, 10) : [],
            change_type: compact(item?.change_type, 40),
            change_amount: item?.change_amount ?? null,
            score: item?.score ?? null,
            source: compact(item?.source, 120),
            url: compact(item?.url, 1000)
        })))
        .filter((item) => isUsableTopic(item.topic) && item.item_id && validTimestamp(item.observed_at));
}

function buildContentNewsQueryPlan(input = {}, context = {}, options = {}) {
    const now = typeof options.now === 'function' ? options.now() : (options.now || new Date());
    const knowledge = Array.isArray(input.knowledge)
        ? input.knowledge
        : (Array.isArray(context.knowledge) ? context.knowledge : []);
    const lanes = [];
    const explicitTopic = compact(input.topic || input.query || input.hint, 180);
    if (isUsableTopic(explicitTopic)) {
        lanes.push({
            topic: explicitTopic,
            lane: 'explicit',
            basis: { observed_at: new Date(now).toISOString(), source_kind: 'event', source_id: 'request:current' }
        });
    }
    const ownerTopic = collectOwnerTopics(context)[0];
    if (ownerTopic) lanes.push({ topic: ownerTopic.topic, lane: 'owner_activity', basis: ownerTopic });
    const trendTopic = collectTrendTopics(knowledge, now)[0];
    if (trendTopic) lanes.push({ topic: trendTopic.topic, lane: 'trends', basis: trendTopic });

    const seen = new Set();
    const byTopic = new Map();
    const queries = [];
    for (const lane of lanes) {
        const normalizedTopic = normalizeTopicKey(lane.topic);
        if (!normalizedTopic) continue;
        if (seen.has(normalizedTopic)) {
            byTopic.get(normalizedTopic).bases.push({ lane: lane.lane, basis: lane.basis });
            continue;
        }
        seen.add(normalizedTopic);
        const query = {
            topic: lane.topic,
            lane: lane.lane,
            normalized_topic: normalizedTopic,
            bases: [{ lane: lane.lane, basis: lane.basis }]
        };
        queries.push(query);
        byTopic.set(normalizedTopic, query);
        if (queries.length >= 3) break;
    }
    return { schema_version: 1, queries };
}

module.exports = {
    ALLOWED_OWNER_STAGES,
    GENERIC_TOPIC_TOKENS,
    buildContentNewsQueryPlan,
    collectOwnerTopics,
    collectTrendTopics,
    isUsableTopic,
    normalizeTopicKey
};
