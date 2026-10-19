const test = require('node:test');
const assert = require('node:assert/strict');
const { createSmartCommentSettingsStore } = require('./smart-comment-settings');

test('smart comment settings store preserves unrelated config and writes normalized keys', () => {
    let persisted = JSON.stringify({ app: { theme: 'warm' }, features: { blog: { enabled: true } } });
    const writes = [];
    const fs = {
        existsSync: () => true,
        readFileSync: () => persisted,
        mkdirSync() {},
        writeFileSync(_filePath, value, encoding) {
            writes.push(encoding);
            persisted = value;
        }
    };
    const store = createSmartCommentSettingsStore({
        fs,
        path: { dirname: () => '/config' },
        resolveWritableConfigPath: () => '/config/app.json'
    });

    store.save({ aiMode: 'custom', fetchLimit: 5, maxChars: 90, headless: false });

    const config = JSON.parse(persisted);
    assert.deepEqual(config.app, { theme: 'warm' });
    assert.deepEqual(config.features.blog, { enabled: true });
    assert.deepEqual(config.features.naver.comment_draft, {
        ai_mode: 'custom', fetch_limit: 5, max_chars: 90, headless: false
    });
    assert.deepEqual(writes, ['utf8']);
});
