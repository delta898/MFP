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

module.exports = {
    DEFAULT_WRITING_STRATEGY,
    normalizeWritingStrategy,
    normalizeWritingStrategyOverride,
    resolveWritingStrategy,
    getWritingStrategyDescription
};
