const { createKnowledgeRegistry } = require('../services/knowledge/registry');
const { createBuiltinApiTransport } = require('../adapters/knowledge/transports/builtin-api');
const { createMcpToolTransport } = require('../adapters/knowledge/transports/mcp-tool');
const { createInternalQueryTransport } = require('../adapters/knowledge/transports/internal-query');
const { createServerGatewayTransport } = require('../adapters/knowledge/transports/server-gateway');
const { createKnowledgeServerGatewayClient } = require('../adapters/knowledge/server-gateway-client');
const { createSerpApiTrendsProvider } = require('../adapters/knowledge/providers/trends-serpapi');
const {
    DEFAULT_PROVIDER_ID: DEFAULT_NAVER_NEWS_PROVIDER_ID,
    createDefaultNaverNewsDefinition
} = require('../adapters/knowledge/providers/news-naver');
const {
    DEFAULT_PROVIDER_ID: DEFAULT_SERPAPI_CORPUS_PROVIDER_ID,
    createDefaultSerpApiCorpusDefinition
} = require('../adapters/knowledge/providers/news-serpapi-corpus');
const {
    DEFAULT_PROVIDER_ID: DEFAULT_NAVER_TRENDS_PROVIDER_ID,
    createDefaultNaverTrendsDefinition,
    createNaverTrendsProvider
} = require('../adapters/knowledge/providers/trends-naver');

function createKnowledgeRuntime(deps = {}) {
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
    return { knowledgeRegistry, knowledgeRouting: routing, serverGatewayClient };
}

module.exports = { createKnowledgeRuntime };
