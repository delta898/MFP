const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { validateRemoteCatalog } = require('../src/ai/catalog-registry');

const repoRoot = path.resolve(__dirname, '..');
const operationsRoot = path.join(repoRoot, 'supabase', 'operations', 'ai');

function read(name) {
    return fs.readFileSync(path.join(operationsRoot, name), 'utf8');
}

test('Development coexistence routes legacy and v0.5.2 clients to separate published snapshots', () => {
    const sql = read('2026-09-23_ai_model_catalog_dev_version_coexistence.sql');

    assert.match(sql, /minimum_app_version = '0\.5\.2'[\s\S]*version = '2026-09-23\.1'/);
    assert.match(sql, /version = '2026-09-22\.2'[\s\S]*status = 'retired'/);
    assert.match(sql, /get_ai_model_catalog\('stable', '0\.5\.1'\)/);
    assert.match(sql, /get_ai_model_catalog\('stable', '0\.5\.2'\)/);
    assert.doesNotMatch(sql, /set status = 'retired'/);
});

test('Production draft embeds the validated 39-model v0.5.2 payload', () => {
    const sql = read('2026-09-23_ai_model_catalog_prod_2026-09-23-1_draft.sql');
    const payloadMatch = sql.match(/\$catalog\$\n([\s\S]+?)\n\$catalog\$::jsonb/);
    assert.ok(payloadMatch, 'embedded catalog payload is required');
    const payload = JSON.parse(payloadMatch[1]);

    assert.equal(payload.version, '2026-09-23.1');
    assert.equal(payload.minimum_app_version, '0.5.2');
    assert.equal(payload.models.length, 39);
    const validated = validateRemoteCatalog(payload, { appVersion: '0.5.2' });
    assert.equal(validated.models.length, 39);
    assert.throws(
        () => validateRemoteCatalog(payload, { appVersion: '0.5.1' }),
        /0\.5\.2 이상/
    );
    assert.deepEqual(
        payload.models.find((model) => model.key === 'openai:gpt-6-sol')
            ?.capabilities?.reasoning_efforts,
        ['none', 'low', 'medium', 'high', 'xhigh', 'max']
    );
});

test('Production publish preserves the legacy snapshot and verifies version routing', () => {
    const publishSql = read('2026-09-23_ai_model_catalog_prod_2026-09-23-1_publish.sql');
    const rollbackSql = read('2026-09-23_ai_model_catalog_prod_2026-09-23-1_rollback.sql');

    assert.doesNotMatch(publishSql, /where channel = 'stable'\s+and status = 'published'/);
    assert.match(publishSql, /legacy_version is null or legacy_version = '2026-09-23\.1'/);
    assert.match(publishSql, /current_version is distinct from '2026-09-23\.1'/);
    assert.match(rollbackSql, /version = '2026-09-23\.1'/);
    assert.doesNotMatch(rollbackSql, /set status = 'published'/);
});
