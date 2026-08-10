const test = require('node:test');
const assert = require('node:assert/strict');

const {
    DEFAULT_WRITING_STRATEGY,
    normalizeWritingStrategy,
    normalizeWritingStrategyOverride,
    resolveWritingStrategy,
    getWritingStrategyDescription,
    buildWritingStrategyPrompt
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

test('strategy descriptions and prompts remain platform-neutral', () => {
    assert.match(getWritingStrategyDescription('search'), /검색 의도/);
    assert.match(getWritingStrategyDescription('discovery'), /피드/);

    const searchPrompt = buildWritingStrategyPrompt('search');
    assert.match(searchPrompt, /검색 중심/);
    assert.match(searchPrompt, /키워드/);

    const discoveryPrompt = buildWritingStrategyPrompt('discovery');
    assert.match(discoveryPrompt, /발견 중심 \(피드\)/);
    assert.match(discoveryPrompt, /과장하지 말고/);
    assert.doesNotMatch(discoveryPrompt, /네이버|워드프레스/);
});

