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

function buildShoppingWritingStrategyPrompt(value) {
    const strategy = normalizeWritingStrategy(value);
    const rules = strategy === 'discovery'
        ? [
            '- 발견 중심(피드) 전략입니다. 검색어 나열보다 독자가 피드에서 멈춰 읽을 만한 사용 상황, 고민 또는 의외의 판단 포인트로 제목과 도입을 여세요.',
            '- 제목은 상품 식별 키워드를 유지하되 호기심과 효용을 자연스럽게 결합하고, 본문은 장면 → 근거 → 선택 기준의 읽기 흐름을 만드세요.',
            '- 근거 없는 어그로, 과장, 긴급성, 열린 결말형 제목은 사용하지 마세요.'
        ]
        : [
            '- 검색 중심 전략입니다. 핵심 상품명과 모델·규격 등 식별 정보를 제목 앞부분에 자연스럽게 배치하세요.',
            '- 검색 사용자가 궁금해할 가격·혜택·배송·용도·리뷰 반응 중 근거가 충분한 항목을 빠르게 확인할 수 있게 구성하세요.',
            '- 제목과 소제목은 검색 의도와 직접 연결되는 명확한 정보형 표현을 우선하세요.'
        ];

    return [
        '[공통 콘텐츠 글 작성 전략]',
        `- ${getWritingStrategyDescription(strategy)}`,
        ...rules
    ].join('\n');
}

module.exports = {
    DEFAULT_WRITING_STRATEGY,
    normalizeWritingStrategy,
    normalizeWritingStrategyOverride,
    resolveWritingStrategy,
    getWritingStrategyDescription,
    buildShoppingWritingStrategyPrompt
};
