const DEFAULT_WRITING_STYLE = Object.freeze({
    writing_mode: 'conversational',
    speech_level: 'polite'
});

const WRITING_MODES = new Set(['conversational', 'written']);
const SPEECH_LEVELS = new Set(['polite', 'plain']);

const STYLE_DESCRIPTIONS = Object.freeze({
    'conversational:polite': '친근하고 자연스러운 후기형 문체',
    'conversational:plain': '편안하고 자유로운 일기·SNS형 문체',
    'written:polite': '정돈되고 신뢰감 있는 정보·전문형 문체',
    'written:plain': '간결하고 객관적인 설명문·칼럼형 문체'
});

function normalizeWritingStyle(input = {}) {
    const writingMode = String(input.writing_mode || input.writingMode || '').trim().toLowerCase();
    const speechLevel = String(input.speech_level || input.speechLevel || '').trim().toLowerCase();

    return {
        writing_mode: WRITING_MODES.has(writingMode)
            ? writingMode
            : DEFAULT_WRITING_STYLE.writing_mode,
        speech_level: SPEECH_LEVELS.has(speechLevel)
            ? speechLevel
            : DEFAULT_WRITING_STYLE.speech_level
    };
}

function getWritingStyleDescription(input = {}) {
    const style = normalizeWritingStyle(input);
    return STYLE_DESCRIPTIONS[`${style.writing_mode}:${style.speech_level}`];
}

function buildWritingStylePrompt(input = {}) {
    const style = normalizeWritingStyle(input);
    const modeRules = style.writing_mode === 'written'
        ? [
            '- 표현 방식은 문어체입니다. 문장을 정돈된 설명문처럼 구성하고 구어적 추임새를 피하세요.',
            '- 정보와 논리를 명확히 연결하되 지나치게 딱딱한 보고서 문체는 피하세요.'
        ]
        : [
            '- 표현 방식은 구어체입니다. 독자에게 자연스럽게 이야기하듯 부드럽게 작성하세요.',
            '- 지나치게 격식적이거나 보고서 같은 표현은 피하세요.'
        ];
    let speechRules;
    if (style.speech_level === 'plain' && style.writing_mode === 'written') {
        speechRules = [
            '- 높임 방식은 평어(반말)입니다. 문장 종결은 ~다, ~했다 형태를 중심으로 일관되게 작성하세요.',
            '- 존댓말 종결인 ~요, ~습니다, ~세요와 구어적 종결인 ~해, ~했어를 사용하지 마세요.'
        ];
    } else if (style.speech_level === 'plain') {
        speechRules = [
            '- 높임 방식은 평어(반말)입니다. 문장 종결은 ~해, ~했어, ~지 등을 자연스럽게 사용하세요.',
            '- 존댓말 종결인 ~요, ~습니다, ~세요를 사용하지 마세요.'
        ];
    } else if (style.writing_mode === 'written') {
        speechRules = [
            '- 높임 방식은 존댓말입니다. 문장 종결은 ~습니다, ~합니다 형태를 중심으로 일관되게 작성하세요.',
            '- 반말 종결인 ~해, ~했어, ~다를 독자에게 말하는 문장에 사용하지 마세요.'
        ];
    } else {
        speechRules = [
            '- 높임 방식은 존댓말입니다. 문장 종결은 ~요 형태를 중심으로 자연스럽게 작성하고 필요한 곳에 ~습니다를 사용하세요.',
            '- 반말 종결인 ~해, ~했어, ~다를 독자에게 말하는 문장에 사용하지 마세요.'
        ];
    }

    return [
        '[사용자 문체 설정]',
        `- 예상 문체: ${getWritingStyleDescription(style)}`,
        ...modeRules,
        ...speechRules,
        '- 입력 데이터의 Instructions에 이번 글의 문체를 바꾸라는 명시적 요청이 있으면 그 요청을 우선하세요.'
    ].join('\n');
}

function buildShoppingWritingStylePrompt(input = {}) {
    const style = normalizeWritingStyle(input);
    const rules = {
        'conversational:polite': [
            '- 독자에게 상품 선택 기준을 설명하듯 친근하고 자연스러운 구어체 존댓말로 작성하세요.',
            '- 문장 종결은 ~요를 중심으로 하되 필요한 곳에 ~습니다를 섞어 반복감을 줄이세요.'
        ],
        'conversational:plain': [
            '- 독자에게 편안하게 이야기하듯 자연스러운 구어체 평어로 작성하세요.',
            '- 문장 종결은 ~해, ~했어, ~지 등을 사용하고 존댓말 종결은 사용하지 마세요.'
        ],
        'written:polite': [
            '- 상품의 조건과 판단 근거를 정돈된 문어체 존댓말로 설명하세요.',
            '- 문장 종결은 ~합니다, ~입니다를 중심으로 일관되게 작성하세요.'
        ],
        'written:plain': [
            '- 상품의 조건과 판단 근거를 간결하고 객관적인 문어체 평어로 설명하세요.',
            '- 문장 종결은 ~다, ~했다 형태를 중심으로 일관되게 작성하세요.'
        ]
    };

    return [
        '[공통 콘텐츠 문체 설정]',
        `- ${getWritingStyleDescription(style)}`,
        ...rules[`${style.writing_mode}:${style.speech_level}`],
        '- 문체 설정과 관계없이 작성자가 상품을 직접 사용한 것처럼 경험을 꾸미지 마세요.'
    ].join('\n');
}

module.exports = {
    DEFAULT_WRITING_STYLE,
    normalizeWritingStyle,
    getWritingStyleDescription,
    buildWritingStylePrompt,
    buildShoppingWritingStylePrompt
};
