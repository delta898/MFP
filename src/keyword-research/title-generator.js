/**
 * AI-powered Korean SEO Title Generator
 * Based on KeywordMaster Title Rules & Content Grounding guidelines.
 */

const DEFAULT_TITLE_MODE = 'balanced';
const VALID_TITLE_MODES = new Set(['balanced', 'search', 'discovery']);

function normalizeTitleMode(mode) {
    const norm = String(mode || '').trim().toLowerCase();
    return VALID_TITLE_MODES.has(norm) ? norm : DEFAULT_TITLE_MODE;
}

function buildTitlePrompt(input = {}) {
    const keyword = String(input.keyword || '').trim();
    const subject = String(input.subject || '').trim();
    const content = String(input.content || '').trim();
    const titleMode = normalizeTitleMode(input.title_mode || input.titleMode);
    const count = Math.max(1, Math.min(5, Number(input.count) || 3));

    return [
        '당신은 네이버 블로그 SEO 및 콘텐츠 발견에 정통한 한국어 블로그 제목 전문가입니다.',
        '제공된 핵심 키워드와 주제(및 본문)를 바탕으로, 클릭률과 검색 품질을 모두 잡는 매력적이고 자연스러운 블로그 제목 후보를 생성하세요.',
        '',
        '## 기본 정보',
        `- 핵심 키워드: ${keyword}`,
        `- 다루는 주제: ${subject}`,
        `- 제목 생성 모드: ${titleMode} (${titleMode === 'search' ? '검색 의도 중심' : (titleMode === 'discovery' ? '발견/호기심 중심' : '검색과 주목도의 균형')})`,
        content ? `- 참고 본문 요약:\n${content.slice(0, 1500)}` : '- 본문: 미제공 (주제 중심으로 생성)',
        '',
        '## 제목 생성 규칙',
        '1. 각 제목은 한글 20~45자 내외(공백 포함)로 자연스럽게 작성하세요.',
        '2. 핵심 키워드를 각 제목마다 반드시 정확히 1회만 자연스럽게 포함하세요 (앞부분 배치를 권장하나 억지스러운 어순은 피함).',
        '3. 3가지 서로 다른 역할을 명확히 분리하여 작성하세요:',
        '   - [검색 의도형]: 독자가 검색할 때 찾는 행동, 답, 핵심 혜택을 명확히 제시.',
        '   - [상황 공감형]: 독자가 겪는 현실적인 고민, 문제 상황을 짚고 키워드로 연결.',
        '   - [구체 범위형]: 대상, 상황, 조건, 범위(초보자용, 단계별, 비교 등)를 좁혀 신뢰감 부여.',
        '4. 본문에 없는 근거 없는 수치(예: 7가지 꿀팁 등), 허위 보장, 과도한 특수문자, 낚시성 표현을 절대 사용하지 마세요.',
        '5. 각 제목마다 SEO 관점의 장점, 클릭 유도 요인, 그리고 제목이 감수하는 트레이드오프(본문에서 입증해야 할 점)를 명확히 작성하세요.',
        '',
        '## 출력 형식',
        '반드시 아래 JSON 포맷으로만 응답하세요 (설명이나 마크다운 코드블록 제외):',
        JSON.stringify({
            titles: [
                {
                    role: "검색 의도형",
                    title: "키워드가 포함된 자연스러운 제목 예시",
                    seo_reason: "키워드 전면 배치로 검색 의도 일치도 극대화",
                    click_reason: "명확한 해결책을 약속하여 검색 유입 클릭 유도",
                    tradeoff: "독창성보다는 전형적인 가이드 형식으로 보일 수 있음"
                },
                {
                    role: "상황 공감형",
                    title: "문제 상황을 짚고 키워드로 연결하는 제목 예시",
                    seo_reason: "문제 해결을 찾는 롱테일 검색 니즈 대응",
                    click_reason: "공감대 형성을 통한 피드/검색 클릭율 상승",
                    tradeoff: "직접적인 정답 검색자에게는 다소 길게 느껴질 수 있음"
                },
                {
                    role: "구체 범위형",
                    title: "대상과 조건을 좁힌 키워드 포함 제목 예시",
                    seo_reason: "타겟 키워드와 조건어의 결합으로 유효 타겟 유입",
                    click_reason: "자신에게 맞는 맞춤 정보라는 신뢰감 부여",
                    tradeoff: "타겟 범위 외의 일반 독자 유입은 제한될 수 있음"
                }
            ]
        }, null, 2)
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
        const keyword = String(input.keyword || '').trim();
        const subject = String(input.subject || '').trim();
        if (!keyword && !subject) {
            throw new Error('제목을 생성할 키워드 또는 주제가 필요합니다.');
        }

        const prompt = buildTitlePrompt(input);

        if (!Utils || (typeof Utils.callChatText !== 'function' && typeof Utils.callWritingText !== 'function')) {
            throw new Error('AI 모델 호출을 위한 Utils 의존성이 올바르지 않습니다.');
        }

        try {
            const callAi = typeof Utils.callChatText === 'function' ? Utils.callChatText.bind(Utils) : Utils.callWritingText.bind(Utils);
            const responseText = await callAi(prompt, 1, {
                usageLabel: '키워드 및 SEO 제목 생성',
                maxTokens: 1000,
                temperature: 0.7
            });

            const titles = parseTitleResponse(responseText);
            return {
                success: true,
                keyword,
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
    buildTitlePrompt,
    parseTitleResponse,
    createTitleGenerator
};
