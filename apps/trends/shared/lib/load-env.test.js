const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { loadEnvFiles, parseEnvFile } = require('./load-env');

test('parseEnvFile parses simple assignments and quoted values', () => {
    const parsed = parseEnvFile(`
# comment
SUPABASE_URL=https://example.supabase.co
SUPABASE_SECRET_KEY="sb_secret_123"
TRENDS_API_TOKEN='abc123'
EMPTY_VALUE=
`);

    assert.deepEqual(parsed, {
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_SECRET_KEY: 'sb_secret_123',
        TRENDS_API_TOKEN: 'abc123',
        EMPTY_VALUE: ''
    });
});

test('loadEnvFiles loads .env and preserves existing process values by default', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'load-env-'));
    try {
        fs.writeFileSync(path.join(tempDir, '.env'), [
            'SUPABASE_URL=https://example.supabase.co',
            'SUPABASE_SECRET_KEY=sb_secret_from_file',
            ''
        ].join('\n'));

        const env = { SUPABASE_SECRET_KEY: 'sb_secret_existing' };
        const result = loadEnvFiles({ baseDir: tempDir, env });

        assert.equal(env.SUPABASE_URL, 'https://example.supabase.co');
        assert.equal(env.SUPABASE_SECRET_KEY, 'sb_secret_existing');
        assert.equal(result.loadedFiles.length, 1);
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});
