const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeKeyword, parseKeywords } = require('./input');

test('parseKeywords accepts comma-separated values and JSON arrays', () => {
    assert.deepEqual(parseKeywords('서현역고기집, 서현역 회식 맛집, 서현역고기집'), ['서현역고기집', '서현역 회식 맛집']);
    assert.deepEqual(parseKeywords('["신라미술관", "경주 박물관"]'), ['신라미술관', '경주 박물관']);
    assert.equal(normalizeKeyword(' 서현역 고기집 '), '서현역고기집');
});
