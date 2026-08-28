const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

test('runtime config migration requires explicit public keys and removes credential rows', () => {
    const sql = read('supabase/migrations/202608290020_harden_public_runtime_config.sql');

    assert.match(sql, /cardinality\(p_keys\) = 0/);
    assert.match(sql, /not \(requested\.config_key = any\(v_allowed_keys\)\)/);
    assert.match(sql, /'naver_client_secret'/);
    assert.match(sql, /'google_oauth_client_secret'/);
    assert.doesNotMatch(sql, /p_keys text\[\] default null/i);
});

test('desktop no longer contains a Naver Runtime Config credential loader or direct helper', () => {
    const runtimeConfig = read('src/runtime-config.js');
    const utils = read('src/utils.js');

    assert.doesNotMatch(runtimeConfig, /ensureNaverSearchCredentials/);
    assert.doesNotMatch(runtimeConfig, /naver_client_secret/i);
    assert.doesNotMatch(utils, /fetchNaverBlogSearchResults/);
    assert.doesNotMatch(utils, /openapi\.naver\.com\/v1\/search\/blog\.json/);
});
