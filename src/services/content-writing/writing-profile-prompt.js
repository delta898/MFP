const { buildWritingStylePrompt } = require('./writing-style');
const { projectWritingProfile } = require('./writing-profile-projection');

const TONE_RULES = Object.freeze({
    calm: '- 어조는 차분하게 유지하고 감정적 과장이나 호들갑스러운 표현을 피하세요.',
    balanced: '- 어조는 친근함과 신뢰감이 균형을 이루게 하고 과장된 감정이나 지나친 건조함을 피하세요.',
    vivid: '- 어조는 생동감 있게 구성하되 입력에 없는 감각, 경험이나 사실을 만들어내지 마세요.'
});

const DENSITY_RULES = Object.freeze({
    light: '- 정보 밀도는 가볍게 유지하고 핵심 설명과 꼭 필요한 예시만 남기세요.',
    balanced: '- 정보 밀도는 보통으로 유지하고 사실, 해석과 실용적인 팁을 균형 있게 배치하세요.',
    dense: '- 정보 밀도는 촘촘하게 유지하고 근거, 조건, 비교와 주의사항을 충분히 설명하세요.'
});

const LENGTH_RULES = Object.freeze({
    short: Object.freeze({
        length: '- 독자가 실제로 읽는 순수 본문은 공백 포함 약 900~1,200자를 목표로 작성하세요.',
        headings: '- 도입과 마무리를 제외한 H2 소제목은 3개를 사용하세요.'
    }),
    standard: Object.freeze({
        length: '- 독자가 실제로 읽는 순수 본문은 공백 포함 약 1,500~1,800자를 목표로 작성하세요.',
        headings: '- 도입과 마무리를 제외한 H2 소제목은 4~5개를 사용하세요.'
    }),
    long: Object.freeze({
        length: '- 독자가 실제로 읽는 순수 본문은 공백 포함 약 2,200~2,800자를 목표로 작성하세요.',
        headings: '- 도입과 마무리를 제외한 H2 소제목은 5~6개를 사용하세요.'
    })
});

const BODY_STRUCTURE_RULES = Object.freeze([
    '- 도입은 H2 없이 약 150~250자로 작성하고, 마무리도 H2 개수에서 제외하세요.',
    '- 소제목 숫자를 맞추기 위한 한두 문장짜리 빈약한 섹션은 만들지 마세요.',
    '- 각 H2 섹션에는 핵심 설명과 함께 해석 또는 독자에게 유용한 실용 정보를 충분히 포함하세요.'
]);

const AUTO_COMPOSITION_RULES = Object.freeze([
    '[이번 글 구성 자동 선택]',
    '- 이번 글의 주제, 제목, 키워드, 추가 지시와 사실 참고 컨텍스트를 함께 보고 본문 길이, 도입, 전개, 마무리 방식을 각각 하나씩 내부적으로 선택한 뒤 그 구성을 적용해 작성하세요.',
    '- 길이: 짧게(공백 포함 약 900~1,200자, H2 3개)는 한 가지 핵심을 간결히 다룰 때, 보통(약 1,500~1,800자, H2 4~5개)는 일반적인 정보·가이드에, 길게(약 2,200~2,800자, H2 5~6개)는 여러 조건·관점·세부 근거를 충분히 다룰 때 선택하세요.',
    '- 도입: 핵심부터는 구체적인 질문이나 답이 분명할 때, 공감 상황부터는 독자의 문제·상황을 연결할 때, 장면·이야기부터는 입력 자료에 근거한 실제 장면이 있을 때 선택하세요. 입력에 없는 장면이나 경험은 만들지 마세요.',
    '- 전개: 설명형은 개념·정보 전달, 문제 해결형은 문제와 해결 방법, 경험·리뷰형은 입력에 실제 경험이 있을 때, 비교·선택형은 둘 이상의 선택지를 다룰 때, 소개·추천형은 상품·서비스·장소 하나를 소개할 때 선택하세요.',
    '- 경험·리뷰형은 입력에 없는 구매, 사용, 방문이나 체험을 창작하지 마세요. 소개·추천형도 입력에 없는 가격·효과·개인 경험, 슬로건이나 구매 압박 문구를 만들지 마세요.',
    '- 마무리: 핵심 요약은 정보 정리, 개인적 판단은 입력 근거가 있는 선택 평가, 다음 행동 제안은 독자가 실행할 수 있는 단계가 있을 때 선택하세요. 입력에 없는 개인 경험이나 근거 없는 판단을 만들지 마세요.',
    '- 참고사항에 특정 구성이나 길이가 명시되면 그 요청을 우선 반영하고, 나머지 항목은 자동으로 선택하세요.',
    '- 자동 선택 과정과 선택한 설정값은 출력하지 말고, 요구된 최종 원고 형식만 반환하세요.'
]);

