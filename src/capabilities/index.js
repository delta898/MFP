const { buildCapabilityId } = require('./capability-id');
const { createConfigStateManager } = require('./config-state');
const { createChatModelCapabilities } = require('./settings/chat-model');
const { createAgentPendingCapabilities } = require('./agent/pending');
const { createAgentMetaCapabilities } = require('./agent/meta');
const { createAgentPreferenceCapabilities } = require('./agent/preferences');
const { createAgentRecommendationCapabilities } = require('./agent/recommendations');
const { createKnowledgeRegistry } = require('../services/knowledge/registry');
const { createRecommendationRequestService } = require('../services/recommendations/request-service');
const { createMemoryContextRecommendationProducer } = require('../services/recommendations/producers/memory-context');
const { createRecommendationMaterializer } = require('../services/recommendations/adapters/recommendation-materializer');
const { createContentIdeaCapabilities } = require('./content/ideas');
const { createRegisterTopicCapabilities } = require('./content/register-topic');
const { createPublishCapabilities } = require('./content/publish');
const { createKeywordResearchCapabilities } = require('./content/keyword-research');

function resolveCapabilityId(capability) {
    const explicitId = String(capability?.id || '').trim();
    const domain = String(capability?.domain || '').trim();
    const name = String(capability?.name || '').trim();
    const id = explicitId || (domain && name ? buildCapabilityId(domain, name) : '');
    if (!id) throw new Error('Capability must provide an id or domain/name.');
    return id;
}

function createCapabilityRegistry(deps = {}) {
    const configState = createConfigStateManager(deps);
    const routing = deps.knowledgeRouting || {};
    const knowledgeRegistry = deps.knowledgeRegistry || createKnowledgeRegistry({ logger: deps.Logger });
    const recommendationMaterializer = deps.recommendationMaterializer || createRecommendationMaterializer({
        eventStore: deps.eventStore,
        Logger: deps.Logger
    });
    const recommendationRequestService = deps.recommendationRequestService || createRecommendationRequestService({
        knowledgeRegistry,
        recommendationMaterializer,
        Logger: deps.Logger,
        providers: [
            createMemoryContextRecommendationProducer()
        ]
    });
    const capabilityDeps = { ...deps, configState, knowledgeRegistry, recommendationRequestService, recommendationMaterializer };

    const allCapabilities = [
        ...createAgentMetaCapabilities(capabilityDeps),
        ...createAgentPendingCapabilities(capabilityDeps),
        ...createAgentPreferenceCapabilities(capabilityDeps),
        ...createAgentRecommendationCapabilities(capabilityDeps),
        ...createRegisterTopicCapabilities(capabilityDeps),
        ...createPublishCapabilities(capabilityDeps),
        ...createContentIdeaCapabilities(capabilityDeps),
        ...createKeywordResearchCapabilities(capabilityDeps),
        ...createChatModelCapabilities(capabilityDeps)
    ];

    const capabilitiesById = new Map();
    allCapabilities.forEach((capability) => {
        const id = resolveCapabilityId(capability);
        if (capabilitiesById.has(id)) throw new Error(`Duplicate capability ${id}.`);
        capabilitiesById.set(id, capability);
    });

    return {
        configState,
        knowledgeRegistry,
        knowledgeRouting: routing,
        list() {
            return [...capabilitiesById.values()];
        },
        get(id) {
            return capabilitiesById.get(String(id || '').trim()) || null;
        },
        has(id) {
            return capabilitiesById.has(String(id || '').trim());
        },
        async validateAction(action, context = {}) {
            const capability = this.get(buildCapabilityId(action.domain, action.name));
            if (!capability) return { ok: false, errors: ['등록되지 않은 capability입니다.'], normalizedParams: null };
            return capability.validate(action.params || {}, context);
        },
        async previewAction(action, context = {}) {
            const capability = this.get(buildCapabilityId(action.domain, action.name));
            if (!capability) throw new Error('등록되지 않은 capability입니다.');
            return capability.preview(action.params || {}, context);
        },
        async executeAction(action, context = {}) {
            const capability = this.get(buildCapabilityId(action.domain, action.name));
            if (!capability) throw new Error('등록되지 않은 capability입니다.');
            const validation = await capability.validate(action.params || {}, context);
            if (!validation.ok) {
                throw new Error(validation.errors.join(' '));
            }
            const normalizedAction = { ...action, params: validation.normalizedParams };
            return capability.execute(normalizedAction.params || {}, context);
        }
    };
}

module.exports = {
    createCapabilityRegistry
};
