const DEFAULT_REFRESH_TTL_MS = 15 * 60 * 1000;

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

    async function evaluate(owner) {
        const memory = await memoryRetrievalService.buildContextPacket({ ownerUserId: owner, limit: 20 });
        const baseContext = { owner_user_id: owner, memory };
        const [operationalState, contentKnowledge, licenseStatus] = await Promise.all([
            operationalStateCollector.collect({ owner_user_id: owner }, baseContext),
            contentKnowledgeCollector.collect({}, baseContext),
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
            operational_state: operationalState,
            content_knowledge: contentKnowledge,
            knowledge: context.knowledge
        }, context);
        const evaluated = await policyEvaluator.evaluate({
            owner_user_id: owner,
            candidates: produced.candidates
        }, context);
        lastRunAt.set(owner, Date.parse(new Date(now()).toISOString()));
        logger?.info?.(`✅ [RecommendationCenter] 추천 평가 완료 (후보=${produced.candidates.length}, 생성=${evaluated.recommendations.length})`);
        return {
            status: 'evaluated',
            candidate_count: produced.candidates.length,
            recommendation_count: evaluated.recommendations.length
        };
    }

    return {
        async refresh(input = {}) {
            const owner = ownerUserId();
            if (!owner) return { status: 'owner_unavailable', candidate_count: 0, recommendation_count: 0 };
            const currentTime = Date.parse(new Date(now()).toISOString());
            const previous = lastRunAt.get(owner) || 0;
            if (input.force !== true && currentTime - previous < refreshTtlMs) {
                return { status: 'cached', candidate_count: 0, recommendation_count: 0 };
            }
            if (inFlight.has(owner)) return inFlight.get(owner);
            const task = evaluate(owner).finally(() => inFlight.delete(owner));
            inFlight.set(owner, task);
            return task;
        }
    };
}

module.exports = {
    DEFAULT_REFRESH_TTL_MS,
    createRecommendationRefreshService
};
