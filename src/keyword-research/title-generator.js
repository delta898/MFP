/**
 * AI-powered Korean SEO Title Generator
 * Based on KeywordMaster Title Rules & Content Grounding guidelines.
 */

const DEFAULT_TITLE_MODE = 'balanced';
const VALID_TITLE_MODES = new Set(['balanced', 'search', 'discovery']);

function normalizeTitleKeywords(value) {
    const rawValues = Array.isArray(value) ? value : [value];
    const seen = new Set();
    const keywords = [];

    for (const rawValue of rawValues) {
        for (const token of String(rawValue || '').split(',')) {
            const keyword = token.replace(/\s+/g, ' ').trim();
            const key = keyword.toLocaleLowerCase('ko-KR').replace(/\s+/g, '');
            if (!keyword || seen.has(key)) continue;
            seen.add(key);
            keywords.push(keyword);
            if (keywords.length >= 3) return keywords;
        }
    }

    return keywords;
}

function normalizeTitleMode(mode) {
    const norm = String(mode || '').trim().toLowerCase();
    return VALID_TITLE_MODES.has(norm) ? norm : DEFAULT_TITLE_MODE;
}

function buildCuriosityGapRules(titleMode) {
    const modeRule = titleMode === 'search'
        ? '검색 중심: 핵심 키워드와 대상·범위를 알아볼 수 있게 유지하되, 핵심 이유·결과·비교 결론 중 하나는 본문에서 확인하도록 남기세요.'
        : titleMode === 'discovery'
            ? '발견 중심: 구체적인 상황·변화·공감 문제를 보여주되, 이유·결과·판단 중 하나는 다음 내용을 읽어야 의미가 완성되는 열린 고리로 남기세요.'
            : '균형 중심: 핵심 키워드와 대상 단서를 유지하면서 이유·결과·판단 중 하나는 본문에서 확인하도록 남기세요.';

    return [
        modeRule,
        '제목에서 답과 결론을 전부 소비하지 말고, 본문에서 확인할 구체적인 한 가지를 남겨 정직한 호기심 간극을 만드세요.',
        '문장을 문법적으로 어색하게 끊거나 무엇에 관한 글인지 전부 감추지 마세요.',
        '`이것`, `그 이유`, `충격`, `놀라운 결과` 같은 상투어는 구체적인 상황·대상 단서와 함께 쓸 때만 제한적으로 사용하세요.',
        '제목에서 만든 질문과 약속은 제공된 주제나 본문으로 실제 회수할 수 있어야 합니다.'
    ];
}

function buildTitlePrompt(input = {}) {
    const keywords = normalizeTitleKeywords(input.keywords || input.keyword);
    const keyword = keywords[0] || '';
    const supportingKeywords = keywords.slice(1);
    const subject = String(input.subject || '').trim();
    const content = String(input.content || '').trim();
    const titleMode = normalizeTitleMode(input.title_mode || input.titleMode);
    const count = Math.max(1, Math.min(3, Number(input.count) || 3));
    const curiosityGapRules = buildCuriosityGapRules(titleMode);

    return [
        '당신은 한국어 블로그 제목 편집자입니다.',
        `아래 정보로 서로 다른 제목 ${count}개만 간결하게 생성하세요.`,
        '',
        '## 기본 정보',
        `- 핵심 키워드: ${keyword}`,
        `- 함께 고려할 키워드: ${supportingKeywords.length > 0 ? supportingKeywords.join(', ') : '없음'}`,
        `- 다루는 주제: ${subject}`,
        `- 제목 생성 모드: ${titleMode} (${titleMode === 'search' ? '검색 의도 중심' : (titleMode === 'discovery' ? '발견/호기심 중심' : '검색과 주목도의 균형')})`,
        content ? `- 참고 본문 요약:\n${content.slice(0, 1500)}` : '- 본문: 미제공 (주제 중심으로 생성)',
        '',
        '## 제목 생성 규칙',
        '1. 각 제목은 한글 20~45자 내외(공백 포함)로 자연스럽게 작성하세요.',
        '2. 핵심 키워드를 각 제목마다 반드시 정확히 1회만 자연스럽게 포함하세요 (앞부분 배치를 권장하나 억지스러운 어순은 피함).',
        '3. 함께 고려할 키워드는 제목마다 억지로 모두 넣지 말고, 자연스러울 때만 최대 1개를 보조로 사용하세요.',
        '4. 3가지 서로 다른 역할을 명확히 분리하여 작성하세요:',
        '   - [검색 의도형]: 독자가 검색할 때 찾는 행동, 답, 핵심 혜택을 명확히 제시.',
        '   - [상황 공감형]: 독자가 겪는 현실적인 고민, 문제 상황을 짚고 키워드로 연결.',
        '   - [구체 범위형]: 대상, 상황, 조건, 범위(초보자용, 단계별, 비교 등)를 좁혀 신뢰감 부여.',
        '5. 본문에 없는 근거 없는 수치(예: 7가지 꿀팁 등), 허위 보장, 과도한 특수문자, 낚시성 표현을 절대 사용하지 마세요.',
        `6. ${curiosityGapRules[0]}`,
        `7. ${curiosityGapRules[1]}`,
        `8. ${curiosityGapRules[2]}`,
        `9. ${curiosityGapRules[3]}`,
        `10. ${curiosityGapRules[4]}`,
        '11. 각 설명 필드는 한 문장, 35자 이내로 작성하세요.',
        '',
        '## 출력 형식',
        '반드시 아래 JSON 포맷으로만 응답하세요 (설명이나 마크다운 코드블록 제외):',
        '{"titles":[{"role":"검색 의도형","title":"...","seo_reason":"...","click_reason":"...","tradeoff":"..."}]}',
        `titles 배열은 정확히 ${count}개이며 JSON 외의 텍스트는 출력하지 마세요.`
    ].join('\n');
}

