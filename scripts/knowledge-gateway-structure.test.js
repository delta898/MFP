const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('knowledge gateway SQL keeps cache and protection state service-role only', () => {
    const sql = read('sql/supabase_knowledge_gateway.sql');
    for (const table of [
        'knowledge_gateway_cache',
        'knowledge_gateway_rate_limits',
        'knowledge_gateway_provider_usage',
        'knowledge_gateway_provider_state'
    ]) {
        assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
        assert.match(sql, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, 'i'));
        assert.match(sql, new RegExp(`grant all on table public\\.${table} to service_role`, 'i'));
    }
    assert.match(sql, /consume_knowledge_gateway_rate_limit/);
    assert.match(sql, /consume_knowledge_provider_quota/);
    assert.match(sql, /record_knowledge_provider_failure/);
});

test('stage four gateway has no live upstream provider or desktop credential route', () => {
    const providers = read('supabase/functions/_shared/knowledge-gateway-providers.ts');
    const transport = read('src/knowledge/transports/server-gateway.js');
    const client = read('src/knowledge/server-gateway-client.js');
    assert.match(providers, /const ROUTES = new Map<string, KnowledgeProviderRoute>\(\);/);
    assert.doesNotMatch(providers, /serpapi\.com|openapi\.naver\.com|fetch\(/);
    assert.doesNotMatch(transport, /api[_-]?key|authorization|base[_-]?url/i);
    assert.match(client, /const KNOWLEDGE_GATEWAY_FUNCTION = 'knowledge-gateway'/);
    assert.doesNotMatch(client, /SERPAPI|NAVER_CLIENT_SECRET|SUPABASE_SERVICE_ROLE_KEY/);
});

test('gateway function orders license, rate, cache, backoff and quota before upstream', () => {
    const source = read('supabase/functions/knowledge-gateway/index.ts');
    const positions = [
        'check_license_status',
        'consume_knowledge_gateway_rate_limit',
        'knowledge_gateway_cache',
        'knowledge_gateway_provider_state',
        'consume_knowledge_provider_quota',
        'route.fetchSnapshot'
    ].map((token) => source.indexOf(token));
    assert.equal(positions.every((position) => position >= 0), true);
    assert.deepEqual([...positions].sort((left, right) => left - right), positions);
    assert.doesNotMatch(source, /console\.(?:log|warn|error)\([^\n]*(?:licenseKey|hwid|serviceRoleKey)/);
});
