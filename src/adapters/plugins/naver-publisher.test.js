'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createNaverPublisherAdapter } = require('./naver-publisher');

test('Naver adapter maps a target-neutral publish request to the declared Plugin operation', async () => {
    const calls = [];
    const adapter = createNaverPublisherAdapter({ async executeOperation(...args) { calls.push(args); return { status: 'draft', warnings: [] }; } });
    const request = { title: 'A title', blocks: [{ type: 'paragraph', text: 'Body' }], assets: [], status: 'draft' };
    const context = { signal: new AbortController().signal };

    assert.deepEqual(await adapter.publish(request, context), { status: 'draft', warnings: [] });
    assert.deepEqual(calls, [['naver-publisher', 'posts.publish', request, context]]);
});