function parseTitleResponse(value) {
    const raw = String(value || '').trim();
    if (!raw) return [];

    const withoutFence = raw
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

    try {
        const parsed = JSON.parse(withoutFence);
        const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.titles) ? parsed.titles : []);
        return list
            .filter((item) => item && typeof item === 'object' && item.title)
            .map((item) => ({
                role: String(item.role || '추천 제목').trim(),
                title: String(item.title || '').trim(),
                seo_reason: String(item.seo_reason || item.seo || '').trim(),
                click_reason: String(item.click_reason || item.click || '').trim(),
                tradeoff: String(item.tradeoff || '').trim()
            }));
    } catch (_) {
        // Fallback line parser if model returned numbered list
        const lines = withoutFence.split('\n').filter((l) => l.trim());
        const titles = [];
        for (const line of lines) {
            const m = line.match(/^\d+[\.\)]\s*(.+)$/);
            if (m) {
                titles.push({
                    role: '추천 제목',
                    title: m[1].replace(/["']/g, '').trim(),
                    seo_reason: '',
                    click_reason: '',
                    tradeoff: ''
                });
            }
        }
        return titles;
    }
}

function createTitleGenerator(options = {}) {
    const { Utils, Logger } = options;
    const logger = Logger || console;

    async function suggestTitles(input = {}) {
        const keywords = normalizeTitleKeywords(input.keywords || input.keyword);
        const keyword = keywords[0] || '';
        const subject = String(input.subject || '').trim();
        if (!keyword && !subject) {
            throw new Error('제목을 생성할 키워드 또는 주제가 필요합니다.');
        }

        const prompt = buildTitlePrompt(input);

        if (!Utils || (typeof Utils.callChatText !== 'function' && typeof Utils.callWritingText !== 'function')) {
            throw new Error('AI 모델 호출을 위한 Utils 의존성이 올바르지 않습니다.');
        }

        try {
            const requestedCount = Math.max(1, Math.min(3, Number(input.count) || 3));
            const callAi = typeof Utils.callChatText === 'function' ? Utils.callChatText.bind(Utils) : Utils.callWritingText.bind(Utils);
            const responseText = await callAi(prompt, 2, {
                usageLabel: '키워드 및 SEO 제목 생성',
                maxTokens: 1024,
                temperature: 0.4,
                reasoningEffort: 'minimal',
                responseMimeType: 'application/json',
                responseJsonSchema: {
                    type: 'object',
                    required: ['titles'],
                    properties: {
                        titles: {
                            type: 'array',
                            minItems: requestedCount,
                            maxItems: requestedCount,
                            items: {
                                type: 'object',
                                required: ['role', 'title', 'seo_reason', 'click_reason', 'tradeoff'],
                                properties: {
                                    role: { type: 'string' },
                                    title: { type: 'string' },
                                    seo_reason: { type: 'string' },
                                    click_reason: { type: 'string' },
                                    tradeoff: { type: 'string' }
                                }
                            }
                        }
                    }
                }
            });

            const titles = parseTitleResponse(responseText).slice(0, requestedCount);
            return {
                success: true,
                keyword,
                keywords,
                subject,
                title_mode: normalizeTitleMode(input.title_mode || input.titleMode),
                titles
            };
        } catch (err) {
            if (logger.error) logger.error(`❌ [TitleGenerator] 제목 생성 실패: ${err.message}`);
            throw new Error(`AI 제목 생성 실패: ${err.message}`);
        }
    }

    return {
        buildTitlePrompt,
        parseTitleResponse,
        suggestTitles
    };
}

module.exports = {
    DEFAULT_TITLE_MODE,
    normalizeTitleMode,
    normalizeTitleKeywords,
    buildCuriosityGapRules,
    buildTitlePrompt,
    parseTitleResponse,
    createTitleGenerator
};
