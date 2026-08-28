'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    createReferenceSearchGateway,
    normalizeReferenceSnapshot,
    searchOptionalReferences
} = require('./reference-search-gateway');

function snapshot(items) {
    return { schema_version: 1, kind: 'blog_reference', transport: 'server_gateway', items };
}

test('reference search gateway sends only bounded semantic search input', async () => {
    const calls = [];
    const gateway = createReferenceSearchGateway({
        serverGatewayClient: {
            async fetchSnapshot(request) {
                calls.push(request);
                return snapshot([
                    {
                        title: ' 참고 글 ',
                        url: 'https://blog.naver.com/example/1#part',
                        published_at: '2026-08-29T00:00:00.000Z'
                    }
                ]);
            }
        }
    });

    assert.deepEqual(await gateway.searchLatestReferences({ topic: ` ${'가'.repeat(200)} `, limit: 999 }), [{
        title: '참고 글',
        link: 'https://blog.naver.com/example/1',
        postdate: '20260829'
    }]);
    assert.deepEqual(calls[0], {
        kind: 'blog_reference',
        purpose: 'writing_reference',
        query: { topic: '가'.repeat(180), locale: 'ko-KR', country: 'KR', limit: 5 }
    });
});

test('reference snapshot validation rejects unsafe or malformed gateway output', () => {
    assert.throws(() => normalizeReferenceSnapshot(null, 3), /invalid reference snapshot/);
    assert.throws(() => normalizeReferenceSnapshot({
        schema_version: 1, kind: 'news', transport: 'server_gateway', items: []
    }, 3), /identity/);
    assert.deepEqual(normalizeReferenceSnapshot(snapshot([
        { title: 'HTTP 제외', url: 'http://example.com/1', published_at: '2026-08-29T00:00:00Z' },
        { title: '날짜 제외', url: 'https://example.com/2', published_at: 'invalid' },
        { title: '정상', url: 'https://example.com/3', published_at: '2026-08-28T00:00:00Z' }
    ]), 3), [{ title: '정상', link: 'https://example.com/3', postdate: '20260828' }]);
});

test('optional reference failure returns no automatic references without direct provider fallback', async () => {
    const failures = [];
    const result = await searchOptionalReferences({
        async searchLatestReferences() {
            const error = new Error('gateway unavailable');
            error.code = 'UPSTREAM_FAILED';
            throw error;
        }
    }, { topic: '계속 작성할 주제', limit: 3 }, (error) => failures.push(error.code));

    assert.deepEqual(result, []);
    assert.deepEqual(failures, ['UPSTREAM_FAILED']);
});
