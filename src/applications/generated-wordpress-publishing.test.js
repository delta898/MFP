'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createGeneratedWordPressPublishingApplication } = require('./generated-wordpress-publishing');
const { createGeneratedWordPressPublishingSystem } = require('../composition/generated-wordpress-publishing');
const { createWordPressPublishingSystem } = require('../composition/wordpress-publishing');
const { createCorePluginRuntime } = require('../composition/core-plugin-runtime');

test('Application generates text then delegates publication to the WordPress Application', async () => {
    const calls = [];
    const application = createGeneratedWordPressPublishingApplication({
        async executeOperation(pluginId, operationId, input, context) {
            calls.push({ pluginId, operationId, input, context });
            return { text: 'Generated manuscript' };
        },
        validatePublicationRequest(request) {
            calls.push({ validate: request });
            return {
                title: request.title,
                content: request.content,
                status: request.status || 'draft',
                date: request.date,
                category: request.category || '',
                featuredAsset: request.featuredAsset || '',
                assets: request.assets || []
            };
        },
        async publish(request, context) {
            calls.push({ publish: request, context });
            return { success: true, postId: 7 };
        }
    });
    const context = { signal: new AbortController().signal };

    const result = await application.publish({ prompt: 'Write about Jeju', title: 'Jeju walk' }, context);

    assert.deepEqual(result, {
        generatedText: 'Generated manuscript',
        publication: { success: true, postId: 7 }
    });
    assert.deepEqual(calls[0].validate, {
        title: 'Jeju walk', content: undefined, status: undefined, date: undefined,
        category: undefined, assets: undefined, featuredAsset: undefined
    });
    assert.equal(calls[1].pluginId, 'content-generator');
    assert.equal(calls[1].operationId, 'text.generate');
    assert.deepEqual(calls[1].input, { prompt: 'Write about Jeju' });
    assert.deepEqual(calls[2].publish, {
        title: 'Jeju walk', content: 'Generated manuscript', status: 'draft',
        date: undefined, category: '', assets: [], featuredAsset: ''
    });
    assert.equal(calls[1].context, context);
    assert.equal(calls[2].context, context);
});

test('Application does not publish when text generation fails and preserves publication errors', async () => {
    const generationFailure = new Error('generation failed');
    let publishCalls = 0;
    const generationFails = createGeneratedWordPressPublishingApplication({
        async executeOperation() { throw generationFailure; },
        validatePublicationRequest(request) { return request; },
        async publish() { publishCalls += 1; }
    });
    await assert.rejects(generationFails.publish({ prompt: 'Topic', title: 'Title' }), (error) => error === generationFailure);
    assert.equal(publishCalls, 0);

    const publicationFailure = new Error('publication failed');
    const publishingFails = createGeneratedWordPressPublishingApplication({
        async executeOperation() { return { text: 'Generated manuscript' }; },
        validatePublicationRequest(request) { return request; },
        async publish() { throw publicationFailure; }
    });
    await assert.rejects(publishingFails.publish({ prompt: 'Topic', title: 'Title' }), (error) => error === publicationFailure);
});

test('invalid WordPress publication input is rejected before text generation', async () => {
    let generationCalls = 0;
    const validationFailure = new Error('invalid WordPress request');
    const application = createGeneratedWordPressPublishingApplication({
        validatePublicationRequest() { throw validationFailure; },
        async executeOperation() { generationCalls += 1; return { text: 'Generated' }; },
        async publish() {}
    });

    await assert.rejects(application.publish({ prompt: 'Topic', title: 'Title' }), (error) => error === validationFailure);
    assert.equal(generationCalls, 0);
});

test('invalid top-level request is rejected before text generation', async () => {
    let generationCalls = 0;
    const application = createGeneratedWordPressPublishingApplication({
        validatePublicationRequest(request) { return request; },
        async executeOperation() { generationCalls += 1; return { text: 'Generated' }; },
        async publish() {}
    });

    await assert.rejects(application.publish(null), /request must be an object/);
    assert.equal(generationCalls, 0);
});

