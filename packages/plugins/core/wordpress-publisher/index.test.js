'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const manifest = require('./package.json');
const { PACKAGE_VERSION, createWordPressPublisherPlugin, WordPressPublisherError } = require('./index');

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

test('plugin uses injected credentials and fetch for WordPress REST operations', async () => {
    const calls = [];
    let credentialReads = 0;
    const plugin = createWordPressPublisherPlugin({
        async getCredentials() {
            credentialReads += 1;
            return { url: 'https://example.test/', userId: 'editor', appPassword: 'secret-app-password' };
        },
        async fetch(url, init) {
            calls.push({ url, init });
            if (url.endsWith('/media')) return response({ id: 12, source_url: 'https://example.test/uploads/photo.jpg' });
            if (url.endsWith('/media/12')) return response({ id: 12 });
            if (url.includes('/categories?')) return response([{ id: 4, name: 'Travel', slug: 'travel' }]);
            if (url.endsWith('/posts')) return response({ id: 99, link: 'https://example.test/post/99' });
            throw new Error(`Unexpected URL ${url}`);
        }
    });

    const uploaded = await plugin.operations['media.upload'].execute({
        bytes: Buffer.from('image'), filename: 'photo.jpg', mimeType: 'image/jpeg', altText: 'View'
    });
    const categories = await plugin.operations['categories.list'].execute({ search: 'Travel' });
    const post = await plugin.operations['posts.create'].execute({
        title: 'A walk', content: '<p>Text</p>', status: 'publish', categories: [4], featuredMedia: 12
    });

    assert.deepEqual(uploaded, { id: 12, url: 'https://example.test/uploads/photo.jpg' });
    assert.deepEqual(categories, [{ id: 4, name: 'Travel', slug: 'travel' }]);
    assert.deepEqual(post, { id: 99, url: 'https://example.test/post/99' });
    assert.equal(credentialReads, 3);
    assert.match(calls[0].init.headers.Authorization, /^Basic /);
    assert.equal(calls[0].init.body instanceof FormData, true);
    assert.equal(JSON.parse(calls.at(-1).init.body).featured_media, 12);
    assert.equal(JSON.stringify(calls).includes('secret-app-password'), false);
});

test('plugin validates operation inputs before making HTTP requests', async () => {
    let requests = 0;
    const plugin = createWordPressPublisherPlugin({
        getCredentials: async () => ({ url: 'https://example.test', userId: 'editor', appPassword: 'secret' }),
        async fetch() { requests += 1; return response({}); }
    });

    assert.throws(() => plugin.operations['media.upload'].input.parse({
        bytes: 'not-a-buffer', filename: 'file.png', mimeType: 'image/png'
    }), /Buffer/);
    assert.throws(() => plugin.operations['posts.create'].input.parse({
        title: 'Title', content: '', status: 'draft', categories: []
    }), /content/i);
    assert.throws(() => plugin.operations['posts.create'].input.parse({
        title: 'Scheduled', content: '<p>Text</p>', status: 'future', categories: []
    }), /date/i);
    assert.equal(requests, 0);
});

test('plugin rejects unsafe configuration and reports HTTP status without response body', async () => {
    const insecure = createWordPressPublisherPlugin({
        getCredentials: async () => ({ url: 'file:///tmp/site', userId: 'editor', appPassword: 'secret' }),
        async fetch() { throw new Error('must not be called'); }
    });
    await assert.rejects(insecure.operations['categories.list'].execute({ search: '' }), (error) => (
        error instanceof WordPressPublisherError && error.code === 'INVALID_CONFIGURATION'
    ));

    const failed = createWordPressPublisherPlugin({
        getCredentials: async () => ({ url: 'https://example.test', userId: 'editor', appPassword: 'secret' }),
        async fetch() { return response({ message: 'sensitive provider details' }, 403); }
    });
    await assert.rejects(failed.operations['categories.list'].execute({ search: '' }), (error) => (
        error.code === 'HTTP_ERROR' && error.status === 403 && !error.message.includes('sensitive provider details')
    ));

    const credentialFailure = createWordPressPublisherPlugin({
        async getCredentials() { throw new Error('private secret-bearing failure'); },
        async fetch() { throw new Error('must not be called'); }
    });
    await assert.rejects(credentialFailure.operations['categories.list'].execute({ search: '' }), (error) => (
        error.code === 'CREDENTIALS_UNAVAILABLE' && !error.message.includes('private secret-bearing failure')
    ));
});
