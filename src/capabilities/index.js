const { buildCapabilityId } = require('../agent/action-schema');
const { createConfigStateManager } = require('./config-state');
const { createTrendsCapabilities } = require('./settings/trends');
const { createBlogAutoCapabilities } = require('./settings/blog-auto');
const { createChatModelCapabilities } = require('./settings/chat-model');
const { createAgentPendingCapabilities } = require('./agent/pending');
const { createAgentMetaCapabilities } = require('./agent/meta');
const { createAgentPreferenceCapabilities } = require('./agent/preferences');
const { createAgentSuggestionCapabilities } = require('./agent/suggestions');
const { createTrendJobCapabilities } = require('./jobs/trends');
const { createKnowledgeRegistry } = require('../knowledge/registry');
const { createBuiltinApiTransport } = require('../knowledge/transports/builtin-api');
const { createMcpToolTransport } = require('../knowledge/transports/mcp-tool');
const { createInternalQueryTransport } = require('../knowledge/transports/internal-query');
const { createSerpApiTrendsProvider } = require('../knowledge/providers/trends-serpapi');
const { createSuggestionEngine } = require('../suggestions/engine');
const { createMemoryBasedSuggestionProvider } = require('../suggestions/providers/memory-based');
const { createContentIdeaEngine } = require('../content-ideas/engine');
const { createAiMemoryContentIdeaProvider } = require('../content-ideas/providers/ai-memory');
const { createContentIdeaCapabilities } = require('./content/ideas');
const { createRegisterTopicCapabilities } = require('./content/register-topic');
const { createPublishCapabilities } = require('./content/publish');

function createCapabilityRegistry(deps = {}) {
    const configState = createConfigStateManager(deps);
    const providerDefinitions = Array.isArray(deps.CONFIG?.knowledge?.providers)
        ? deps.CONFIG.knowledge.providers
        : (Array.isArray(deps.CONFIG?.KNOWLEDGE_PROVIDERS) ? deps.CONFIG.KNOWLEDGE_PROVIDERS : []);
    const routing = deps.CONFIG?.knowledge?.routing && typeof deps.CONFIG.knowledge.routing === 'object'
        ? deps.CONFIG.knowledge.routing
        : (deps.CONFIG?.KNOWLEDGE_ROUTING && typeof deps.CONFIG.KNOWLEDGE_ROUTING === 'object' ? deps.CONFIG.KNOWLEDGE_ROUTING : {});
    const knowledgeRegistry = deps.knowledgeRegistry || createKnowledgeRegistry({
        providerDefinitions,
        routing,
        logger: deps.Logger,
        transports: {
            builtin_api: createBuiltinApiTransport({
                httpClient: deps.axios,
                handlers: {
                    'trends:serpapi': createSerpApiTrendsProvider()
                }
            }),
            mcp_tool: createMcpToolTransport(),
            internal_query: createInternalQueryTransport()
        }
    });
    const suggestionEngine = deps.suggestionEngine || createSuggestionEngine({
        knowledgeRegistry,
        providers: [
            createMemoryBasedSuggestionProvider()
        ]
    });
    const contentIdeaEngine = deps.contentIdeaEngine || createContentIdeaEngine({
        knowledgeRegistry,
        providers: [
            createAiMemoryContentIdeaProvider()
        ]
    });
    const capabilityDeps = { ...deps, configState, knowledgeRegistry, suggestionEngine, contentIdeaEngine };

    const allCapabilities = [
        ...createAgentMetaCapabilities(capabilityDeps),
        ...createAgentPendingCapabilities(capabilityDeps),
        ...createAgentPreferenceCapabilities(capabilityDeps),
        ...createAgentSuggestionCapabilities(capabilityDeps),
        ...createRegisterTopicCapabilities(capabilityDeps),
        ...createPublishCapabilities(capabilityDeps),
        ...createContentIdeaCapabilities(capabilityDeps),
        ...createTrendJobCapabilities(capabilityDeps),
        ...createTrendsCapabilities(capabilityDeps),
        ...createBlogAutoCapabilities(capabilityDeps),
        ...createChatModelCapabilities(capabilityDeps)
    ];

    const map = new Map();
    allCapabilities.forEach((capability) => {
        const id = capability.id || buildCapabilityId(capability.domain, capability.name);
        map.set(id, capability);
    });

    return {
        configState,
        list() {
            return Array.from(map.values());
        },
        get(id) {
            return map.get(String(id || '').trim()) || null;
        },
        has(id) {
            return map.has(String(id || '').trim());
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