test('composition registers both required Plugins and runs generation through WordPress REST publication', async () => {
    const requests = [];
    const system = createGeneratedWordPressPublishingSystem({
        pluginDependencies: {
            'content-generator': {
                async generateText({ prompt }) { return `Generated for: ${prompt}`; }
            },
            'wordpress-publisher': {
                getCredentials: async () => ({ url: 'https://site.test', userId: 'author', appPassword: 'fake-password' }),
                async fetch(url, init) {
                    requests.push({ url, init });
                    return {
                        ok: true,
                        status: 201,
                        async json() { return { id: 42, link: 'https://site.test/post/42' }; }
                    };
                }
            }
        }
    });

    assert.deepEqual(system.corePluginRegistry.list(), ['wordpress-publisher', 'content-generator', 'hello-world']);
    assert.deepEqual(system.pluginHost.listPlugins().map(({ id }) => id), ['content-generator', 'wordpress-publisher']);
    assert.deepEqual(system.pluginHost.listOperations().map(({ pluginId, operationId }) => ({ pluginId, operationId })), [
        { pluginId: 'content-generator', operationId: 'text.generate' },
        { pluginId: 'wordpress-publisher', operationId: 'categories.list' },
        { pluginId: 'wordpress-publisher', operationId: 'media.upload' },
        { pluginId: 'wordpress-publisher', operationId: 'posts.create' }
    ]);

    const result = await system.application.publish({ prompt: 'Jeju travel', title: 'A Jeju morning' });

    assert.deepEqual(result, {
        generatedText: 'Generated for: Jeju travel',
        publication: {
            success: true,
            postId: 42,
            postUrl: 'https://site.test/post/42',
            status: 'draft',
            warnings: null
        }
    });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'https://site.test/wp-json/wp/v2/posts');
    assert.deepEqual(JSON.parse(requests[0].init.body), {
        title: 'A Jeju morning',
        content: 'Generated for: Jeju travel',
        status: 'draft',
        categories: [],
        featured_media: 0
    });
});

test('separate Applications share one process Plugin Host and reuse an already registered Plugin', async () => {
    const sharedRuntime = createCorePluginRuntime();
    const pluginDependencies = {
        'wordpress-publisher': {
            getCredentials: async () => ({ url: 'https://site.test', userId: 'author', appPassword: 'fake-password' }),
            async fetch() {
                return { ok: true, status: 201, async json() { return { id: 17, link: 'https://site.test/post/17' }; } };
            }
        }
    };
    const wordpressSystem = createWordPressPublishingSystem({ corePluginRuntime: sharedRuntime, pluginDependencies });
    const generatedSystem = createGeneratedWordPressPublishingSystem({
        corePluginRuntime: sharedRuntime,
        pluginDependencies: {
            'content-generator': { async generateText({ prompt }) { return `Generated: ${prompt}`; } }
        }
    });

    assert.strictEqual(wordpressSystem.pluginHost, generatedSystem.pluginHost);
    assert.deepEqual(sharedRuntime.listPlugins().map(({ id, state }) => ({ id, state })), [
        { id: 'wordpress-publisher', state: 'enabled' },
        { id: 'content-generator', state: 'enabled' },
        { id: 'hello-world', state: 'not_loaded' }
    ]);
    const result = await generatedSystem.application.publish({ prompt: 'Jeju', title: 'Jeju notes' });
    assert.equal(result.publication.postId, 17);
});

test('disabled Plugins block the corresponding step without reaching WordPress', async () => {
    let generationCalls = 0;
    let wordpressCalls = 0;
    const system = createGeneratedWordPressPublishingSystem({
        pluginDependencies: {
            'content-generator': { async generateText() { generationCalls += 1; return 'Generated draft'; } },
            'wordpress-publisher': {
                getCredentials: async () => ({ url: 'https://site.test', userId: 'author', appPassword: 'fake-password' }),
                async fetch() { wordpressCalls += 1; throw new Error('Must not publish while disabled.'); }
            }
        }
    });

    await system.pluginHost.setEnabled('content-generator', false);
    await assert.rejects(system.application.publish({ prompt: 'Topic', title: 'Title' }), { code: 'PLUGIN_DISABLED' });
    assert.equal(generationCalls, 0);
    assert.equal(wordpressCalls, 0);

    await system.pluginHost.setEnabled('content-generator', true);
    await system.pluginHost.setEnabled('wordpress-publisher', false);
    await assert.rejects(system.application.publish({ prompt: 'Topic', title: 'Title' }), { code: 'PLUGIN_DISABLED' });
    assert.equal(generationCalls, 1);
    assert.equal(wordpressCalls, 0);
});
