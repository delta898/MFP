const { createNaverSearchAdClient } = require('./naver-search-ad-client');
const { createNaverBlogSearchClient } = require('./naver-blog-search-client');
const { analyzeKeywords, parseKeywords } = require('./keyword-analyzer');
const { createTitleGenerator, normalizeTitleMode } = require('./title-generator');
const { createQuickPublishSuggestionService } = require('./quick-publish-suggestion');
const { createKeywordResearchSupabaseClient } = require('./supabase-client');

function createKeywordResearchService(options = {}) {
    const config = options.CONFIG || require('../config-loader');
    const utils = options.Utils || require('../utils');
    const logger = options.Logger || require('../logger');
    const transport = String(options.transport || config.KEYWORD_RESEARCH_TRANSPORT || 'supabase_function').trim();

    const searchAdClient = options.searchAdClient || createNaverSearchAdClient({
        apiKey: config.NAVER_SEARCHAD_API_KEY,
        secretKey: config.NAVER_SEARCHAD_SECRET_KEY,
        customerId: config.NAVER_SEARCHAD_CUSTOMER_ID,
        httpClient: options.httpClient,
        logger
    });

    const blogSearchClient = options.blogSearchClient || createNaverBlogSearchClient({
        apiHubClientId: config.NAVER_API_HUB_CLIENT_ID,
        apiHubClientSecret: config.NAVER_API_HUB_CLIENT_SECRET,
        openApiClientId: config.NAVER_CLIENT_ID || config.NAVER_SEARCH_CLIENT_ID,
        openApiClientSecret: config.NAVER_CLIENT_SECRET || config.NAVER_SEARCH_CLIENT_SECRET,
        httpClient: options.httpClient
    });

    const titleGenerator = options.titleGenerator || createTitleGenerator({
        Utils: utils,
        Logger: logger
    });
    let supabaseClient = options.supabaseClient || null;

    function getSupabaseClient() {
        if (supabaseClient) return supabaseClient;
        const License = options.License || require('../license');
        supabaseClient = createKeywordResearchSupabaseClient({
            config,
            License
        });
        return supabaseClient;
    }
    const quickPublishSuggestionService = options.quickPublishSuggestionService || createQuickPublishSuggestionService({
        keywordResearchService: {
            researchAndSuggestTitles
        }
    });

    function isConfigured() {
        return transport === 'supabase_function'
            || (searchAdClient.isConfigured() && blogSearchClient.isConfigured());
    }

    async function analyze(request = {}) {
        if (transport === 'supabase_function') return getSupabaseClient().analyze(request);
        return analyzeKeywords(request, {
            searchAdClient,
            blogSearchClient
        });
    }

    async function suggestTitles(input = {}) {
        return titleGenerator.suggestTitles(input);
    }

    /**
     * Complete pipeline: Analyze keywords -> Pick primary keyword -> Generate 3 grounded SEO titles
     */
    async function researchAndSuggestTitles(input = {}) {
        const keywords = parseKeywords(input.keywords || input.keyword);
        const subject = String(input.subject || '').trim();

        if (!subject && keywords.length === 0) {
            throw new Error('키워드 분석 및 제목 추천을 위해 최소 1개의 키워드 또는 주제가 필요합니다.');
        }

        const effectiveSubject = subject || keywords[0];
        const effectiveKeywords = keywords.length > 0 ? keywords : [effectiveSubject];

        // 1. Keyword analysis
        let analysisResult = null;
        let analysisError = null;
        let selectedKeyword = effectiveKeywords[0];

        try {
            if (isConfigured()) {
                analysisResult = await analyze({
                    keywords: effectiveKeywords,
                    subject: effectiveSubject,
                    related_assist: input.related_assist ?? true,
                    related_limit: input.related_limit,
                    candidate_limit: input.candidate_limit,
                    min_search_volume: input.min_search_volume ?? 300
                });
                selectedKeyword = analysisResult.selected_keyword || selectedKeyword;
            } else {
                analysisError = '검색량 지표는 아직 연결되지 않았습니다. 입력한 주제와 키워드를 기준으로 제목을 추천합니다.';
            }
        } catch (err) {
            analysisError = err.message;
            if (logger.warn) logger.warn(`⚠️ [KeywordResearch] 키워드 분석 건너뜀: ${err.message}`);
        }

        // 2. SEO Title generation
        const titleResult = await suggestTitles({
            keyword: selectedKeyword,
            subject: effectiveSubject,
            content: input.content || '',
            title_mode: normalizeTitleMode(input.title_mode || input.titleMode),
            count: input.count || 3
        });

        return {
            success: true,
            subject: effectiveSubject,
            selected_keyword: selectedKeyword,
            analysis: analysisResult,
            analysis_note: analysisError,
            titles: titleResult.titles,
            title_mode: titleResult.title_mode
        };
    }

    return {
        isConfigured,
        analyze,
        suggestTitles,
        researchAndSuggestTitles,
        suggestQuickPublish: quickPublishSuggestionService.suggest,
        searchAdClient,
        blogSearchClient,
        titleGenerator
    };
}

module.exports = {
    createNaverSearchAdClient,
    createNaverBlogSearchClient,
    analyzeKeywords,
    createTitleGenerator,
    createQuickPublishSuggestionService,
    createKeywordResearchSupabaseClient,
    createKeywordResearchService
};
