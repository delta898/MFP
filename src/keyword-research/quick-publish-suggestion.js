const crypto = require('crypto');
const { parseKeywords } = require('./keyword-analyzer');
const { normalizeTitleMode } = require('./title-generator');

const QUICK_PUBLISH_SUGGESTION_SCHEMA_VERSION = 1;

function compact(value, maxLength = 240) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function stableId(prefix, value) {
    return `${prefix}_${crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 16)}`;
}

function normalizeQuickPublishInput(input = {}) {
    const subject = compact(input.subject, 180);
    const keywords = parseKeywords(input.keywords || input.keyword).slice(0, 3);
    const instruction = compact(input.instruction || input.content, 1200);
    const writingStrategy = compact(input.writingStrategy || input.writing_strategy || input.title_mode, 40).toLowerCase();
    const titleMode = normalizeTitleMode(
        writingStrategy === 'discovery'
            ? 'discovery'
            : (writingStrategy === 'search' ? 'search' : input.title_mode)
    );
    const seed = subject || keywords[0] || compact(input.query, 180);
    if (!seed) {
        throw new Error('스마트 추천을 위해 주제 또는 키워드가 필요합니다.');
    }
    return {
        subject: subject || seed,
        keywords: keywords.length > 0 ? keywords : [seed],
        instruction,
        title_mode: titleMode
    };
}

function summarizeKeywordMetrics(candidate = null) {
    if (!candidate || typeof candidate !== 'object') return null;
    return {
        keyword: compact(candidate.keyword, 120),
        monthly_search_volume: candidate.monthly_search_volume || null,
        blog_document_count: candidate.blog_document_count ?? null,
        competition_strength: candidate.competition_strength || null,
        opportunity: candidate.opportunity || null,
        recommendation_eligibility: candidate.recommendation_eligibility || null
    };
}

function findSelectedCandidate(analysis = null, selectedKeyword = '') {
    const target = compact(selectedKeyword, 120).replace(/\s+/g, '').toLowerCase();
    const candidates = [
        ...(Array.isArray(analysis?.input_keywords) ? analysis.input_keywords : []),
        ...(Array.isArray(analysis?.related_candidates) ? analysis.related_candidates : [])
    ];
    return candidates.find((candidate) => (
        compact(candidate?.keyword, 120).replace(/\s+/g, '').toLowerCase() === target
    )) || candidates[0] || null;
}

function normalizeTitleCandidates(titles = [], suggestion = {}) {
    return (Array.isArray(titles) ? titles : [])
        .filter((item) => compact(item?.title, 180))
        .slice(0, 3)
        .map((item, index) => {
            const title = compact(item.title, 180);
            return {
                id: stableId('title_candidate', `${suggestion.keyword}:${title}:${index}`),
                rank: index + 1,
                role: compact(item.role || '추천 제목', 40),
                title,
                seo_reason: compact(item.seo_reason || item.seo || '', 240),
                click_reason: compact(item.click_reason || item.click || '', 240),
                tradeoff: compact(item.tradeoff || '', 240),
                apply_payload: {
                    subject: title,
                    keywords: suggestion.keyword ? [suggestion.keyword] : suggestion.keywords,
                    recommendation: {
                        source: 'quick-publish-smart-suggestion',
                        suggestion_id: suggestion.id,
                        title_candidate_id: stableId('title_candidate', `${suggestion.keyword}:${title}:${index}`),
                        keyword: suggestion.keyword,
                        topic: suggestion.topic
                    }
                }
            };
        });
}

function buildQuickPublishSuggestionResponse(original = {}, pipelineResult = {}) {
    const selectedKeyword = compact(pipelineResult.selected_keyword || original.keywords?.[0] || original.subject, 120);
    const selectedCandidate = findSelectedCandidate(pipelineResult.analysis, selectedKeyword);
    const suggestion = {
        id: stableId('quick_suggestion', `${original.subject}:${selectedKeyword}:${pipelineResult.title_mode || original.title_mode}`),
        rank: 1,
        topic: compact(pipelineResult.subject || original.subject, 180),
        keyword: selectedKeyword,
        keywords: selectedKeyword ? [selectedKeyword] : original.keywords,
        reason: compact(
            pipelineResult.analysis?.selection_reason
            || pipelineResult.selection_reason
            || '입력한 주제와 키워드를 바탕으로 생성한 추천 조합입니다.',
            260
        ),
        analysis_note: compact(pipelineResult.analysis_note || '', 260),
        metrics: summarizeKeywordMetrics(selectedCandidate)
    };
    suggestion.title_candidates = normalizeTitleCandidates(pipelineResult.titles, suggestion);

    return {
        schema_version: QUICK_PUBLISH_SUGGESTION_SCHEMA_VERSION,
        mode: 'review',
        original: {
            subject: original.subject,
            keywords: original.keywords,
            instruction: original.instruction,
            title_mode: original.title_mode
        },
        suggestions: [suggestion],
        fallback: {
            label: '원래 입력으로 생성',
            apply_payload: {
                subject: original.subject,
                keywords: original.keywords
            }
        }
    };
}

function createQuickPublishSuggestionService(options = {}) {
    const keywordResearchService = options.keywordResearchService;
    if (!keywordResearchService || typeof keywordResearchService.researchAndSuggestTitles !== 'function') {
        throw new Error('keywordResearchService is required');
    }

    return {
        async suggest(input = {}) {
            const original = normalizeQuickPublishInput(input);
            const pipelineResult = await keywordResearchService.researchAndSuggestTitles({
                keywords: original.keywords,
                subject: original.subject,
                content: original.instruction,
                related_assist: input.related_assist ?? true,
                min_search_volume: input.min_search_volume ?? 300,
                title_mode: original.title_mode,
                count: input.count ?? 3
            });
            return buildQuickPublishSuggestionResponse(original, pipelineResult);
        }
    };
}

module.exports = {
    QUICK_PUBLISH_SUGGESTION_SCHEMA_VERSION,
    buildQuickPublishSuggestionResponse,
    createQuickPublishSuggestionService,
    normalizeQuickPublishInput
};
