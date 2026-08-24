const ALLOWED_OWNER_STAGES = new Set(['saved', 'selected', 'drafted', 'published']);
const GENERIC_TOPIC_TOKENS = new Set(['뉴스', '최신', '오늘', '추천', '이슈', '소식', '정보']);
const DAY_MS = 24 * 60 * 60 * 1000;
const SERENDIPITY_PRIMARY_LOOKBACK_DAYS = 7;
const SERENDIPITY_MAX_LOOKBACK_DAYS = 14;
const SERENDIPITY_DOMAINS = Object.freeze([
    '과학 발견', '생활 변화', '여행 문화',
    '음식 취향', '환경 기후', '건강 습관',
    '디자인 예술', '교육 배움', '창업 아이디어',
    '반려동물 생활', '스포츠 취미', '공간 건축'
]);

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

function inLookbackWindow(timestamp, nowMs, maxAgeDays) {
    if (!Number.isFinite(maxAgeDays)) return true;
    const timestampMs = Date.parse(timestamp);
    return Number.isFinite(timestampMs)
        && timestampMs <= nowMs
        && timestampMs >= nowMs - maxAgeDays * DAY_MS;
}

function recencyBand(timestamp, nowMs) {
    return Date.parse(timestamp) >= nowMs - SERENDIPITY_PRIMARY_LOOKBACK_DAYS * DAY_MS
        ? 'recent_week'
        : 'recent_fortnight';
}

function collectOwnerTopics(context = {}, options = {}) {
    const nowMs = new Date(options.now || new Date()).getTime();
    const maxAgeDays = Number.isFinite(options.maxAgeDays) ? options.maxAgeDays : Number.NaN;
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
            && item.source_id
            && inLookbackWindow(item.timestamp, nowMs, maxAgeDays))
        .map((item) => ({ ...item, recency_band: recencyBand(item.timestamp, nowMs) }))
        .sort(compareNewest);
}

function collectTrendTopics(knowledge = [], now = new Date(), options = {}) {
    const currentTime = new Date(now).getTime();
    const maxAgeDays = Number.isFinite(options.maxAgeDays) ? options.maxAgeDays : Number.NaN;
    const allowExpiredSnapshot = options.allowExpiredSnapshot === true;
    return (Array.isArray(knowledge) ? knowledge : [])
        .filter((snapshot) => snapshot?.kind === 'trends'
            && validTimestamp(snapshot.expires_at)
            && (allowExpiredSnapshot || Date.parse(snapshot.expires_at) > currentTime))
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
        .filter((item) => isUsableTopic(item.topic)
            && item.item_id
            && validTimestamp(item.observed_at)
            && inLookbackWindow(item.observed_at, currentTime, maxAgeDays))
        .map((item) => ({
            ...item,
            recency_band: recencyBand(item.observed_at, currentTime),
            evidence_expires_at: Number.isFinite(maxAgeDays)
                ? new Date(Date.parse(item.observed_at) + maxAgeDays * DAY_MS).toISOString()
                : item.snapshot_expires_at
        }));
}

function normalizeOffset(value) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function rotatedItems(items = [], offset = 0, limit = 3) {
    if (items.length === 0) return [];
    const start = normalizeOffset(offset) % items.length;
    const count = Math.min(items.length, Math.max(1, Number(limit) || 1));
    return Array.from({ length: count }, (_, index) => items[(start + index) % items.length]);
}

function buildContentNewsQueryPlan(input = {}, context = {}, options = {}) {
    const now = typeof options.now === 'function' ? options.now() : (options.now || new Date());
    const knowledge = Array.isArray(input.knowledge)
        ? input.knowledge
        : (Array.isArray(context.knowledge) ? context.knowledge : []);
    const lanes = [];
    const serendipityMode = input.serendipity === true;
    const discoveryOffsets = input.discovery_offsets && typeof input.discovery_offsets === 'object'
        ? input.discovery_offsets
        : {};
    if (serendipityMode) {
        const offset = normalizeOffset(discoveryOffsets.news ?? input.discovery_offset);
        for (let index = 0; index < 3; index += 1) {
            const domainIndex = (offset * 3 + index) % SERENDIPITY_DOMAINS.length;
            const topic = SERENDIPITY_DOMAINS[domainIndex];
            lanes.push({
                topic,
                lane: 'discovery',
                basis: {
                    observed_at: new Date(now).toISOString(),
                    source_kind: 'knowledge',
                    source_id: `serendipity-domain:${normalizeTopicKey(topic)}`,
                    domain_index: domainIndex
                }
            });
        }
    }
    const explicitTopic = compact(input.topic || input.query || input.hint, 180);
    if (isUsableTopic(explicitTopic)) {
        lanes.push({
            topic: explicitTopic,
            lane: 'explicit',
            basis: { observed_at: new Date(now).toISOString(), source_kind: 'event', source_id: 'request:current' }
        });
    }
    const ownerTopics = collectOwnerTopics(context, serendipityMode
        ? { now, maxAgeDays: SERENDIPITY_MAX_LOOKBACK_DAYS }
        : { now });
    const selectedOwnerTopics = serendipityMode
        ? rotatedItems(ownerTopics, discoveryOffsets.owner, 3)
        : ownerTopics.slice(0, 1);
    for (const ownerTopic of selectedOwnerTopics) {
        lanes.push({ topic: ownerTopic.topic, lane: 'owner_activity', basis: ownerTopic });
    }
    const trendTopics = collectTrendTopics(knowledge, now, serendipityMode
        ? { maxAgeDays: SERENDIPITY_MAX_LOOKBACK_DAYS, allowExpiredSnapshot: true }
        : {});
    const selectedTrendTopics = serendipityMode
        ? rotatedItems(trendTopics, discoveryOffsets.trends, 3)
        : trendTopics;
    for (const trendTopic of selectedTrendTopics) {
        lanes.push({ topic: trendTopic.topic, lane: 'trends', basis: trendTopic });
    }

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
        if (queries.length >= 10) break;
    }
    return { schema_version: 1, queries };
}

module.exports = {
    ALLOWED_OWNER_STAGES,
    DAY_MS,
    GENERIC_TOPIC_TOKENS,
    SERENDIPITY_DOMAINS,
    SERENDIPITY_MAX_LOOKBACK_DAYS,
    SERENDIPITY_PRIMARY_LOOKBACK_DAYS,
    buildContentNewsQueryPlan,
    collectOwnerTopics,
    collectTrendTopics,
    inLookbackWindow,
    isUsableTopic,
    normalizeTopicKey,
    normalizeOffset,
    rotatedItems
};
