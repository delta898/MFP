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
            features: {
                query_lane: 'owner_activity',
                recency_band: compact(basis.recency_band, 40)
            }
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
            expires_at: optionalExpiry(observedAt, basis.evidence_expires_at || basis.snapshot_expires_at),
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
                score: basis.score,
                recency_band: compact(basis.recency_band, 40)
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

function normalizeCorpusEntries(snapshots = [], now) {
    const nowMs = Date.parse(now);
    const entries = [];
    for (const snapshot of Array.isArray(snapshots) ? snapshots : []) {
        if (!Number.isFinite(Date.parse(snapshot?.expires_at))
            || Date.parse(snapshot.expires_at) <= nowMs) continue;
        for (const item of Array.isArray(snapshot?.items) ? snapshot.items : []) {
            entries.push({ query: { lane: 'corpus_discovery' }, snapshot, item });
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
    const isSerendipity = lanes.has('trends') && !lanes.has('explicit') && !lanes.has('owner_activity');
    const title = isSerendipity
        ? topic
        : articleCount > 0
        ? `${topic} 관련 보도를 바탕으로 글을 정리해보세요`
        : lanes.has('trends')
            ? `${topic} 흐름을 글감으로 검토해보세요`
            : lanes.has('owner_activity')
                ? `${topic} 주제를 새로운 관점으로 다시 살펴보세요`
                : `${topic} 주제로 글감을 구체화해보세요`;
    return {
        title,
        summary: isSerendipity
            ? `${topic}에서 새로운 소재나 관점을 발견할 수 있습니다.`
            : `${topic}에 대해 확인된 근거를 바탕으로 글감 후보를 제안합니다.`,
        explanation: `${reasons.join(', ')}에 근거한 제안입니다.`
    };
}

function buildDiscoveryCandidate(ownerUserId, query, articleEntry, createdAt) {
    const articleTopic = compact(articleEntry?.item?.title, 180);
    const articleKey = normalizeTopicKey(articleTopic);
    if (!articleTopic || !articleKey) return null;
    const articleHash = stableHash(`${CONTENT_PRODUCER_VERSION}:discovery:${articleKey}`);
    const domain = compact(query?.topic, 180);
    const domainIndex = Number(query?.bases?.[0]?.basis?.domain_index);
    return {
        candidate_id: `candidate:content:${articleHash}`,
        kind: 'content_opportunity',
        producer_id: CONTENT_PRODUCER_ID,
        owner_user_id: ownerUserId,
        title: articleTopic,
        summary: `${domain} 영역에서 뜻밖에 만난 최신 소재입니다.`,
        explanation: `${domain} 관련 최신 보도에서 발견한 제안입니다.`,
        evidence: [buildNewsEvidence(articleTopic, articleEntry)],
        handoff: {
            type: 'presentation',
            label: '소재 적용하기',
            target: { surface: 'blog.quick', view: 'blog', tab: 'quick' },
            payload: { query: articleTopic }
        },
        dedupe_key: `content_opportunity:${articleHash}`,
        created_at: createdAt,
        expires_at: new Date(Date.parse(createdAt) + 24 * 60 * 60 * 1000).toISOString(),
        metadata: {
            topic: articleTopic,
            discovery_lane: 'serendipity',
            discovery_source_lane: 'news',
            discovery_news_transport: 'query_news',
            discovery_hint: '네이버 뉴스',
            discovery_domain: domain,
            discovery_domain_index: Number.isFinite(domainIndex) ? domainIndex : null,
            source_lanes: ['discovery'],
            article_count: 1
        }
    };
}

function buildCorpusDiscoveryCandidate(ownerUserId, articleEntry, createdAt) {
    const item = articleEntry?.item || {};
    const snapshot = articleEntry?.snapshot || {};
    const articleTopic = compact(item.title, 180);
    const articleKey = normalizeTopicKey(articleTopic);
    const itemId = compact(item.id, 180);
    const providerId = compact(snapshot.provider_id, 120);
    if (!articleTopic || !articleKey || !itemId || !providerId) return null;
    const articleHash = stableHash(`${CONTENT_PRODUCER_VERSION}:corpus:${providerId}:${itemId}`);
    const publisher = compact(item.publisher, 160);
    return {
        candidate_id: `candidate:content:${articleHash}`,
        kind: 'content_opportunity',
        producer_id: CONTENT_PRODUCER_ID,
        owner_user_id: ownerUserId,
        title: articleTopic,
        summary: '뜻밖에 만난 뉴스 소재입니다.',
        explanation: publisher
            ? `${publisher} 보도에서 발견한 제안입니다.`
            : '저장된 뉴스 관찰 자료에서 발견한 제안입니다.',
        evidence: [buildNewsEvidence(articleTopic, articleEntry)],
        handoff: {
            type: 'presentation',
            label: '소재 적용하기',
            target: { surface: 'blog.quick', view: 'blog', tab: 'quick' },
            payload: { query: articleTopic }
        },
        dedupe_key: `content_opportunity:${articleHash}`,
        created_at: createdAt,
        expires_at: new Date(Date.parse(createdAt) + 24 * 60 * 60 * 1000).toISOString(),
        metadata: {
            topic: articleTopic,
            discovery_lane: 'serendipity',
            discovery_source_lane: 'news',
            discovery_news_transport: 'stored_corpus',
            discovery_hint: '발견 뉴스',
            source_lanes: ['corpus_discovery'],
            article_count: 1
        }
    };
}

function buildSourceDiscoveryCandidate(ownerUserId, query, sourceLane, createdAt) {
    const topic = compact(query?.topic, 180);
    const normalizedTopic = normalizeTopicKey(topic);
    const basisLane = sourceLane === 'trends' ? 'trends' : 'owner_activity';
    const bases = (Array.isArray(query?.bases) ? query.bases : [])
        .filter((entry) => entry?.lane === basisLane);
    const evidence = bases.map((entry) => buildBasisEvidence(topic, entry, createdAt)).filter(Boolean);
    if (!topic || !normalizedTopic || evidence.length === 0) return null;
    const topicHash = stableHash(`${CONTENT_PRODUCER_VERSION}:${sourceLane}:${normalizedTopic}`);
    const isTrend = sourceLane === 'trends';
    return {
        candidate_id: `candidate:content:${topicHash}`,
        kind: 'content_opportunity',
        producer_id: CONTENT_PRODUCER_ID,
        owner_user_id: ownerUserId,
        title: topic,
        summary: isTrend
            ? `${topic} 흐름에서 지금 눈여겨볼 소재나 관점을 발견할 수 있습니다.`
            : `${topic} 주제를 지금의 시선으로 다시 꺼내볼 수 있습니다.`,
        explanation: isTrend
            ? '현재 네이버 트렌드에서 관찰된 키워드에 근거한 발견입니다.'
            : '이전에 저장·선택·작성·발행한 사용자 활동에 근거한 재발견입니다.',
        evidence,
        handoff: {
            type: 'presentation',
            label: '소재 적용하기',
            target: { surface: 'blog.quick', view: 'blog', tab: 'quick' },
            payload: { query: topic }
        },
        dedupe_key: `content_opportunity:${topicHash}`,
        created_at: createdAt,
        expires_at: new Date(Date.parse(createdAt) + 24 * 60 * 60 * 1000).toISOString(),
        metadata: {
            topic,
            discovery_lane: 'serendipity',
            discovery_source_lane: sourceLane,
            discovery_hint: isTrend ? '트렌드 키워드' : '내 기록',
            source_lanes: [basisLane],
            article_count: 0
        }
    };
}

function composeSerendipityCandidates(input = {}) {
    const excluded = new Set(Array.isArray(input.excluded_dedupe_keys) ? input.excluded_dedupe_keys : []);
    const buckets = {
        trends: Array.isArray(input.trends) ? input.trends : [],
        news: Array.isArray(input.news) ? input.news : [],
        owner_history: Array.isArray(input.owner_history) ? input.owner_history : []
    };
    const selected = [];
    const selectedKeys = new Set(excluded);
    const selectedTopics = new Set();

    function add(candidate) {
        if (!candidate || selectedKeys.has(candidate.dedupe_key)) return false;
        const topicKey = normalizeTopicKey(candidate?.metadata?.topic || candidate.title);
        if (!topicKey || selectedTopics.has(topicKey)) return false;
        selected.push(candidate);
        selectedKeys.add(candidate.dedupe_key);
        selectedTopics.add(topicKey);
        return true;
    }

    for (const lane of ['trends', 'news', 'owner_history']) {
        const candidate = buckets[lane].find((item) => {
            const topicKey = normalizeTopicKey(item?.metadata?.topic || item?.title);
            return !selectedKeys.has(item?.dedupe_key) && topicKey && !selectedTopics.has(topicKey);
        });
        add(candidate);
    }
    if (selected.length < 3) {
        const fallback = ['news', 'trends', 'owner_history'].flatMap((lane) => buckets[lane]);
        for (const candidate of fallback) {
            add(candidate);
            if (selected.length >= 3) break;
        }
    }
    return selected.slice(0, 3);
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
            const corpusSnapshots = Array.isArray(contentKnowledge?.corpus_snapshots)
                ? contentKnowledge.corpus_snapshots
                : [];
            const plannedQueries = Array.isArray(contentKnowledge?.query_plan?.queries)
                ? contentKnowledge.query_plan.queries
                : newsQueries.map((entry) => entry.query);
            const articles = normalizeArticleEntries(newsQueries, createdAt);
            const ownerUserId = compact(input.owner_user_id || context.owner_user_id, 240);
            const serendipityMode = input.serendipity === true;
            const excludedDedupeKeys = new Set(
                (Array.isArray(input.excluded_dedupe_keys) ? input.excluded_dedupe_keys : [])
                    .map((item) => compact(item, 300))
                    .filter(Boolean)
            );
            const candidates = [];
            const discoveryPools = [];

            if (serendipityMode) {
                const sourceBuckets = { trends: [], news: [], owner_history: [] };
                for (const query of plannedQueries.slice(0, 10)) {
                    const bases = Array.isArray(query?.bases) ? query.bases : [];
                    if (bases.some((entry) => entry?.lane === 'trends')) {
                        const candidate = buildSourceDiscoveryCandidate(ownerUserId, query, 'trends', createdAt);
                        if (candidate) sourceBuckets.trends.push(candidate);
                    }
                    if (bases.some((entry) => entry?.lane === 'owner_activity')) {
                        const candidate = buildSourceDiscoveryCandidate(ownerUserId, query, 'owner_history', createdAt);
                        if (candidate) sourceBuckets.owner_history.push(candidate);
                    }
                }
                for (const collected of newsQueries.filter((entry) => entry?.query?.lane === 'discovery')) {
                    discoveryPools.push({
                        query: collected.query,
                        entries: dedupeArticles(normalizeArticleEntries([collected], createdAt))
                    });
                }
                for (const entry of dedupeArticles(normalizeCorpusEntries(corpusSnapshots, createdAt))) {
                    const candidate = buildCorpusDiscoveryCandidate(ownerUserId, entry, createdAt);
                    if (candidate) sourceBuckets.news.push(candidate);
                }
                const rawNewsOffset = Number.parseInt(input?.discovery_offsets?.news, 10);
                const articleOffset = Number.isFinite(rawNewsOffset) ? Math.max(0, rawNewsOffset) : 0;
                for (let pass = 0; pass < MAX_NEWS_EVIDENCE; pass += 1) {
                    const articleIndex = (articleOffset + pass) % MAX_NEWS_EVIDENCE;
                    for (const pool of discoveryPools) {
                        const candidate = buildDiscoveryCandidate(ownerUserId, pool.query, pool.entries[articleIndex], createdAt);
                        if (candidate) sourceBuckets.news.push(candidate);
                    }
                }
                return {
                    candidates: composeSerendipityCandidates({
                        ...sourceBuckets,
                        excluded_dedupe_keys: [...excludedDedupeKeys]
                    })
                };
            }

            for (const query of plannedQueries.slice(0, 10)) {
                const topic = compact(query.topic, 180);
                const normalizedTopic = normalizeTopicKey(topic);
                if (!topic || !normalizedTopic) continue;
                const bases = Array.isArray(query.bases) ? query.bases : [];
                const basisEvidence = bases.map((entry) => buildBasisEvidence(topic, entry, createdAt)).filter(Boolean);
                const topicArticles = dedupeArticles(articles.filter((entry) =>
                    entry?.query?.normalized_topic === query.normalized_topic));
                if (query.lane === 'discovery') {
                    discoveryPools.push({ query, entries: topicArticles });
                    continue;
                }
                const newsEvidence = topicArticles.map((entry) => buildNewsEvidence(topic, entry));
                const evidence = [...basisEvidence, ...newsEvidence].slice(0, 12);
                if (evidence.length === 0) continue;
                const copy = describeCandidate(topic, bases, newsEvidence.length);
                const lanes = [...new Set(bases.map((entry) => compact(entry.lane, 40)).filter(Boolean))];
                const discoveryLane = lanes.includes('trends') && !lanes.includes('explicit') && !lanes.includes('owner_activity')
                    ? 'serendipity'
                    : 'personalized';
                const topicHash = stableHash(`${CONTENT_PRODUCER_VERSION}:${normalizedTopic}`);
                if (excludedDedupeKeys.has(`content_opportunity:${topicHash}`)) continue;
                candidates.push({
                    candidate_id: `candidate:content:${topicHash}`,
                    kind: 'content_opportunity',
                    producer_id: CONTENT_PRODUCER_ID,
                    owner_user_id: ownerUserId,
                    title: copy.title,
                    summary: copy.summary,
                    explanation: copy.explanation,
                    evidence,
                    handoff: {
                        type: 'presentation',
                        label: '소재 적용하기',
                        target: { surface: 'blog.quick', view: 'blog', tab: 'quick' },
                        payload: { query: topic }
                    },
                    dedupe_key: `content_opportunity:${topicHash}`,
                    created_at: createdAt,
                    expires_at: new Date(Date.parse(createdAt) + 24 * 60 * 60 * 1000).toISOString(),
                    metadata: {
                        topic,
                        discovery_lane: discoveryLane,
                        discovery_hint: discoveryLane === 'serendipity'
                            ? '요즘 주목받는 키워드'
                            : '내 활동에서 다시 발견',
                        source_lanes: lanes,
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
    buildCorpusDiscoveryCandidate,
    buildDiscoveryCandidate,
    buildSourceDiscoveryCandidate,
    composeSerendipityCandidates,
    createContentOpportunityProducer,
    dedupeArticles,
    describeCandidate,
    normalizeArticleEntries,
    normalizeCorpusEntries
};
