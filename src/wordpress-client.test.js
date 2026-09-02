const test = require('node:test');
const assert = require('node:assert/strict');
const WordPressClient = require('./wordpress-client');

test('verifyAuth requires complete WordPress configuration', async () => {
    const client = new WordPressClient({ url: '', userId: '', appPassword: '' });

    assert.deepEqual(await client.verifyAuth(), {
        success: false,
        configured: false,
        connected: false,
        canEdit: false,
        canPublish: false,
        message: '워드프레스 설정(URL, App ID, Password)이 누락되었습니다.'
    });
});

test('verifyAuth confirms both authentication and publishing permission', async () => {
    const client = new WordPressClient({
        url: 'https://blog.example',
        userId: 'editor',
        appPassword: 'app-password',
        axios: {
            async get() {
                return { data: { id: 7, name: 'Editor', slug: 'editor', roles: ['editor'], capabilities: { publish_posts: true } } };
            }
        }
    });

    const result = await client.verifyAuth();
    assert.equal(result.success, true);
    assert.equal(result.connected, true);
    assert.equal(result.canEdit, true);
    assert.equal(result.canPublish, true);
});

test('verifyAuth confirms authentication even when WordPress omits capability details', async () => {
    const client = new WordPressClient({
        url: 'https://blog.example',
        userId: 'subscriber',
        appPassword: 'app-password',
        axios: {
            async get() {
                return { data: { id: 8, name: 'Subscriber', slug: 'subscriber', roles: ['subscriber'], capabilities: {} } };
            }
        }
    });

    const result = await client.verifyAuth();
    assert.equal(result.success, true);
    assert.equal(result.connected, true);
    assert.equal(result.canEdit, false);
    assert.equal(result.canPublish, false);
});

test('verifyAuth rejects an authenticated user without writing permission when edit access is required', async () => {
    const client = new WordPressClient({
        url: 'https://blog.example',
        userId: 'subscriber',
        appPassword: 'app-password',
        axios: {
            async get() {
                return { data: { id: 8, name: 'Subscriber', slug: 'subscriber', roles: ['subscriber'], capabilities: {} } };
            }
        }
    });

    const result = await client.verifyAuth({ requireEdit: true });
    assert.equal(result.success, false);
    assert.equal(result.connected, true);
    assert.equal(result.canEdit, false);
    assert.equal(result.canPublish, false);
    assert.match(result.message, /글쓰기 권한/);
});

test('verifyAuth requires publish_posts for immediate or scheduled publishing', async () => {
    const client = new WordPressClient({
        url: 'https://blog.example',
        userId: 'author',
        appPassword: 'app-password',
        axios: {
            async get() {
                return { data: { id: 9, name: 'Contributor', slug: 'contributor', roles: ['contributor'], capabilities: { edit_posts: true } } };
            }
        }
    });

    assert.equal((await client.verifyAuth()).success, true);
    const publishResult = await client.verifyAuth({ requirePublish: true });
    assert.equal(publishResult.success, false);
    assert.equal(publishResult.canEdit, true);
    assert.equal(publishResult.canPublish, false);
    assert.match(publishResult.message, /게시 권한/);
});

test('verifyAuth recognizes standard WordPress author roles when capabilities are omitted', async () => {
    const client = new WordPressClient({
        url: 'https://blog.example',
        userId: 'author',
        appPassword: 'app-password',
        axios: {
            async get() {
                return { data: { id: 10, name: 'Author', slug: 'author', roles: ['author'] } };
            }
        }
    });

    assert.equal((await client.verifyAuth({ requireEdit: true })).success, true);
    assert.equal((await client.verifyAuth({ requirePublish: true })).success, true);
});

test('deleteMedia permanently removes the WordPress media item', async () => {
    const calls = [];
    const client = new WordPressClient({
        url: 'https://blog.example',
        userId: 'editor',
        appPassword: 'app-password',
        axios: {
            async delete(url, options) {
                calls.push({ url, options });
                return { data: { deleted: true } };
            }
        }
    });

    assert.equal(await client.deleteMedia(91), true);
    assert.equal(calls[0].url, 'https://blog.example/wp-json/wp/v2/media/91');
    assert.deepEqual(calls[0].options.params, { force: true });
    assert.match(calls[0].options.headers.Authorization, /^Basic /);
});

test('deleteMedia is best effort when WordPress rejects cleanup', async () => {
    const client = new WordPressClient({
        url: 'https://blog.example',
        userId: 'editor',
        appPassword: 'app-password',
        axios: {
            async delete() {
                throw new Error('cleanup failed');
            }
        }
    });

    assert.equal(await client.deleteMedia(91), false);
    assert.equal(await client.deleteMedia('invalid'), false);
});
