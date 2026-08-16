const { createKeywordResearchService } = require('../../keyword-research');

function createKeywordResearchCapabilities(deps = {}) {
    const keywordResearchService = deps.keywordResearchService || createKeywordResearchService(deps);

    return [
        {
            id: 'content.keyword.analyze',
            type: 'content.query',
            domain: 'content.keyword',
            confirmPolicy: 'never',
            validate(params = {}) {
                const keywords = Array.isArray(params.keywords) ? params.keywords : (params.keyword ? [params.keyword] : []);
                const subject = String(params.subject || (keywords[0] || '')).trim();
                if (keywords.length === 0 && !subject) {
                    return {
                        ok: false,
                        errors: ['분석할 키워드 또는 주제가 필요합니다.'],
                        normalizedParams: null
                    };
                }
                return {
                    ok: true,
                    errors: [],
                    normalizedParams: {
                        keywords: keywords.length > 0 ? keywords : [subject],
                        subject,
                        related_assist: params.related_assist ?? true,
                        related_limit: params.related_limit ?? 8
                    }
                };
            },
            async preview(params = {}) {
                return {
                    summary: `키워드 '${params.keywords?.join(', ')}'의 검색량과 블로그 경쟁도를 분석합니다.`,
                    before: {},
                    after: { ...params }
                };
            },
            async execute(params = {}) {
                const result = await keywordResearchService.analyze(params);
                const inputInfo = (result.input_keywords || []).map((k) => {
                    const recent = k.weekly_new_blog_documents?.count;
                    const recentLabel = recent === null || recent === undefined
                        ? '측정 불가'
                        : `${recent}${k.weekly_new_blog_documents?.capped ? '+' : ''}건`;
                    return `• ${k.keyword}: 월간검색 ${k.monthly_search_volume?.total || 0}회 / 최근 7일 신규 문서 ${recentLabel} (경쟁강도: ${k.competition_strength?.level || '미확인'})`;
                }).join('\n');
                return {
                    success: true,
                    message: `📊 키워드 분석 결과:\n${inputInfo}`,
                    data: result,
                    sideEffects: []
                };
            }
        },
        {
            id: 'content.title.suggest',
            type: 'content.generate',
            domain: 'content.title',
            confirmPolicy: 'never',
            validate(params = {}) {
                const keyword = String(params.keyword || params.keywords?.[0] || '').trim();
                const subject = String(params.subject || keyword).trim();
                if (!keyword && !subject) {
                    return {
                        ok: false,
                        errors: ['제목을 생성할 키워드 또는 주제가 필요합니다.'],
                        normalizedParams: null
                    };
                }
                return {
                    ok: true,
                    errors: [],
                    normalizedParams: {
                        keyword,
                        subject,
                        content: String(params.content || '').trim(),
                        title_mode: params.title_mode || 'balanced',
                        count: Number(params.count) || 3
                    }
                };
            },
            async preview(params = {}) {
                return {
                    summary: `'${params.keyword || params.subject}' 키워드에 대한 SEO 최적화 제목 3종을 생성합니다.`,
                    before: {},
                    after: { ...params }
                };
            },
            async execute(params = {}) {
                const result = await keywordResearchService.suggestTitles(params);
                const titles = result.titles || [];
                const lines = titles.map((item, idx) => `${idx + 1}. [${item.role}] ${item.title}\n   - SEO: ${item.seo_reason}\n   - 클릭: ${item.click_reason}\n   - 트레이드오프: ${item.tradeoff}`);

                return {
                    success: true,
                    message: `✨ 추천 블로그 제목:\n\n${lines.join('\n\n')}`,
                    data: result,
                    sideEffects: []
                };
            }
        }
    ];
}

module.exports = {
    createKeywordResearchCapabilities
};
