'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createWordPressPublishingSystem } = require('../../../composition/wordpress-publishing');
const { createCorePluginRegistry } = require('../../../composition/core-plugin-registry');
const { createWordPressPublishingApplication } = require('./wordpress');
const wordpressManifest = require('../../../../packages/plugins/core/wordpress-publisher/package.json').bloggeniusPlugin;
const wordpressVersion = require('../../../../packages/plugins/core/wordpress-publisher/package.json').version;

function injectedWordPressRegistration(handlers = {}) {
    return {
        manifest: wordpressManifest,
        version: wordpressVersion,
        create: () => ({
            operations: {
                'connection.inspect': { async execute(input) { return handlers.inspect?.(input) ?? { success: true, configured: true, connected: true, canEdit: true, canPublish: true, message: 'connected' }; } },
                'media.upload': { async execute(input) { return handlers.upload?.(input) ?? { id: 1, url: 'https://site.test/media/1' }; } },
                'categories.list': { async execute(input) { return handlers.categories?.(input) ?? []; } },
                'posts.create': { async execute(input) { return handlers.publish?.(input) ?? { id: 3, url: 'https://site.test/3' }; } }
            }
        })
    };
}

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
    assert.deepEqual(system.corePluginRegistry.list(), ['naver-publisher', 'wordpress-publisher', 'social-publisher', 'ai-gateway', 'astro-site-hosting', 'hello-world']);
    assert.deepEqual(system.pluginHost.listPlugins().map((item) => item.id), ['wordpress-publisher']);
    assert.deepEqual(system.pluginHost.listOperations().map((item) => item.operationId), [
        'categories.list', 'connection.inspect', 'media.upload', 'posts.create'
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

test('Application delegates WordPress connection inspection to its Plugin capability', async () => {
    const candidate = { url: 'https://candidate.test', userId: 'author', appPassword: 'temporary-secret' };
    const { application } = createWordPressPublishingSystem({
        pluginDependencies: {
            'wordpress-publisher': {
                getCredentials: async () => ({ url: 'https://saved.test', userId: 'saved', appPassword: 'saved-secret' }),
                async fetch(url, init) {
                    assert.equal(url, 'https://candidate.test/wp-json/wp/v2/users/me?context=edit');
                    assert.match(init.headers.Authorization, /^Basic /);
                    return { ok: true, status: 200, async json() { return { id: 4, name: 'Author', roles: ['author'], capabilities: {} }; } };
                }
            }
        }
    });

    const result = await application.inspectConnection({ requirePublish: true, credentials: candidate });

    assert.equal(result.success, true);
    assert.equal(result.canPublish, true);
    assert.equal(JSON.stringify(result).includes(candidate.appPassword), false);
});

test('Application falls back to draft for media or category issues and removes unresolved asset references', async () => {
    const { application } = createWordPressPublishingSystem({
        corePluginRegistry: createCorePluginRegistry([injectedWordPressRegistration({
            upload() { throw new Error('upload failed'); },
            publish() { return { id: 3, url: 'https://site.test/3' }; }
        })])
    });
    const result = await application.publish({
        title: 'Draft fallback', content: '<p>Keep this text</p>{{asset:missing}}', status: 'publish', category: 'Unknown',
        assets: [{ key: 'missing', bytes: Buffer.from('bad'), filename: 'missing.png', mimeType: 'image/png' }]
    });

    assert.equal(result.status, 'draft');
    assert.deepEqual(result.warnings, ["이미지 'missing' 업로드 실패", "카테고리 'Unknown' 없음"]);
});

test('Application validates request before dispatch', async () => {
    let dispatched = false;
    const { application } = createWordPressPublishingSystem({
        corePluginRegistry: createCorePluginRegistry([injectedWordPressRegistration({
            publish() { dispatched = true; return { id: 1, url: 'https://site.test/1' }; }
        })])
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
    assert.deepEqual(system.corePluginRegistry.list(), ['naver-publisher', 'wordpress-publisher', 'social-publisher', 'ai-gateway', 'astro-site-hosting', 'hello-world']);
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
        publisher: {
          async uploadMedia() {
            calls.push('media.upload');
            controller.abort();
            const error = new Error('cancelled');
            error.code = 'ABORTED';
            throw error;
          },
          async listCategories() {},
          async createPost() { calls.push('posts.create'); }
        }
    });

    await assert.rejects(application.publish({
        title: 'Cancelled', content: '{{asset:hero}}', status: 'publish',
        assets: [{ key: 'hero', bytes: Buffer.from('image'), filename: 'hero.png', mimeType: 'image/png' }]
    }, { signal: controller.signal }), (error) => error.code === 'ABORTED');
    assert.deepEqual(calls, ['media.upload']);
});
