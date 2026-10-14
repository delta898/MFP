'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createBlogWritingSystem } = require('../../../composition/blog-writing');
const { createCorePluginRuntime } = require('../../../composition/core-plugin-runtime');

test('Blog Writing Application generates through AI Gateway and publishes through WordPress operations', async () => {
    const calls = [];
    const runtime = createCorePluginRuntime();
    const system = createBlogWritingSystem({
        corePluginRuntime: runtime,
        pluginDependencies: {
            'ai-gateway': {
                transport: { async request(request) {
                    calls.push({ kind: 'generate', request });
                    return { status: 200, headers: {}, body: { choices: [{ message: { content: '{"title":"Jeju","content":"A walk by the sea.","hashtags":["여행"]}' } }] } };
                } }
            },
            'wordpress-publisher': {
                getCredentials: async () => ({ url: 'https://site.test', userId: 'writer', appPassword: 'secret' }),
                async fetch(url, init) {
                    calls.push({ kind: 'wordpress', url, init });
                    return { ok: true, status: 201, async json() { return { id: 17, link: 'https://site.test/17' }; } };
                }
            }
        },
        getTextModel: () => ({ provider: 'openai', modelId: 'gpt-6-astra' })
    });
    const context = { signal: new AbortController().signal };

    const text = await system.application.generateText('Write a Jeju post', context);
    const publication = await system.application.publishWordPress({
        title: 'Jeju morning', content: '<p>A walk by the sea.</p>', status: 'draft'
    }, context);

    assert.match(text, /"title":"Jeju"/);
    assert.deepEqual(publication, {
        success: true, postId: 17, postUrl: 'https://site.test/17', status: 'draft', warnings: null
    });
    assert.equal(calls[0].kind, 'generate');
    assert.equal(calls[1].url, 'https://site.test/wp-json/wp/v2/posts');
    assert.equal(JSON.parse(calls[1].init.body).content, '<p>A walk by the sea.</p>');
    assert.deepEqual(runtime.host.listPlugins().map(({ id }) => id), ['ai-gateway', 'wordpress-publisher']);
});

test('Blog Writing Application validates prompts and preserves the execution context', async () => {
    let receivedSignal;
    const system = createBlogWritingSystem({
        textModel: { provider: 'openai', modelId: 'gpt-6-astra' },
        pluginDependencies: {
            'ai-gateway': { transport: { async request(request) {
                receivedSignal = request.signal;
                return { status: 200, headers: {}, body: { choices: [{ message: { content: 'ok' } }] } };
            } } },
            'wordpress-publisher': { getCredentials: async () => ({ url: 'https://site.test', userId: 'u', appPassword: 'p' }), async fetch() {} }
        }
    });
    const signal = new AbortController().signal;
    await assert.rejects(system.application.generateText('  '), /prompt must be a non-empty string/);
    assert.equal(await system.application.generateText('prompt', { signal }), 'ok');
    assert.equal(receivedSignal, signal);
});

test('Blog Writing Application generates images through the Gateway Host contract and reports progress', async () => {
    const progress = [];
    const system = createBlogWritingSystem({
        imageModel: { provider: 'openai', modelId: 'gpt-image-2' },
        pluginDependencies: {
            'ai-gateway': { transport: { async request() {
                return { status: 200, headers: {}, body: { data: [{ b64_json: Buffer.from('png').toString('base64') }] } };
            } } },
            'wordpress-publisher': { getCredentials: async () => ({ url: 'https://site.test', userId: 'u', appPassword: 'p' }), async fetch() {} }
        }
    });
    const image = await system.application.generateImage('a small tree', {}, {
        reportProgress: (event) => progress.push(event)
    });
    assert.equal(Buffer.from(image.dataBase64, 'base64').toString(), 'png');
    assert.deepEqual(progress, [{ pluginId: 'ai-gateway', operationId: 'image.generate', phase: 'generating' }]);
});
