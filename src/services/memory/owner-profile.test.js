const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeFacet } = require('./owner-profile');

test('keeps bounded source context with a profile facet', () => {
    const facet = normalizeFacet({
        id: 'facet-1', display_value: '오디세이', normalized_value: '오디세이', evidence_count: 1,
        evidence_contexts: [{
            title: '영화 오디세이 관람 후기', source: 'manual', category: '생활',
            instruction: '그리스 로마신화 영화를 다룬다.'
        }]
    });
    assert.equal(facet.contexts[0].subject, '영화 오디세이 관람 후기');
    assert.equal(facet.contexts[0].source, 'manual');
});
