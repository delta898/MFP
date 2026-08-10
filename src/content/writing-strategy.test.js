const test = require('node:test');
const assert = require('node:assert/strict');

const {
    DEFAULT_WRITING_STRATEGY,
    normalizeWritingStrategy,
    normalizeWritingStrategyOverride,
    resolveWritingStrategy,
    getWritingStrategyDescription,
    buildShoppingWritingStrategyPrompt
} = require('./writing-strategy');

test('writing strategy defaults invalid or missing values to search', () => {
    assert.equal(DEFAULT_WRITING_STRATEGY, 'search');
    assert.equal(normalizeWritingStrategy(), 'search');
    assert.equal(normalizeWritingStrategy('unknown'), 'search');
    assert.equal(normalizeWritingStrategy('DISCOVERY'), 'discovery');
});

test('writing strategy override keeps only explicit supported values', () => {
    assert.equal(normalizeWritingStrategyOverride('search'), 'search');
    assert.equal(normalizeWritingStrategyOverride(' discovery '), 'discovery');
    assert.equal(normalizeWritingStrategyOverride('inherit'), '');
    assert.equal(normalizeWritingStrategyOverride(''), '');
});

test('per-post strategy overrides global strategy without changing inheritance semantics', () => {
    assert.equal(resolveWritingStrategy({ override: 'discovery', global: 'search' }), 'discovery');
    assert.equal(resolveWritingStrategy({ override: '', global: 'discovery' }), 'discovery');
    assert.equal(resolveWritingStrategy({ global: 'invalid' }), 'search');
});

test('strategy descriptions remain platform-neutral', () => {
    assert.match(getWritingStrategyDescription('search'), /검색 의도/);
    assert.match(getWritingStrategyDescription('discovery'), /피드/);
});

test('shopping strategy prompt separates search intent from feed discovery flow', () => {
    const searchPrompt = buildShoppingWritingStrategyPrompt('search');
    const discoveryPrompt = buildShoppingWritingStrategyPrompt('discovery');

    assert.match(searchPrompt, /검색 중심 전략/);
    assert.match(searchPrompt, /상품명과 모델·규격/);
    assert.match(discoveryPrompt, /발견 중심\(피드\) 전략/);
    assert.match(discoveryPrompt, /장면 → 근거 → 선택 기준/);
    assert.match(discoveryPrompt, /근거 없는 어그로/);
});
