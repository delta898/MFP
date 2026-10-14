'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createBlogWritingSystem } = require('../composition/blog-writing');
const { createCorePluginRuntime } = require('../composition/core-plugin-runtime');

test('Blog Writing Application generates through Content Generator and publishes through WordPress operations', async () => {
    const calls = [];
    const runtime = createCorePluginRuntime();
    const system = createBlogWritingSystem({
        corePluginRuntime: runtime,
        pluginDependencies: {
            'content-generator': {
                async generateText({ prompt }) {
                    calls.push({ kind: 'generate', prompt });
                    return '{"title":"Jeju","content":"A walk by the sea.","hashtags":["여행"]}';
                }
            },
            'wordpress-publisher': {
                getCredentials: async () => ({ url: 'https://site.test', userId: 'writer', appPassword: 'secret' }),
                async fetch(url, init) {
                    calls.push({ kind: 'wordpress', url, init });
                    return { ok: true, status: 201, async json() { return { id: 17, link: 'https://site.test/17' }; } };
                }
            }
        }
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
    assert.deepEqual(runtime.host.listPlugins().map(({ id }) => id), ['content-generator', 'wordpress-publisher']);
});

test('Blog Writing Application validates prompts and preserves the execution context', async () => {
    let receivedSignal;
    const system = createBlogWritingSystem({
        pluginDependencies: {
            'content-generator': { async generateText({ signal }) { receivedSignal = signal; return 'ok'; } },
            'wordpress-publisher': { getCredentials: async () => ({ url: 'https://site.test', userId: 'u', appPassword: 'p' }), async fetch() {} }
        }
    });
    const signal = new AbortController().signal;
    await assert.rejects(system.application.generateText('  '), /prompt must be a non-empty string/);
    assert.equal(await system.application.generateText('prompt', { signal }), 'ok');
    assert.equal(receivedSignal, signal);
});
