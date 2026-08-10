const DEFAULT_WRITING_STRATEGY = 'search';

const WRITING_STRATEGIES = new Set(['search', 'discovery']);

const STRATEGY_DESCRIPTIONS = Object.freeze({
    search: '검색 의도와 핵심 정보를 명확하게 전달하는 글',
    discovery: '피드에서 발견한 독자의 관심과 읽기 흐름을 고려한 글'
});

function normalizeWritingStrategy(value, fallback = DEFAULT_WRITING_STRATEGY) {
    const normalized = String(value || '').trim().toLowerCase();
    if (WRITING_STRATEGIES.has(normalized)) return normalized;

    const normalizedFallback = String(fallback || '').trim().toLowerCase();
    return WRITING_STRATEGIES.has(normalizedFallback)
        ? normalizedFallback
        : DEFAULT_WRITING_STRATEGY;
}

function normalizeWritingStrategyOverride(value) {
    const normalized = String(value || '').trim().toLowerCase();
    return WRITING_STRATEGIES.has(normalized) ? normalized : '';
}

function resolveWritingStrategy(input = {}) {
    const override = normalizeWritingStrategyOverride(
        input.override ?? input.writing_strategy ?? input.writingStrategy
    );
    if (override) return override;

    return normalizeWritingStrategy(
        input.global ?? input.global_strategy ?? input.globalStrategy
    );
}

function getWritingStrategyDescription(value) {
    return STRATEGY_DESCRIPTIONS[normalizeWritingStrategy(value)];
}

function buildWritingStrategyPrompt(value) {
    const strategy = normalizeWritingStrategy(value);
    const rules = strategy === 'discovery'
        ? [
            '- 이 글은 피드에서 우연히 발견한 독자의 관심과 읽기 흐름을 고려합니다.',
            '- 제목과 도입부에는 글의 핵심과 연결된 구체적인 상황, 변화, 의외성 또는 공감할 문제를 자연스럽게 제시하세요.',
            '- 핵심을 억지로 숨기거나 과장하지 말고, 제목이 약속한 내용을 본문에서 충실하게 다루세요.',
            '- 제공되지 않은 경험, 수치, 최상급 표현이나 긴급성을 만들어내지 마세요.',
            '- 글의 핵심 주제와 자연스러운 검색어는 유지하되 키워드를 반복해서 채우지 마세요.'
        ]
        : [
            '- 이 글은 독자의 검색 의도와 질문에 명확하게 답하는 것을 우선합니다.',
            '- 핵심 주제와 키워드를 제목, 도입부, 관련 소제목에 자연스럽게 반영하세요.',
            '- 독자가 필요한 정보를 빠르게 찾을 수 있도록 구체적인 정보와 논리적인 구조를 사용하세요.',
            '- 같은 키워드를 부자연스럽게 반복하거나 검색 노출을 보장하는 표현은 사용하지 마세요.'
        ];

    return [
        '[글 작성 전략]',
        `- 전략: ${strategy === 'discovery' ? '발견 중심 (피드)' : '검색 중심'}`,
        `- 목적: ${getWritingStrategyDescription(strategy)}`,
        ...rules,
        '- 입력 데이터의 Instructions에 이번 글의 구성이나 목적을 바꾸라는 명시적 요청이 있으면 그 요청을 우선하세요.'
    ].join('\n');
}

module.exports = {
    DEFAULT_WRITING_STRATEGY,
    normalizeWritingStrategy,
    normalizeWritingStrategyOverride,
    resolveWritingStrategy,
    getWritingStrategyDescription,
    buildWritingStrategyPrompt
};

