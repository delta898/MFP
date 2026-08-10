const test = require('node:test');
const assert = require('node:assert/strict');

const {
    DEFAULT_WRITING_STRATEGY,
    normalizeWritingStrategy,
    normalizeWritingStrategyOverride,
    resolveWritingStrategy,
    getWritingStrategyDescription
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
