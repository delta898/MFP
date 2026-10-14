'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createWordPressPublishingSystem } = require('../composition/wordpress-publishing');
const { createCorePluginRegistry } = require('../composition/core-plugin-registry');
const { createWordPressPublishingApplication } = require('./wordpress-publishing');

test('Application composes media, category, and post Plugin operations', async () => {
    const calls = [];
    const system = createWordPressPublishingSystem({
        pluginDependencies: {
            'wordpress-publisher': {
                getCredentials: async () => ({ url: 'https://site.test', userId: 'author', appPassword: 'injected-secret' }),
                async fetch(url, init) {
                    calls.push({ url, init });
                    if (url.endsWith('/media')) return { ok: true, status: 201, async json() { return { id: 8, source_url: 'https://site.test/photo.png' }; } };
                    if (url.endsWith('/media/8')) return { ok: true, status: 200, async json() { return { id: 8 }; } };
                    if (url.includes('/categories?')) return { ok: true, status: 200, async json() { return [{ id: 5, name: 'Travel', slug: 'travel' }]; } };
                    if (url.endsWith('/posts')) return { ok: true, status: 201, async json() { return { id: 21, link: 'https://site.test/post/21' }; } };
                    throw new Error('Unexpected request');
                }
            }
        }
    });
    assert.deepEqual(system.corePluginRegistry.list(), ['wordpress-publisher', 'content-generator']);
    assert.deepEqual(system.pluginHost.listPlugins().map((item) => item.id), ['wordpress-publisher']);
    assert.deepEqual(system.pluginHost.listOperations().map((item) => item.operationId), [
        'media.upload', 'categories.list', 'posts.create'
    ]);

    const result = await system.application.publish({
        title: 'Jeju walk',
        content: '<p>Morning view</p>{{asset:hero}}',
        status: 'schedule',
        date: '2026-11-01T09:00:00',
        category: 'Travel',
        featuredAsset: 'hero',
        assets: [{ key: 'hero', bytes: Buffer.from('image'), filename: 'hero.png', mimeType: 'image/png', altText: 'Sea' }]
    });

    assert.deepEqual(result, {
        success: true,
        postId: 21,
        postUrl: 'https://site.test/post/21',
        status: 'future',
        warnings: null
    });
    const postPayload = JSON.parse(calls.at(-1).init.body);
    assert.equal(postPayload.content, '<p>Morning view</p><img src="https://site.test/photo.png" alt="Sea">');
    assert.equal(postPayload.status, 'future');
    assert.deepEqual(postPayload.categories, [5]);
    assert.equal(postPayload.featured_media, 8);
    assert.equal(postPayload.date, '2026-11-01T09:00:00');
});

test('Application falls back to draft for media or category issues and removes unresolved asset references', async () => {
    const plugin = {
        id: 'wordpress-publisher', name: 'WordPress Publisher', version: 'test',
        operations: {
            'media.upload': { description: 'upload', input: { parse: (value) => value }, output: { parse: (value) => value }, async execute() { throw new Error('upload failed'); } },
            'categories.list': { description: 'categories', input: { parse: (value) => value }, output: { parse: (value) => value }, async execute() { return []; } },
            'posts.create': { description: 'create', input: { parse: (value) => value }, output: { parse: (value) => value }, async execute(input) { return { id: 3, url: 'https://site.test/3', captured: input }; } }
        }
    };
    const { application } = createWordPressPublishingSystem({
        corePluginRegistry: createCorePluginRegistry([{ id: 'wordpress-publisher', create: () => plugin }])
    });
    const result = await application.publish({
        title: 'Draft fallback', content: '{{asset:missing}}', status: 'publish', category: 'Unknown',
        assets: [{ key: 'missing', bytes: Buffer.from('bad'), filename: 'missing.png', mimeType: 'image/png' }]
    });

    assert.equal(result.status, 'draft');
    assert.deepEqual(result.warnings, ["이미지 'missing' 업로드 실패", "카테고리 'Unknown' 없음"]);
});

test('Application validates request before dispatch', async () => {
    let dispatched = false;
    const { application } = createWordPressPublishingSystem({
        corePluginRegistry: createCorePluginRegistry([{ id: 'wordpress-publisher', create: () => ({
            id: 'wordpress-publisher', name: 'WP', version: 'test',
            operations: {
                publish: { description: 'publish', input: { parse: (value) => value }, output: { parse: (value) => value }, async execute() { dispatched = true; } }
            }
        }) }])
    });
    await assert.rejects(application.publish({ title: 'Missing body' }), /Content/);
    await assert.rejects(application.publish({ title: 'Scheduled', content: '<p>Draft</p>', status: 'schedule' }), /Schedule date/);
    assert.equal(dispatched, false);
});

test('runtime operation visibility follows Host enable state rather than a separate list', async () => {
    const system = createWordPressPublishingSystem({
        pluginDependencies: {
            'wordpress-publisher': {
                getCredentials: async () => ({ url: 'https://site.test', userId: 'author', appPassword: 'secret' }),
                async fetch() { throw new Error('No request should be made while disabled.'); }
            }
        }
    });

    await system.pluginHost.setEnabled('wordpress-publisher', false);
    assert.deepEqual(system.corePluginRegistry.list(), ['wordpress-publisher', 'content-generator']);
    assert.deepEqual(system.pluginHost.listPlugins().map(({ id, state }) => ({ id, state })), [
        { id: 'wordpress-publisher', state: 'disabled' }
    ]);
    assert.deepEqual(system.pluginHost.listOperations(), []);
    await assert.rejects(system.application.publish({ title: 'Blocked', content: '<p>Text</p>' }), {
        code: 'PLUGIN_DISABLED'
    });
});

test('composition rejects a registry missing the Application required Plugin', () => {
    assert.throws(() => createWordPressPublishingSystem({
        corePluginRegistry: createCorePluginRegistry([])
    }), /requires the wordpress-publisher Core Plugin/i);
});

test('Application stops the workflow when the execution signal is aborted', async () => {
    const calls = [];
    const controller = new AbortController();
    const application = createWordPressPublishingApplication({
        async executeOperation(pluginId, operationId) {
            calls.push(operationId);
            controller.abort();
            const error = new Error('cancelled');
            error.code = 'ABORTED';
            throw error;
        }
    });

    await assert.rejects(application.publish({
        title: 'Cancelled', content: '{{asset:hero}}', status: 'publish',
        assets: [{ key: 'hero', bytes: Buffer.from('image'), filename: 'hero.png', mimeType: 'image/png' }]
    }, { signal: controller.signal }), (error) => error.code === 'ABORTED');
    assert.deepEqual(calls, ['media.upload']);
});
