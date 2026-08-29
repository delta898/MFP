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
const { createServerGatewayTransport } = require('../knowledge/transports/server-gateway');
const { createKnowledgeServerGatewayClient } = require('../knowledge/server-gateway-client');
const { createSerpApiTrendsProvider } = require('../knowledge/providers/trends-serpapi');
const {
    DEFAULT_PROVIDER_ID: DEFAULT_NAVER_NEWS_PROVIDER_ID,
    createDefaultNaverNewsDefinition
} = require('../knowledge/providers/news-naver');
const {
    DEFAULT_PROVIDER_ID: DEFAULT_SERPAPI_CORPUS_PROVIDER_ID,
    createDefaultSerpApiCorpusDefinition
} = require('../knowledge/providers/news-serpapi-corpus');
const {
    DEFAULT_PROVIDER_ID: DEFAULT_NAVER_TRENDS_PROVIDER_ID,
    createDefaultNaverTrendsDefinition,
    createNaverTrendsProvider
} = require('../knowledge/providers/trends-naver');
const { createSuggestionEngine } = require('../suggestions/engine');
const { createMemoryBasedSuggestionProvider } = require('../suggestions/providers/memory-based');
const { createRecommendationMaterializer } = require('../recommendations/adapters/recommendation-materializer');
const { createContentIdeaEngine } = require('../content-ideas/engine');
const { createAiMemoryContentIdeaProvider } = require('../content-ideas/providers/ai-memory');
const { createContentIdeaCapabilities } = require('./content/ideas');
const { createRegisterTopicCapabilities } = require('./content/register-topic');
const { createPublishCapabilities } = require('./content/publish');
const { createKeywordResearchCapabilities } = require('./content/keyword-research');

function createCapabilityRegistry(deps = {}) {
    const configState = createConfigStateManager(deps);
    const trendsApiBaseUrl = String(deps.CONFIG?.TRENDS_API_PUBLIC_CONFIG?.url || '').trim();
    const configuredProviderDefinitions = Array.isArray(deps.CONFIG?.knowledge?.providers)
        ? deps.CONFIG.knowledge.providers
        : (Array.isArray(deps.CONFIG?.KNOWLEDGE_PROVIDERS) ? deps.CONFIG.KNOWLEDGE_PROVIDERS : []);
    const providerDefinitions = [...configuredProviderDefinitions];
    if (!providerDefinitions.some((item) => String(item?.id || '').trim() === DEFAULT_NAVER_TRENDS_PROVIDER_ID)) {
        providerDefinitions.push(createDefaultNaverTrendsDefinition({ baseUrl: trendsApiBaseUrl }));
    }
    if (!providerDefinitions.some((item) => String(item?.id || '').trim() === DEFAULT_NAVER_NEWS_PROVIDER_ID)) {
        providerDefinitions.push(createDefaultNaverNewsDefinition());
    }
    if (!providerDefinitions.some((item) => String(item?.id || '').trim() === DEFAULT_SERPAPI_CORPUS_PROVIDER_ID)) {
        providerDefinitions.push(createDefaultSerpApiCorpusDefinition());
    }
    const configuredRouting = deps.CONFIG?.knowledge?.routing && typeof deps.CONFIG.knowledge.routing === 'object'
        ? deps.CONFIG.knowledge.routing
        : (deps.CONFIG?.KNOWLEDGE_ROUTING && typeof deps.CONFIG.KNOWLEDGE_ROUTING === 'object' ? deps.CONFIG.KNOWLEDGE_ROUTING : {});
    const contentIdeaRoute = Array.isArray(configuredRouting.content_ideas) ? configuredRouting.content_ideas : [];
    const contentNewsRoute = Array.isArray(configuredRouting.recommendation_content_news)
        ? configuredRouting.recommendation_content_news
        : [];
    const serendipityCorpusRoute = Array.isArray(configuredRouting.recommendation_serendipity_corpus)
        ? configuredRouting.recommendation_serendipity_corpus
        : [];
    const routing = {
        ...configuredRouting,
        content_ideas: contentIdeaRoute.includes(DEFAULT_NAVER_TRENDS_PROVIDER_ID)
            ? contentIdeaRoute
            : [...contentIdeaRoute, DEFAULT_NAVER_TRENDS_PROVIDER_ID],
        recommendation_content_news: contentNewsRoute.includes(DEFAULT_NAVER_NEWS_PROVIDER_ID)
            ? contentNewsRoute
            : [...contentNewsRoute, DEFAULT_NAVER_NEWS_PROVIDER_ID],
        recommendation_serendipity_corpus: serendipityCorpusRoute.includes(DEFAULT_SERPAPI_CORPUS_PROVIDER_ID)
            ? serendipityCorpusRoute
            : [...serendipityCorpusRoute, DEFAULT_SERPAPI_CORPUS_PROVIDER_ID]
    };
    const serverGatewayClient = deps.serverGatewayClient || createKnowledgeServerGatewayClient({
        config: deps.CONFIG,
        License: deps.License
    });
    const knowledgeRegistry = deps.knowledgeRegistry || createKnowledgeRegistry({
        providerDefinitions,
        routing,
        logger: deps.Logger,
        transports: {
            builtin_api: createBuiltinApiTransport({
                httpClient: deps.axios,
                handlers: {
                    'trends:serpapi': createSerpApiTrendsProvider(),
                    'trends:naver_trend_posting': createNaverTrendsProvider({
                        axios: deps.axios,
                        License: deps.License,
                        runtimeBaseUrl: trendsApiBaseUrl
                    })
                }
            }),
            server_gateway: createServerGatewayTransport({ client: serverGatewayClient }),
            mcp_tool: createMcpToolTransport(),
            internal_query: createInternalQueryTransport()
        }
    });
    const recommendationMaterializer = deps.recommendationMaterializer || createRecommendationMaterializer({
        eventStore: deps.eventStore,
        Logger: deps.Logger
    });
    const suggestionEngine = deps.suggestionEngine || createSuggestionEngine({
        knowledgeRegistry,
        recommendationMaterializer,
        Logger: deps.Logger,
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
    const capabilityDeps = { ...deps, configState, knowledgeRegistry, suggestionEngine, contentIdeaEngine, recommendationMaterializer };

    const allCapabilities = [
        ...createAgentMetaCapabilities(capabilityDeps),
        ...createAgentPendingCapabilities(capabilityDeps),
        ...createAgentPreferenceCapabilities(capabilityDeps),
        ...createAgentSuggestionCapabilities(capabilityDeps),
        ...createRegisterTopicCapabilities(capabilityDeps),
        ...createPublishCapabilities(capabilityDeps),
        ...createContentIdeaCapabilities(capabilityDeps),
        ...createKeywordResearchCapabilities(capabilityDeps),
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
        knowledgeRegistry,
        knowledgeRouting: routing,
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
