const { ACTIVE_STATES } = require('../../recommendations/core/lifecycle');
const { DEFAULT_COOLDOWNS_MS, isWithinCooldown } = require('../../recommendations/policy/eligibility');

const DEFAULT_REFRESH_TTL_MS = 15 * 60 * 1000;

function discoverySourceLane(candidate = {}) {
    const explicit = String(candidate?.metadata?.discovery_source_lane || '').trim();
    if (['news', 'trends', 'owner_history'].includes(explicit)) return explicit;
    const sourceLanes = Array.isArray(candidate?.metadata?.source_lanes)
        ? candidate.metadata.source_lanes
        : [];
    if (sourceLanes.includes('discovery')) return 'news';
    if (sourceLanes.includes('trends')) return 'trends';
    if (sourceLanes.includes('owner_activity')) return 'owner_history';
    return '';
}

function discoverySourcePreference(candidate = {}) {
    const lane = discoverySourceLane(candidate);
    const newsTransport = lane === 'news'
        ? String(candidate?.metadata?.discovery_news_transport || '').trim()
        : '';
    return {
        lane,
        news_transport: ['stored_corpus', 'query_news'].includes(newsTransport) ? newsTransport : ''
    };
}

function selectReplacementCandidate(candidates = [], preference = {}) {
    const available = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
    const lane = String(preference?.lane || '').trim();
    const newsTransport = String(preference?.news_transport || '').trim();
    if (!lane) return available[0] || null;
    return available.find((candidate) => {
        const source = discoverySourcePreference(candidate);
        return source.lane === lane && (!newsTransport || source.news_transport === newsTransport);
    }) || available.find((candidate) => discoverySourceLane(candidate) === lane)
        || available[0]
        || null;
}

function discoveryOffsets(history = []) {
    const offsets = { news: 0, trends: 0, owner: 0 };
    for (const item of Array.isArray(history) ? history : []) {
        if (item?.candidate?.kind !== 'content_opportunity') continue;
        const lane = discoverySourceLane(item.candidate);
        if (lane === 'news') offsets.news += 1;
        if (lane === 'trends') offsets.trends += 1;
        if (lane === 'owner_history') offsets.owner += 1;
    }
    return offsets;
}

function latestDiscoveryNewsTransport(history = []) {
    for (const item of Array.isArray(history) ? history : []) {
        if (item?.candidate?.kind !== 'content_opportunity') continue;
        if (discoverySourceLane(item.candidate) !== 'news') continue;
        const transport = String(item?.candidate?.metadata?.discovery_news_transport || '').trim();
        if (transport === 'stored_corpus' || transport === 'query_news') return transport;
        return 'query_news';
    }
    return '';
}

function recentCorpusObservationIds(history = [], limit = 3) {
    const boundedLimit = Math.max(1, Math.min(100, Number(limit) || 3));
    const ids = [];
    const seen = new Set();
    for (const item of Array.isArray(history) ? history : []) {
        if (item?.candidate?.kind !== 'content_opportunity') continue;
        if (String(item?.candidate?.metadata?.discovery_news_transport || '').trim() !== 'stored_corpus') continue;
        for (const evidence of Array.isArray(item?.candidate?.evidence) ? item.candidate.evidence : []) {
            if (evidence?.kind !== 'knowledge') continue;
            const source = evidence?.source_ref || {};
            const id = String(source.id || '').replace(/\s+/g, ' ').trim();
            if (!id || id.length > 180 || seen.has(id)) continue;
            seen.add(id);
            ids.push(id);
            if (ids.length >= boundedLimit) return ids;
        }
    }
    return ids;
}

function discoveryDedupeKeys(history = [], at = new Date().toISOString(), options = {}) {
    const nowMs = Date.parse(at);
    if (!Number.isFinite(nowMs)) return [];
    const keys = [];
    const seen = new Set();
    for (const item of Array.isArray(history) ? history : []) {
        if (!['content_opportunity', 'commerce_opportunity'].includes(item?.candidate?.kind)) continue;
        const active = ACTIVE_STATES.includes(item?.status) && Date.parse(item?.expires_at) > nowMs;
        const coolingDown = item?.status === 'rotated' && options.includeRotated === false
            ? false
            : isWithinCooldown(item, nowMs, DEFAULT_COOLDOWNS_MS);
        const key = String(item?.candidate?.dedupe_key || '').trim();
        if ((!active && !coolingDown) || !key || seen.has(key)) continue;
        seen.add(key);
        keys.push(key);
    }
    return keys;
}

