const test = require('node:test');
const assert = require('node:assert/strict');
const WordPressClient = require('./wordpress-client');

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
