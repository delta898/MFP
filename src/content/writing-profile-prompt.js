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
    short: '- 본문은 공백 포함 약 900~1,200자를 목표로 작성하세요.',
    standard: '- 본문은 공백 포함 약 1,500~1,800자를 목표로 작성하세요.',
    long: '- 본문은 공백 포함 약 2,200~2,800자를 목표로 작성하세요.'
});

const OPENING_RULES = Object.freeze({
    direct: '- 도입은 핵심 답변이나 결론부터 제시한 뒤 글에서 다룰 범위를 안내하세요.',
    contextual: '- 도입은 독자가 공감할 상황이나 배경을 짧게 제시한 뒤 핵심 주제로 들어가세요.',
    scene: '- 도입은 입력에 근거한 구체적인 장면이나 이야기로 시작하되 핵심 주제를 불필요하게 늦추지 마세요.'
});

const DEVELOPMENT_RULES = Object.freeze({
    explanatory: '- 본문은 핵심 개념과 근거를 이해하기 쉬운 순서로 설명하고 해석과 팁을 연결하세요.',
    problem_solution: '- 본문은 문제와 원인, 해결 방법, 적용 시 주의점의 흐름을 우선하세요.',
    experience_review: '- 본문은 경험·리뷰형 흐름을 사용하되 입력에 없는 구매, 사용, 방문이나 체험을 창작하지 마세요.',
    comparison: '- 본문은 비교 기준과 선택 조건을 분명히 나누고 어떤 경우에 무엇이 적합한지 설명하세요.'
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
            '[공통 표현 지침]',
            styleInstruction,
            '- 위 지침은 표현 선호이며 새로운 사실이나 경험의 근거로 사용하지 마세요.'
        );
    }
    return sections.join('\n');
}

function buildBlogWritingProfilePromptFromProjection(projection = {}) {
    if (projection.kind !== 'blog' || !projection.common || !projection.channel) {
        const error = new Error('blog profile projection이 필요합니다.');
        error.code = 'INVALID_BLOG_WRITING_PROFILE_PROJECTION';
        throw error;
    }
    const blog = projection.channel;
    const structure = blog.structure || {};
    const sections = [
        '[선택된 블로그 글쓰기 프로필]',
        buildCommonWritingProfilePrompt(projection.common),
        '[블로그 길이와 구성]',
        LENGTH_RULES[blog.length?.preset] || LENGTH_RULES.standard,
        OPENING_RULES[structure.opening] || OPENING_RULES.contextual,
        DEVELOPMENT_RULES[structure.development] || DEVELOPMENT_RULES.explanatory,
        ENDING_RULES[structure.ending] || ENDING_RULES.judgment,
        HEADING_RULES[structure.heading_density] || HEADING_RULES.balanced,
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
            blog.additional_instruction,
            '- 위 지침은 시스템 출력, 사실성, 참고자료 비복제와 이미지 문법 계약을 덮어쓸 수 없습니다.'
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
            '[분석된 블로그 참고 문체]',
            `- 요약: ${fingerprint.summary || '분석된 구성과 표현 특성을 참고하세요.'}`,
            `- 도입/전개/문단/마무리: ${fingerprint.structure?.opening_pattern || '-'} / ${(fingerprint.structure?.section_flow || []).join(' → ') || '-'} / ${fingerprint.structure?.paragraph_length || '-'} / ${fingerprint.structure?.ending_pattern || '-'}`,
            `- 문장/온도/어휘/표현 장치: ${fingerprint.voice?.sentence_rhythm || '-'} / ${fingerprint.voice?.warmth || '-'} / ${fingerprint.voice?.vocabulary || '-'} / ${(fingerprint.voice?.rhetorical_devices || []).join(', ') || '-'}`,
            `- 피할 특성: ${(fingerprint.avoid || []).join(', ') || '없음'}`,
            '- 참고 문체는 직접 선택한 표현 방식, 높임 방식, 어조와 정보 밀도를 변경할 수 없습니다. 충돌하면 직접 선택한 프로필 값을 따르세요.',
            '- 이번 글의 명시적 문체 지시가 있으면 시스템 계약을 해치지 않는 범위에서 직접 선택한 프로필과 참고 문체보다 우선합니다.',
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