const OPENING_RULES = Object.freeze({
    direct: '- 도입은 핵심 답변이나 결론부터 제시한 뒤 글에서 다룰 범위를 안내하세요.',
    contextual: '- 도입은 독자가 공감할 상황이나 배경을 짧게 제시한 뒤 핵심 주제로 들어가세요.',
    scene: '- 도입은 입력에 근거한 구체적인 장면이나 이야기로 시작하되 핵심 주제를 불필요하게 늦추지 마세요.'
});

const DEVELOPMENT_RULES = Object.freeze({
    explanatory: '- 본문은 핵심 개념과 근거를 이해하기 쉬운 순서로 설명하고 해석과 팁을 연결하세요.',
    problem_solution: '- 본문은 문제와 원인, 해결 방법, 적용 시 주의점의 흐름을 우선하세요.',
    experience_review: '- 본문은 경험·리뷰형 흐름을 사용하되 입력에 없는 구매, 사용, 방문이나 체험을 창작하지 마세요.',
    comparison: '- 본문은 비교 기준과 선택 조건을 분명히 나누고 어떤 경우에 무엇이 적합한지 설명하세요.',
    introduction: '- 본문은 상품·서비스·장소 하나가 무엇인지, 누구에게 왜 맞는지, 선택 전에 확인할 점이 무엇인지 설명하고 입력에 없는 가격·효과·방문·개인 경험, 슬로건이나 구매 압박 문구를 만들지 마세요.'
});

const ENDING_RULES = Object.freeze({
    summary: '- 마무리는 본문의 핵심을 짧게 요약하고 새로운 주장을 추가하지 마세요.',
    judgment: '- 마무리는 근거를 바탕으로 한 개인적 판단을 덧붙이되 경험을 꾸미지 마세요.',
    next_step: '- 마무리는 독자가 취할 수 있는 현실적인 다음 행동을 자연스럽게 제안하세요.'
});

const HEADING_RULES = Object.freeze({
    sparse: '- 소제목은 길이 프리셋의 권장 범위 중 적은 쪽을 사용하고 각 섹션을 충분히 전개하세요.',
    balanced: '- 소제목 수와 섹션 분량을 균형 있게 배치하세요.',
    dense: '- 소제목은 길이 프리셋의 권장 범위 중 많은 쪽을 사용하되 잘게 쪼갠 빈약한 섹션은 피하세요.'
});

const NARRATOR_RULES = Object.freeze({
    minimal: '- 1인칭 화자 노출은 최소화하고 정보와 판단 기준 중심으로 작성하세요.',
    occasional: '- 1인칭 관점은 입력에 근거가 있고 글의 이해에 도움이 될 때만 제한적으로 사용하세요.',
    present: '- 글쓴이의 관점을 적극적으로 드러내되 제공된 배경과 실제 입력에 없는 경험은 만들지 마세요.'
});

