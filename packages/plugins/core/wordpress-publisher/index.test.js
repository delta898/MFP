'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const manifest = require('./package.json');
const {
    PACKAGE_VERSION,
    createPlugin,
    WordPressPublisherError
} = require('./index');
const PLUGIN_MANIFEST = manifest.bloggeniusPlugin;
const { createPluginHost } = require('../../../../src/platform/plugin-host');

test('package boundary has no BlogGenius-private or third-party runtime imports', () => {
    const source = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
    assert.equal(manifest.name, '@bloggenius/wordpress-publisher');
    assert.equal(manifest.version, '0.1.0');
    assert.equal(PACKAGE_VERSION, manifest.version);
    assert.equal(manifest.dependencies, undefined);
    assert.deepEqual([...source.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map((match) => match[1]), ['./package.json']);
});

function response(body, status = 200) {
    return { ok: status >= 200 && status < 300, status, async json() { return body; } };
}

function createHost(options) {
    const implementation = createPlugin(options);
    return createPluginHost({ plugins: [{
        manifest: PLUGIN_MANIFEST,
        version: PACKAGE_VERSION,
        operations: implementation.operations
    }] });
}

test('plugin uses injected credentials and fetch for WordPress REST operations', async () => {
    const calls = [];
    let credentialReads = 0;
    const host = createHost({
        async getCredentials() {
            credentialReads += 1;
            return { url: 'https://example.test/', userId: 'editor', appPassword: 'secret-app-password' };
        },
        async fetch(url, init) {
            calls.push({ url, init });
            if (url.endsWith('/users/me?context=edit')) return response({ id: 7, name: 'Contributor', roles: ['contributor'], capabilities: { edit_posts: true, publish_posts: false } });
            if (url.endsWith('/media')) return response({ id: 12, source_url: 'https://example.test/uploads/photo.jpg' });
            if (url.endsWith('/media/12')) return response({ id: 12 });
            if (url.includes('/categories?')) return response([{ id: 4, name: 'Travel', slug: 'travel' }]);
            if (url.endsWith('/posts')) return response({ id: 99, link: 'https://example.test/post/99' });
            throw new Error(`Unexpected URL ${url}`);
        }
    });

    const inspected = await host.execute('wordpress-publisher', 'connection.inspect', { requireEdit: true });
    const uploaded = await host.execute('wordpress-publisher', 'media.upload', {
        bytesBase64: Buffer.from('image').toString('base64'), filename: 'photo.jpg', mimeType: 'image/jpeg', altText: 'View'
    });
    const categories = await host.execute('wordpress-publisher', 'categories.list', { search: 'Travel' });
    const post = await host.execute('wordpress-publisher', 'posts.create', {
        title: 'A walk', content: '<p>Text</p>', status: 'publish', categories: [4], featuredMedia: 12
    });

    assert.deepEqual(uploaded, { id: 12, url: 'https://example.test/uploads/photo.jpg' });
    assert.equal(inspected.success, true);
    assert.equal(inspected.canEdit, true);
    assert.equal(inspected.canPublish, false);
    assert.deepEqual(categories, [{ id: 4, name: 'Travel', slug: 'travel' }]);
    assert.deepEqual(post, { id: 99, url: 'https://example.test/post/99' });
    assert.equal(credentialReads, 4);
    assert.match(calls[1].init.headers.Authorization, /^Basic /);
    assert.equal(calls[1].init.body instanceof FormData, true);
    assert.equal(JSON.parse(calls.at(-1).init.body).featured_media, 12);
    assert.equal(JSON.stringify(calls).includes('secret-app-password'), false);
});

test('connection inspection accepts temporary candidate credentials without persisting or returning them', async () => {
    const calls = [];
    const host = createHost({
        getCredentials: async () => ({ url: 'https://saved.test', userId: 'saved', appPassword: 'saved-secret' }),
        async fetch(url, init) {
            calls.push({ url, init });
            return response({ id: 9, name: 'Author', roles: ['author'], capabilities: { edit_posts: true, publish_posts: true } });
        }
    });
    const result = await host.execute('wordpress-publisher', 'connection.inspect', {
        requirePublish: true,
        credentials: { url: 'https://candidate.test', userId: 'candidate', appPassword: 'candidate-secret' }
    });

    assert.equal(result.success, true);
    assert.match(calls[0].url, /^https:\/\/candidate\.test\//);
    assert.equal(calls[0].init.headers.Authorization, `Basic ${Buffer.from('candidate:candidate-secret').toString('base64')}`);
    assert.equal(JSON.stringify(result).includes('candidate-secret'), false);
});

test('plugin validates operation inputs before making HTTP requests', async () => {
    let requests = 0;
    const host = createHost({
        getCredentials: async () => ({ url: 'https://example.test', userId: 'editor', appPassword: 'secret' }),
        async fetch() { requests += 1; return response({}); }
    });

    await assert.rejects(host.execute('wordpress-publisher', 'media.upload', {
        bytesBase64: 'not base64!', filename: 'file.png', mimeType: 'image/png'
    }), { code: 'PLUGIN_OPERATION_CONTRACT_VIOLATION' });
    await assert.rejects(host.execute('wordpress-publisher', 'posts.create', {
        title: 'Title', content: '', status: 'draft', categories: [], featuredMedia: null
    }), { code: 'PLUGIN_OPERATION_CONTRACT_VIOLATION' });
    await assert.rejects(host.execute('wordpress-publisher', 'posts.create', {
        title: 'Scheduled', content: '<p>Text</p>', status: 'future', categories: [], featuredMedia: null
    }), { code: 'PLUGIN_OPERATION_CONTRACT_VIOLATION' });
    assert.equal(requests, 0);
});

test('plugin rejects unsafe configuration and reports HTTP status without response body', async () => {
    const insecure = createHost({
        getCredentials: async () => ({ url: 'file:///tmp/site', userId: 'editor', appPassword: 'secret' }),
        async fetch() { throw new Error('must not be called'); }
    });
    await assert.rejects(insecure.execute('wordpress-publisher', 'categories.list', { search: '' }), (error) => (
        error instanceof WordPressPublisherError && error.code === 'INVALID_CONFIGURATION'
    ));

    const failed = createHost({
        getCredentials: async () => ({ url: 'https://example.test', userId: 'editor', appPassword: 'secret' }),
        async fetch() { return response({ message: 'sensitive provider details' }, 403); }
    });
    await assert.rejects(failed.execute('wordpress-publisher', 'categories.list', { search: '' }), (error) => (
        error.code === 'HTTP_ERROR' && error.status === 403 && !error.message.includes('sensitive provider details')
    ));

    const credentialFailure = createHost({
        async getCredentials() { throw new Error('private secret-bearing failure'); },
        async fetch() { throw new Error('must not be called'); }
    });
    await assert.rejects(credentialFailure.execute('wordpress-publisher', 'categories.list', { search: '' }), (error) => (
        error.code === 'CREDENTIALS_UNAVAILABLE' && !error.message.includes('private secret-bearing failure')
    ));
});
