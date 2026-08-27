'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

test('hosted development manifest matches committed Edge Functions and starts externally safe', () => {
    const manifest = JSON.parse(read('supabase/hosted-development-manifest.json'));
    const config = read('supabase/config.toml');
    const functionNames = fs.readdirSync(path.join(REPO_ROOT, 'supabase/functions'), {
        withFileTypes: true
    }).filter((entry) => entry.isDirectory() && entry.name !== '_shared')
        .map((entry) => entry.name)
        .sort();

    assert.equal(manifest.target, 'development');
    assert.deepEqual(manifest.edge_functions.map((item) => item.name).sort(), functionNames);
    for (const edgeFunction of manifest.edge_functions) {
        const section = config.match(new RegExp(
            `\\[functions\\.${edgeFunction.name}\\]([\\s\\S]*?)(?=\\n\\[|$)`
        ));
        assert.ok(section, edgeFunction.name);
        assert.match(section[1], new RegExp(`verify_jwt\\s*=\\s*${edgeFunction.verify_jwt}`));
    }
    assert.equal(manifest.safety.live_publish, false);
    assert.equal(manifest.safety.live_payment, false);
    assert.equal(manifest.safety.default_notification_mode, 'sink');
    assert.equal(manifest.safety.cron_activation, false);
    assert.equal(manifest.safety.paid_provider_smoke_test, false);
});

test('development contract contains no infrastructure-provider implementation details', () => {
    const manifest = JSON.parse(read('supabase/hosted-development-manifest.json'));
    const sample = read('config/hosted-development.env.sample');
    const serialized = JSON.stringify(manifest);

    assert.equal(manifest.connection.required_sources.includes(
        'BLOGGENIUS_DEVELOPMENT_SUPABASE_PUBLISHABLE_KEY'
    ), true);
    assert.ok(manifest.edge_function_environment.every((item) => item.name));
    assert.ok(manifest.edge_function_environment.every((item) => !Object.hasOwn(item, 'source')));
    assert.doesNotMatch(serialized, /ssh|remote_root|container|compose|secret_file/i);
    assert.doesNotMatch(sample, /ssh|remote_root|container|compose|secret_file/i);
    assert.doesNotMatch(sample, /SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD/);
});

test('development seed license is not bound to a placeholder machine', () => {
    const seed = read('supabase/development-seed.sql');

    assert.doesNotMatch(seed, /HOSTED-DEVELOPMENT-HWID/);
    assert.match(seed, /'active',\s*null,\s*0,\s*100,/);
});

test('license email function fails closed and supports development sink or allowlist only', () => {
    const source = read('supabase/functions/send-license-code/index.ts');

    assert.match(source, /Deno\.env\.get\("BLOGGENIUS_ENV"\)/);
    assert.match(source, /Deno\.env\.get\("BLOGGENIUS_NOTIFICATION_MODE"\)/);
    assert.match(source, /Deno\.env\.get\("LICENSE_EMAIL_ALLOWLIST"\)/);
    assert.match(source, /accepted_by_development_sink/);
    assert.match(source, /email_recipient_not_allowed/);
    assert.match(source, /environment_not_configured/);
    assert.match(source, /environment === "production"/);
    assert.match(source, /mode === "live"/);
});
