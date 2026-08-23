const crypto = require('crypto');
const { normalizeTopicKey } = require('./content-query-plan');
const { createContentKnowledgeCollector } = require('./content-knowledge-collector');

const CONTENT_PRODUCER_ID = 'content-opportunity-v1';
const CONTENT_PRODUCER_VERSION = 1;
const MAX_NEWS_EVIDENCE = 3;

function compact(value, maxLength = 240) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function stableHash(value) {
    return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function optionalExpiry(observedAt, expiresAt) {
    const observed = Date.parse(observedAt);
    const expires = Date.parse(expiresAt);
    return Number.isFinite(observed) && Number.isFinite(expires) && expires > observed
        ? new Date(expires).toISOString()
        : null;
}

function buildBasisEvidence(topic, entry, createdAt) {
    const lane = compact(entry?.lane, 40);
    const basis = entry?.basis && typeof entry.basis === 'object' ? entry.basis : {};
    const key = stableHash(`${lane}:${normalizeTopicKey(topic)}:${basis.source_id || basis.item_id || ''}`);
    if (lane === 'explicit') {
        return {
            evidence_id: `evidence:content:explicit:${key}`,
            kind: 'owner_activity',
            stage: 'observed',
            strength: 'explicit',
            summary: '현재 사용자가 직접 입력한 주제입니다.',
            observed_at: compact(basis.observed_at || createdAt, 80),
            expires_at: null,
            source_ref: {
                kind: 'event', id: compact(basis.source_id || 'request:current', 240), label: '현재 요청',
                provider_id: '', transport: '', url: '', timestamp: compact(basis.observed_at || createdAt, 80)
            },
            features: { query_lane: 'explicit' }
        };
    }
    if (lane === 'owner_activity') {
        return {
            evidence_id: `evidence:content:owner:${key}`,
            kind: 'owner_activity',
            stage: compact(basis.stage, 40),
            strength: compact(basis.strength || 'medium', 40),
            summary: `사용자의 ${compact(basis.stage, 40)} 활동에서 확인된 주제입니다.`,
            observed_at: compact(basis.timestamp, 80),
            expires_at: null,
            source_ref: {
                kind: compact(basis.source_kind || 'event', 40), id: compact(basis.source_id, 240),
                label: '사용자 콘텐츠 활동', provider_id: '', transport: '', url: '',
                timestamp: compact(basis.timestamp, 80)
            },
            features: { query_lane: 'owner_activity' }
        };
    }
    if (lane === 'trends') {
        const observedAt = compact(basis.observed_at, 80);
        return {
            evidence_id: `evidence:content:trend:${key}`,
            kind: 'knowledge',
            stage: 'observed',
            strength: 'weak',
            summary: '외부 Trends에서 관찰된 주제입니다.',
            observed_at: observedAt,
            expires_at: optionalExpiry(observedAt, basis.snapshot_expires_at),
            source_ref: {
                kind: 'knowledge', id: compact(basis.item_id, 240), label: compact(basis.item_title || topic, 160),
                provider_id: compact(basis.provider_id, 120), transport: compact(basis.transport, 80),
                url: compact(basis.url, 1000), timestamp: observedAt
            },
            features: {
                query_lane: 'trends',
                categories: Array.isArray(basis.categories) ? basis.categories.slice(0, 10) : [],
                change_type: compact(basis.change_type, 40),
                change_amount: basis.change_amount,
                score: basis.score
            }
        };
    }
    return null;
}

function normalizeArticleEntries(newsQueries = [], now) {
    const nowMs = Date.parse(now);
    const entries = [];
    for (const collected of Array.isArray(newsQueries) ? newsQueries : []) {
        for (const snapshot of Array.isArray(collected?.snapshots) ? collected.snapshots : []) {
            if (!Number.isFinite(Date.parse(snapshot?.expires_at)) || Date.parse(snapshot.expires_at) <= nowMs) continue;
            for (const item of Array.isArray(snapshot?.items) ? snapshot.items : []) {
                entries.push({ query: collected.query, snapshot, item });
            }
        }
    }
    return entries;
}

function dedupeArticles(entries = []) {
    const result = [];
    const urls = new Set();
    const titles = new Set();
    for (const entry of entries) {
        const url = compact(entry?.item?.url, 1000);
        const titleKey = normalizeTopicKey(entry?.item?.title);
        if (!url || !titleKey || urls.has(url) || titles.has(titleKey)) continue;
        urls.add(url);
        titles.add(titleKey);
        result.push(entry);
        if (result.length >= MAX_NEWS_EVIDENCE) break;
    }
    return result;
}

function buildNewsEvidence(topic, entry) {
    const item = entry.item || {};
    const snapshot = entry.snapshot || {};
    const observedAt = compact(item.published_at || item.observed_at || snapshot.observed_at, 80);
    const key = stableHash(`${snapshot.provider_id}:${item.id}:${item.url}`);
    return {
        evidence_id: `evidence:content:news:${key}`,
        kind: 'knowledge',
        stage: 'observed',
        strength: 'weak',
        summary: compact(`${item.publisher}의 ${topic} 관련 보도: ${item.title}`, 300),
        observed_at: observedAt,
        expires_at: optionalExpiry(observedAt, snapshot.expires_at),
        source_ref: {
            kind: 'knowledge', id: compact(item.id, 240), label: compact(item.title, 160),
            provider_id: compact(snapshot.provider_id, 120), transport: compact(snapshot.transport, 80),
            url: compact(item.url, 1000), timestamp: observedAt
        },
        features: { query_lane: compact(entry?.query?.lane, 40), publisher: compact(item.publisher, 160) }
    };
}

function describeCandidate(topic, bases, articleCount) {
    const lanes = new Set(bases.map((entry) => entry.lane));
    const reasons = [];
    if (lanes.has('explicit')) reasons.push('현재 입력한 주제');
    if (lanes.has('owner_activity')) reasons.push('저장·선택·작성·발행 활동에서 확인된 주제');
    if (lanes.has('trends')) reasons.push('외부 Trends에서 관찰된 주제');
    if (articleCount > 0) reasons.push(`관련 보도 ${articleCount}건`);
    const title = articleCount > 0
        ? `${topic} 관련 보도를 바탕으로 글을 정리해보세요`
        : lanes.has('trends')
            ? `${topic} 흐름을 글감으로 검토해보세요`
            : lanes.has('owner_activity')
                ? `${topic} 주제를 새로운 관점으로 다시 살펴보세요`
                : `${topic} 주제로 글감을 구체화해보세요`;
    return {
        title,
        summary: `${topic}에 대해 확인된 근거를 바탕으로 글감 후보를 제안합니다.`,
        explanation: `${reasons.join(', ')}에 근거한 제안입니다.`
    };
}

function createContentOpportunityProducer(options = {}) {
    const now = typeof options.now === 'function' ? options.now : () => new Date();
    const collector = options.collector || (options.knowledgeRegistry
        ? createContentKnowledgeCollector({ knowledgeRegistry: options.knowledgeRegistry, now })
        : null);
    return {
        id: CONTENT_PRODUCER_ID,
        version: CONTENT_PRODUCER_VERSION,
        kinds: ['content_opportunity'],
        async produce(input = {}, context = {}) {
            const createdAt = new Date(now()).toISOString();
            const contentKnowledge = input.content_knowledge || context.content_knowledge
                || (collector?.collect ? await collector.collect(input, context) : null);
            const newsQueries = Array.isArray(contentKnowledge?.news_queries) ? contentKnowledge.news_queries : [];
            const articles = normalizeArticleEntries(newsQueries, createdAt);
            const ownerUserId = compact(input.owner_user_id || context.owner_user_id, 240);
            const candidates = [];

            for (const collected of newsQueries.slice(0, 3)) {
                const query = collected?.query || {};
                const topic = compact(query.topic, 180);
                const normalizedTopic = normalizeTopicKey(topic);
                if (!topic || !normalizedTopic) continue;
                const bases = Array.isArray(query.bases) ? query.bases : [];
                const basisEvidence = bases.map((entry) => buildBasisEvidence(topic, entry, createdAt)).filter(Boolean);
                const topicArticles = dedupeArticles(articles.filter((entry) =>
                    entry?.query?.normalized_topic === query.normalized_topic));
                const newsEvidence = topicArticles.map((entry) => buildNewsEvidence(topic, entry));
                const evidence = [...basisEvidence, ...newsEvidence].slice(0, 12);
                if (evidence.length === 0) continue;
                const copy = describeCandidate(topic, bases, newsEvidence.length);
                const topicHash = stableHash(`${CONTENT_PRODUCER_VERSION}:${normalizedTopic}`);
                candidates.push({
                    candidate_id: `candidate:content:${topicHash}`,
                    kind: 'content_opportunity',
                    producer_id: CONTENT_PRODUCER_ID,
                    owner_user_id: ownerUserId,
                    title: copy.title,
                    summary: copy.summary,
                    explanation: copy.explanation,
                    evidence,
                    handoff: null,
                    dedupe_key: `content_opportunity:${topicHash}`,
                    created_at: createdAt,
                    expires_at: new Date(Date.parse(createdAt) + 24 * 60 * 60 * 1000).toISOString(),
                    metadata: {
                        topic,
                        source_lanes: [...new Set(bases.map((entry) => compact(entry.lane, 40)).filter(Boolean))],
                        article_count: newsEvidence.length
                    }
                });
            }
            return { candidates };
        }
    };
}

module.exports = {
    CONTENT_PRODUCER_ID,
    CONTENT_PRODUCER_VERSION,
    MAX_NEWS_EVIDENCE,
    buildBasisEvidence,
    createContentOpportunityProducer,
    dedupeArticles,
    describeCandidate,
    normalizeArticleEntries
};
