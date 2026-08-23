const crypto = require('crypto');
const { normalizeKnowledgeSnapshot } = require('../../knowledge/contracts/snapshot');
const {
    collectCommerceAnchors,
    normalizeProductIdentity,
    productIdentityMatches
} = require('./commerce-grounding');

const COMMERCE_OPPORTUNITY_PRODUCER_ID = 'commerce-opportunity-v1';
const COMMERCE_OPPORTUNITY_PRODUCER_VERSION = 1;
const MAX_COMMERCE_CANDIDATES = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

function compact(value, maxLength = 240) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function stableHash(value) {
    return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function collectFreshTrendEntries(knowledge, now) {
    const nowMs = Date.parse(now);
    const entries = [];
    for (const raw of Array.isArray(knowledge) ? knowledge : []) {
        if (raw?.kind !== 'trends') continue;
        let snapshot;
        try {
            snapshot = normalizeKnowledgeSnapshot(raw, { kind: 'trends' });
        } catch (_error) {
            continue;
        }
        if (Date.parse(snapshot.expires_at) <= nowMs) continue;
        for (const item of snapshot.items) entries.push({ snapshot, item });
    }
    return entries;
}

function buildTrendEvidence(entry) {
    const snapshot = entry.snapshot;
    const item = entry.item;
    const observedAt = item.observed_at || snapshot.observed_at;
    const expiresAt = Date.parse(snapshot.expires_at) > Date.parse(observedAt) ? snapshot.expires_at : null;
    return {
        evidence_id: `evidence:commerce:trend:${stableHash(`${snapshot.provider_id}:${item.id}`)}`,
        kind: 'knowledge',
        stage: 'observed',
        strength: 'weak',
        summary: `${compact(item.keyword || item.title, 180)}에 대한 외부 검색 관심 흐름이 관찰됐습니다.`,
        observed_at: observedAt,
        expires_at: expiresAt,
        source_ref: {
            kind: 'knowledge',
            id: compact(item.id, 240),
            label: compact(item.title || item.keyword, 160),
            provider_id: compact(snapshot.provider_id, 120),
            transport: compact(snapshot.transport, 80),
            url: compact(item.url, 1000),
            timestamp: observedAt
        },
        features: {
            categories: item.categories,
            change_type: item.change_type,
            change_amount: item.change_amount,
            score: item.score
        }
    };
}

function buildAnchorEvidence(anchor) {
    return {
        evidence_id: `evidence:commerce:anchor:${stableHash(`${anchor.lane}:${anchor.source_kind}:${anchor.source_id}`)}`,
        kind: 'owner_activity',
        stage: anchor.stage,
        strength: anchor.strength,
        summary: anchor.lane === 'explicit'
            ? '현재 사용자가 쇼핑 콘텐츠 대상으로 직접 지정한 상품입니다.'
            : `사용자의 shopping ${anchor.stage} 활동에서 확인된 상품입니다.`,
        observed_at: anchor.timestamp,
        expires_at: null,
        source_ref: {
            kind: anchor.source_kind,
            id: anchor.source_id,
            label: anchor.lane === 'explicit' ? '현재 쇼핑 콘텐츠 요청' : '사용자 쇼핑 활동',
            provider_id: '',
            transport: '',
            url: '',
            timestamp: anchor.timestamp
        },
        features: { anchor_lane: anchor.lane, product: anchor.product }
    };
}

function candidateCopy(product, anchor) {
    const basis = anchor.lane === 'explicit'
        ? '현재 지정한 쇼핑 상품'
        : '저장·선택·작성·발행한 쇼핑 상품';
    return {
        title: `${product}의 검색 관심 흐름을 쇼핑 글감으로 검토해보세요`,
        summary: `${product}에 대한 검색 관심 흐름과 사용자의 쇼핑 맥락이 함께 확인됐습니다.`,
        explanation: `외부 Trends 관찰과 ${basis} 근거가 같은 대상을 가리키는 콘텐츠 후보입니다.`
    };
}

function createCommerceOpportunityProducer(options = {}) {
    const now = typeof options.now === 'function' ? options.now : () => new Date();
    return {
        id: COMMERCE_OPPORTUNITY_PRODUCER_ID,
        version: COMMERCE_OPPORTUNITY_PRODUCER_VERSION,
        kinds: ['commerce_opportunity'],
        async produce(input = {}, context = {}) {
            const createdAt = new Date(now()).toISOString();
            const ownerUserId = compact(input.owner_user_id || context.owner_user_id, 240);
            const memoryOwnerId = compact(context?.memory?.owner_memory?.owner_user_id, 240);
            if (!ownerUserId || (memoryOwnerId && memoryOwnerId !== ownerUserId)) return { candidates: [] };
            const anchors = collectCommerceAnchors(input, context, { now: createdAt });
            if (anchors.length === 0) return { candidates: [] };
            const suppliedKnowledge = Array.isArray(input.knowledge)
                ? input.knowledge
                : (Array.isArray(context.knowledge) ? context.knowledge : []);
            const trends = collectFreshTrendEntries(suppliedKnowledge, createdAt);
            const candidates = [];
            const identities = new Set();

            for (const entry of trends) {
                const trendTopic = compact(entry.item.keyword || entry.item.title, 180);
                const anchor = anchors.find((item) => productIdentityMatches(item.product, trendTopic));
                if (!anchor) continue;
                const identity = normalizeProductIdentity(anchor.product);
                if (!identity || identities.has(identity)) continue;
                const expiresAtMs = Math.min(Date.parse(createdAt) + DAY_MS, Date.parse(entry.snapshot.expires_at));
                if (expiresAtMs <= Date.parse(createdAt)) continue;
                identities.add(identity);
                const copy = candidateCopy(anchor.product, anchor);
                const hash = stableHash(`${COMMERCE_OPPORTUNITY_PRODUCER_VERSION}:${identity}`);
                candidates.push({
                    candidate_id: `candidate:commerce:${hash}`,
                    kind: 'commerce_opportunity',
                    producer_id: COMMERCE_OPPORTUNITY_PRODUCER_ID,
                    owner_user_id: ownerUserId,
                    title: copy.title,
                    summary: copy.summary,
                    explanation: copy.explanation,
                    evidence: [buildTrendEvidence(entry), buildAnchorEvidence(anchor)],
                    handoff: null,
                    dedupe_key: `commerce_opportunity:${hash}`,
                    created_at: createdAt,
                    expires_at: new Date(expiresAtMs).toISOString(),
                    metadata: {
                        product: anchor.product,
                        product_identity: identity,
                        anchor_lane: anchor.lane,
                        trend_change_type: entry.item.change_type,
                        trend_change_amount: entry.item.change_amount,
                        trend_score: entry.item.score
                    }
                });
                if (candidates.length >= MAX_COMMERCE_CANDIDATES) break;
            }
            return { candidates };
        }
    };
}

module.exports = {
    COMMERCE_OPPORTUNITY_PRODUCER_ID,
    COMMERCE_OPPORTUNITY_PRODUCER_VERSION,
    MAX_COMMERCE_CANDIDATES,
    buildAnchorEvidence,
    buildTrendEvidence,
    candidateCopy,
    collectFreshTrendEntries,
    createCommerceOpportunityProducer
};