function buildCommonWritingProfilePrompt(common = {}) {
    const voice = common.voice || {};
    const sections = [
        buildWritingStylePrompt({
            writing_mode: voice.writing_mode,
            speech_level: voice.speech_level
        }),
        '[공통 글쓰기 성향]',
        TONE_RULES[voice.tone] || TONE_RULES.balanced,
        DENSITY_RULES[voice.information_density] || DENSITY_RULES.balanced
    ];

    const styleInstruction = String(common.style_instruction || '').trim();
    if (styleInstruction) {
        sections.push(
            '[추가 작성 원칙]',
            styleInstruction,
            '- 위 지침은 표현 선호이며 새로운 사실이나 경험의 근거로 사용하지 마세요.'
        );
    }
    return sections.join('\n');
}

function buildBlogWritingProfilePromptFromProjection(projection = {}, options = {}) {
    if (projection.kind !== 'blog' || !projection.common || !projection.channel) {
        const error = new Error('blog profile projection이 필요합니다.');
        error.code = 'INVALID_BLOG_WRITING_PROFILE_PROJECTION';
        throw error;
    }
    const blog = projection.channel;
    const structure = blog.structure || {};
    const autoComposition = options.autoComposition === true;
    const lengthRule = LENGTH_RULES[blog.length?.preset] || LENGTH_RULES.standard;
    const sections = [
        '[선택된 블로그 글쓰기 프로필]',
        buildCommonWritingProfilePrompt(projection.common),
        '[블로그 길이와 구성]',
        ...(autoComposition
            ? [...BODY_STRUCTURE_RULES, ...AUTO_COMPOSITION_RULES]
            : [
                lengthRule.length,
                lengthRule.headings,
                ...BODY_STRUCTURE_RULES,
                OPENING_RULES[structure.opening] || OPENING_RULES.contextual,
                DEVELOPMENT_RULES[structure.development] || DEVELOPMENT_RULES.explanatory,
                ENDING_RULES[structure.ending] || ENDING_RULES.judgment,
                HEADING_RULES[structure.heading_density] || HEADING_RULES.balanced
            ]),
        NARRATOR_RULES[blog.narrator_presence] || NARRATOR_RULES.occasional
    ];

    if (blog.author_context) {
        sections.push(
            '[글쓴이 배경]',
            blog.author_context,
            '- 현재 주제와 관련 있을 때만 사용하고 입력에 없는 경험이나 신상 정보를 확장하지 마세요.'
        );
    }

    if (blog.additional_instruction) {
        sections.push(
            '[블로그 추가 작성 지침]',
            blog.additional_instruction
        );
    }

    const styleReferences = blog.style_references || {};
    const sourceStatuses = [
        styleReferences.sample_text?.status,
        ...(styleReferences.blog_urls || []).map((item) => item.status)
    ].filter((status) => status && status !== 'empty');
    const fingerprint = sourceStatuses.some((status) => status === 'pending' || status === 'stale')
        ? null
        : styleReferences.fingerprint;
    if (fingerprint) {
        sections.push(
            '[분석된 참고 글의 세부 특징]',
            `- 요약: ${fingerprint.summary || '분석된 구성과 표현 특성을 참고하세요.'}`,
            `- 피할 특성: ${(fingerprint.avoid || []).join(', ') || '없음'}`,
            autoComposition
                ? '- 참고 글의 요약과 피할 특성만 문체 참고로 사용하고, 길이와 구성을 복사하지 말고 이번 글 구성 자동 선택 지침을 따르세요.'
                : '- 최종 문체·길이·구성 값을 바꾸지 마세요.',
            '- 이는 원문 복제나 작성자 persona 추정이 아닌 분석된 문체 특성이며 사실 또는 경험의 근거로 사용하지 마세요.'
        );
    }

    return sections.join('\n');
}

function buildBlogWritingProfilePrompt(input = {}) {
    const projection = projectWritingProfile(input, { kind: 'blog' });
    return buildBlogWritingProfilePromptFromProjection(projection);
}

module.exports = {
    buildCommonWritingProfilePrompt,
    buildBlogWritingProfilePromptFromProjection,
    buildBlogWritingProfilePrompt
};
