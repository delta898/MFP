const { parseKeywords } = require('./input');
const {
    buildKeywordAnalysis,
    collectWeeklyDocumentKeywords,
    DEFAULT_RELATED_LIMIT,
    MAX_INPUT_KEYWORDS,
    normalizeKeyword,
    prepareKeywordPlan
} = require('./keyword-metrics-engine');
const { createTitleGenerator, normalizeTitleMode } = require('./title-generator');
const { createQuickPublishSuggestionService } = require('./quick-publish-suggestion');
const { createKeywordResearchSupabaseClient } = require('./supabase-client');

function createKeywordResearchService(options = {}) {
    const config = options.CONFIG || require('../config-loader');
    const utils = options.Utils || require('../utils');
    const logger = options.Logger || require('../logger');

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
        return Boolean(String(config.LICENSE_CHK_URL || '').trim() && String(config.LICENSE_CHK_KEY || '').trim());
    }

    async function analyze(request = {}) {
        const keywords = parseKeywords(request.keywords || request.keyword).slice(0, MAX_INPUT_KEYWORDS);
        const subject = String(request.subject || keywords[0] || '').trim();
        if (!subject || keywords.length === 0) {
            throw new Error('키워드 분석을 위해 주제와 키워드가 필요합니다.');
        }

        const relatedAssist = request.related_assist !== false;
        const relatedLimit = request.related_limit ?? DEFAULT_RELATED_LIMIT;
        const gateway = getSupabaseClient();
        const searchAd = await gateway.fetchSearchAdCandidates({ keywords });
        const rowsByKeyword = new Map(searchAd.map((item) => [
            normalizeKeyword(item?.keyword),
            Array.isArray(item?.rows) ? item.rows : []
        ]));
        const plan = prepareKeywordPlan({
            keywords,
            subject,
            rowsByKeyword,
            relatedAssist,
            relatedLimit
        });
        const weeklyKeywords = collectWeeklyDocumentKeywords(plan);
        const weeklyPayload = weeklyKeywords.length > 0
            ? await gateway.fetchWeeklyDocuments({ keywords: weeklyKeywords })
            : [];
        const weeklyDocuments = new Map(weeklyPayload.map((item) => [
            normalizeKeyword(item?.keyword),
            item?.result || null
        ]));
        return buildKeywordAnalysis({ plan, weeklyDocuments });
    }

    async function suggestTitles(input = {}) {
        return titleGenerator.suggestTitles(input);
    }

    // Quick-publish callers use their own input keyword. Keyword exploration is a separate,
    // user-visible action and must not silently replace that keyword.
    async function researchAndSuggestTitles(input = {}) {
        const keywords = parseKeywords(input.keywords || input.keyword);
        const subject = String(input.subject || '').trim();

        if (!subject && keywords.length === 0) {
            throw new Error('키워드 분석 및 제목 추천을 위해 최소 1개의 키워드 또는 주제가 필요합니다.');
        }

        const effectiveSubject = subject || keywords[0];
        const effectiveKeywords = keywords.length > 0 ? keywords : [effectiveSubject];

        const selectedKeyword = effectiveKeywords[0];
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
            input_keyword: selectedKeyword,
            analysis: null,
            analysis_note: null,
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
        titleGenerator
    };
}

module.exports = {
    createTitleGenerator,
    createQuickPublishSuggestionService,
    createKeywordResearchSupabaseClient,
    prepareKeywordPlan,
    buildKeywordAnalysis,
    createKeywordResearchService
};
