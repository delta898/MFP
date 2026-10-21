function createKeywordResearchCapabilities(deps = {}) {
    const keywordResearchApplication = deps.keywordResearchApplication;
    if (!keywordResearchApplication) return [];

    return [
        {
            id: 'content.keyword.analyze',
            effect: 'read_only',
            type: 'content.query',
            domain: 'content.keyword',
            confirmPolicy: 'never',
            agentExposure: {
                category: '키워드와 제목',
                title: '키워드 분석',
                description: '검색량, 경쟁도, 최근 신규 문서 지표를 조회합니다.',
                useWhen: '사용자가 구체적인 키워드나 주제의 검색 수요·경쟁 지표를 묻습니다.',
                avoidWhen: '사용자가 글감 아이디어, 제목 후보 또는 실제 발행을 요청합니다.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        keyword: { type: 'string', minLength: 1, maxLength: 100 },
                        keywords: { type: 'array', minItems: 1, maxItems: 50, items: { type: 'string', minLength: 1, maxLength: 100 } },
                        subject: { type: 'string', maxLength: 300 },
                        related_assist: { type: 'boolean' },
                        related_limit: { type: 'integer', minimum: 1, maximum: 50 }
                    },
                    anyOf: [{ required: ['keyword'] }, { required: ['keywords'] }, { required: ['subject'] }],
                    additionalProperties: false
                },
                outputDescription: '월간 검색량, 최근 신규 문서, 경쟁 지표를 키워드별로 반환합니다.',
                availabilityNote: '라이선스와 키워드 분석 서버 연결이 필요합니다.',
                examples: ['오사카 여행 키워드 분석해줘']
            },
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
                const result = await keywordResearchApplication.analyze(params);
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
            effect: 'generated_output',
            type: 'content.generate',
            domain: 'content.title',
            confirmPolicy: 'never',
            agentExposure: {
                category: '키워드와 제목',
                title: '블로그 제목 추천',
                description: '키워드나 주제에 맞는 블로그 제목 후보를 만듭니다.',
                useWhen: '사용자가 키워드나 주제에 맞는 블로그 제목 후보를 요청합니다.',
                avoidWhen: '사용자가 검색량·경쟁 지표나 본문 전체 작성을 요청합니다.',
                inputSchema: {
                    type: 'object',
                    properties: {
                        keyword: { type: 'string', maxLength: 100 },
                        keywords: { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 100 } },
                        subject: { type: 'string', maxLength: 300 },
                        content: { type: 'string', maxLength: 10000 },
                        title_mode: { enum: ['balanced', 'search', 'discovery'] },
                        count: { type: 'integer', minimum: 1, maximum: 3 }
                    },
                    anyOf: [{ required: ['keyword'] }, { required: ['keywords'] }, { required: ['subject'] }],
                    additionalProperties: false
                },
                outputDescription: '제목 후보와 검색 최적화·독자 관심도 관련 설명을 반환합니다.',
                availabilityNote: 'AI 텍스트 생성 연결이 필요합니다.',
                examples: ['오사카 여행 키워드로 제목 3개 추천해줘']
            },
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
                const result = await keywordResearchApplication.suggestTitles(params);
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