function createRecommendationRefreshService(options = {}) {
    const eventStore = options.eventStore;
    const memoryRetrievalService = options.memoryRetrievalService;
    const operationalStateCollector = options.operationalStateCollector;
    const contentKnowledgeCollector = options.contentKnowledgeCollector;
    const producerRunner = options.producerRunner;
    const policyEvaluator = options.policyEvaluator;
    const licenseStatusReader = options.licenseStatusReader;
    const logger = options.logger;
    const now = typeof options.now === 'function' ? options.now : () => new Date();
    const refreshTtlMs = Math.max(60 * 1000, Number(options.refreshTtlMs) || DEFAULT_REFRESH_TTL_MS);
    const lastRunAt = new Map();
    const inFlight = new Map();

    if (!eventStore?.getLocalOwnerIdentity) throw new Error('recommendation owner store가 필요합니다.');
    if (!memoryRetrievalService?.buildContextPacket) throw new Error('recommendation memory retrieval service가 필요합니다.');
    if (!operationalStateCollector?.collect || !contentKnowledgeCollector?.collect) {
        throw new Error('recommendation context collector가 필요합니다.');
    }
    if (!producerRunner?.run || !policyEvaluator?.evaluate) {
        throw new Error('recommendation evaluation runtime이 필요합니다.');
    }

    function ownerUserId() {
        return String(eventStore.getLocalOwnerIdentity()?.owner_user_id || '').trim();
    }

    async function evaluate(owner, refreshInput = {}) {
        const evaluatedAt = new Date(now()).toISOString();
        const memory = await memoryRetrievalService.buildContextPacket({ ownerUserId: owner, limit: 20 });
        let recommendationHistory = [];
        try {
            recommendationHistory = typeof eventStore.listRecommendations === 'function'
                ? await eventStore.listRecommendations(owner, { limit: 200 })
                : [];
        } catch (error) {
            logger?.warn?.(`⚠️ [RecommendationCenter] 발견 이력 조회 실패: ${error.message}`);
        }
        const discoveryHistory = recommendationHistory.filter((item) =>
            ['content_opportunity', 'commerce_opportunity'].includes(item?.candidate?.kind));
        const isUserDiscovery = ['user_new_discovery', 'user_dismiss_replacement'].includes(refreshInput.reason);
        const replacementPreference = refreshInput.reason === 'user_dismiss_replacement'
            ? refreshInput.preferred_source || {}
            : null;
        const excludedDedupeKeys = discoveryDedupeKeys(discoveryHistory, evaluatedAt, {
            includeRotated: !isUserDiscovery
        });
        const sourceOffsets = discoveryOffsets(discoveryHistory);
        const previousNewsSource = latestDiscoveryNewsTransport(discoveryHistory);
        const recentlyShownCorpusIds = recentCorpusObservationIds(discoveryHistory);
        const baseContext = { owner_user_id: owner, memory };
        const [operationalState, contentKnowledge, licenseStatus] = await Promise.all([
            operationalStateCollector.collect({ owner_user_id: owner }, baseContext),
            contentKnowledgeCollector.collect({
                serendipity: true,
                discovery_offset: sourceOffsets.news,
                discovery_offsets: sourceOffsets,
                previous_news_source: previousNewsSource,
                preferred_news_source: replacementPreference?.news_transport || '',
                recently_shown_ids: recentlyShownCorpusIds
            }, baseContext),
            typeof licenseStatusReader === 'function'
                ? licenseStatusReader()
                : Promise.resolve(null)
        ]);
        const remaining = Number(licenseStatus?.remaining);
        const context = {
            ...baseContext,
            operational_state: operationalState,
            content_knowledge: contentKnowledge,
            knowledge: contentKnowledge.trends || [],
            license_features: licenseStatus?.success === true ? licenseStatus.features : undefined,
            quota: {
                publishing: {
                    known: licenseStatus?.success === true && (remaining === -1 || Number.isFinite(remaining)),
                    unlimited: licenseStatus?.success === true && remaining === -1,
                    remaining: remaining === -1 ? 0 : (Number.isFinite(remaining) ? remaining : 0)
                }
            }
        };
        const produced = await producerRunner.run({
            owner_user_id: owner,
            serendipity: true,
            discovery_offsets: sourceOffsets,
            excluded_dedupe_keys: excludedDedupeKeys,
            operational_state: operationalState,
            content_knowledge: contentKnowledge,
            knowledge: context.knowledge
        }, context);
        const contentCandidates = produced.candidates.filter((candidate) => candidate?.kind === 'content_opportunity');
        const commerceCandidates = produced.candidates.filter((candidate) => candidate?.kind === 'commerce_opportunity');
        const candidatePool = contentCandidates.length >= 3
            ? contentCandidates
            : [...contentCandidates, ...commerceCandidates];
        const replacementCandidate = replacementPreference
            ? selectReplacementCandidate(candidatePool, replacementPreference)
            : null;
        const discoveryCandidates = replacementPreference
            ? [replacementCandidate].filter(Boolean)
            : candidatePool.slice(0, 3);
        const evaluated = await policyEvaluator.evaluate({
            owner_user_id: owner,
            candidates: discoveryCandidates
        }, context, isUserDiscovery
            ? {
                rankingOptions: { dailyLimitEnabled: false },
                eligibilityOptions: { cooldowns: { rotated: 0 } }
            }
            : {});
        const knowledgeDiagnostics = Array.isArray(contentKnowledge.diagnostics) ? contentKnowledge.diagnostics : [];
        const degraded = knowledgeDiagnostics.some((item) => String(item?.code || '').includes('FAILED'));
        lastRunAt.set(owner, Date.parse(new Date(now()).toISOString()));
        const createdCount = evaluated.recommendations.filter((item) => item.persisted && !item.deduplicated).length;
        const deduplicatedCount = evaluated.recommendations.filter((item) => item.deduplicated).length;
        logger?.info?.(`✅ [RecommendationCenter] 발견 평가 완료 (후보=${discoveryCandidates.length}, 신규=${createdCount}, 중복=${deduplicatedCount}, 억제=${evaluated.suppressed.length}${degraded ? ', Knowledge 일부 실패' : ''})`);
        return {
            status: 'evaluated',
            candidate_count: discoveryCandidates.length,
            recommendation_count: createdCount,
            ...(replacementPreference ? {
                selected_source: replacementCandidate ? discoverySourcePreference(replacementCandidate) : null
            } : {}),
            degraded
        };
    }

    return {
        async refresh(input = {}) {
            const owner = ownerUserId();
            if (!owner) return { status: 'owner_unavailable', candidate_count: 0, recommendation_count: 0 };
            const currentTime = Date.parse(new Date(now()).toISOString());
            const previous = lastRunAt.get(owner) || 0;
            if (input.force !== true && currentTime - previous < refreshTtlMs) {
                return { status: 'cached', candidate_count: 0, recommendation_count: 0, degraded: false };
            }
            if (inFlight.has(owner)) {
                if (input.force === true && input.reason === 'user_dismiss_replacement') {
                    await inFlight.get(owner);
                } else {
                    return inFlight.get(owner);
                }
            }
            const task = evaluate(owner, input).finally(() => inFlight.delete(owner));
            inFlight.set(owner, task);
            return task;
        }
    };
}

module.exports = {
    DEFAULT_REFRESH_TTL_MS,
    createRecommendationRefreshService,
    discoveryDedupeKeys,
    discoveryOffsets,
    discoverySourceLane,
    discoverySourcePreference,
    latestDiscoveryNewsTransport,
    recentCorpusObservationIds,
    selectReplacementCandidate
};
