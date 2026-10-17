'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createWordPressPublisherAdapter } = require('./wordpress-publisher');

test('WordPress adapter maps publication operations at the Plugin boundary', async () => {
    const calls = [];
    const adapter = createWordPressPublisherAdapter({ async executeOperation(...args) { calls.push(args); return {}; } });
    const context = { signal: new AbortController().signal };
    await adapter.inspectConnection({ requireEdit: true }, context);
    await adapter.uploadMedia({ bytes: Buffer.from('image'), filename: 'cover.png', mimeType: 'image/png', altText: 'cover' }, context);
    await adapter.listCategories(' news ', context);
    await adapter.createPost({ title: 'Title', content: '<p>Body</p>' }, context);

    assert.deepEqual(calls.map(([pluginId, operationId]) => [pluginId, operationId]), [
        ['wordpress-publisher', 'connection.inspect'], ['wordpress-publisher', 'media.upload'], ['wordpress-publisher', 'categories.list'], ['wordpress-publisher', 'posts.create']
    ]);
    assert.deepEqual(calls[0][2], { requireEdit: true });
    assert.strictEqual(calls[0][3], context);
    assert.equal(calls[1][2].bytesBase64, Buffer.from('image').toString('base64'));
    assert.equal(calls[1][2].mimeType, 'image/png');
    assert.deepEqual(calls[2][2], { search: 'news' });
    assert.deepEqual(calls[3][2], { title: 'Title', content: '<p>Body</p>' });
    assert.strictEqual(calls[3][3], context);
});
