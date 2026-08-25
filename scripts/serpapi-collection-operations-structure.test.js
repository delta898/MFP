const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function functionBody(sql, name, nextName) {
    const start = sql.indexOf(`create or replace function public.${name}`);
    const end = nextName ? sql.indexOf(`create or replace function public.${nextName}`, start) : sql.length;
    assert.ok(start >= 0 && end > start, `${name} SQL function must exist`);
    return sql.slice(start, end);
}

test('collection operations state is service-role only and contains no owner data', () => {
    const sql = read('sql/supabase_serpapi_collection_operations.sql');
    for (const table of [
        'knowledge_collection_budget_reservations', 'knowledge_collection_provider_state'
    ]) {
        assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
        assert.match(sql, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`));
        assert.match(sql, new RegExp(`grant all on table public\\.${table} to service_role`));
    }
    assert.doesNotMatch(sql, /owner_id|license_key|hardware|account_email|account_id|api_key/i);
});

test('budget reservation is atomic, idempotent and fixed to 200 per trailing 31 days', () => {
    const sql = read('sql/supabase_serpapi_collection_operations.sql');
    const body = functionBody(sql, 'reserve_knowledge_collection_budget', 'record_knowledge_collection_provider_success');
    const lock = body.indexOf("pg_advisory_xact_lock(hashtextextended('collection-budget:'");
    const duplicate = body.indexOf('operation_id = v_operation_id');
    const count = body.indexOf("reserved_at > v_now - interval '31 days'");
    const deny = body.indexOf('if v_count >= v_limit');
    const insert = body.indexOf('insert into public.knowledge_collection_budget_reservations', deny);
    assert.ok(lock >= 0 && lock < duplicate && duplicate < count && count < deny && deny < insert);
    assert.match(body, /v_limit constant integer := 200/);
    assert.match(body, /'reserved', false, 'duplicate', true/);
    assert.match(body, /'reserved', false, 'duplicate', false/);
    assert.doesNotMatch(body, /request_count\s*=|do update set.*count/is);
});

test('lease checks provider backoff and expires without spending budget', () => {
    const sql = read('sql/supabase_serpapi_collection_operations.sql');
    const body = functionBody(sql, 'acquire_knowledge_collection_lease', 'release_knowledge_collection_lease');
    assert.match(body, /pg_advisory_xact_lock/);
    assert.match(body, /backoff_until is not null and v_state\.backoff_until > v_now/);
    assert.match(body, /lease_expires_at > v_now/);
    assert.match(body, /greatest\(30, least\(coalesce\(p_lease_seconds, 180\), 600\)\)/);
    assert.doesNotMatch(body, /reserve_knowledge_collection_budget|knowledge_collection_budget_reservations/);
});

test('Account diagnostics accept only bounded usage fields', () => {
    const sql = read('sql/supabase_serpapi_collection_operations.sql');
    const body = functionBody(sql, 'record_knowledge_collection_account_status', 'reserve_knowledge_collection_budget');
    assert.match(body, /'checked_at', 'searches_limit', 'searches_used', 'searches_remaining', 'renewal_date'/);
    assert.match(body, /collection account status contains unsupported field/);
    assert.match(body, /interval '10 minutes'/);
    assert.doesNotMatch(body, /account_email|account_id|api_key|raw|payload/);
});

test('Cron defines five daily collection slots, one cleanup and deterministic focused rotation', () => {
    const sql = read('sql/supabase_serpapi_collection_cron.sql');
    const collectionSchedules = [...sql.matchAll(/select cron\.schedule\(\s*'bloggenius-serpapi-(?!cleanup)/g)];
    assert.equal(collectionSchedules.length, 5);
    assert.equal((sql.match(/select cron\.schedule\(/g) || []).length, 6);
    for (const schedule of ['20 15 * * *', '20 21 * * *', '20 0 * * *', '20 6 * * *', '20 12 * * *']) {
        assert.match(sql, new RegExp(schedule.replace(/\*/g, '\\*')));
    }
    for (const lane of ['technology', 'business', 'science', 'culture_lifestyle', 'travel_local']) {
        assert.match(sql, new RegExp(`then '${lane}'|else '${lane}'`));
    }
    assert.match(sql, /time zone 'Asia\/Seoul'/);
    assert.match(sql, /serpapi_collection_project_url/);
    assert.match(sql, /serpapi_collection_collector_secret/);
    assert.match(sql, /cleanup_knowledge_observation_corpus/);
    assert.match(sql, /cleanup_knowledge_collection_operations/);
    assert.doesNotMatch(sql, /SERPAPI_API_KEY|api_key|account_email|account_id/);
});

test('collector custom secret and operation identity are validated before body parsing', () => {
    const edgeFunction = read('supabase/functions/serpapi-news-collector/index.ts');
    const secret = edgeFunction.indexOf('secureEqual(presentedSecret, collectorSecret)');
    const operation = edgeFunction.indexOf('x-collector-operation-id');
    const body = edgeFunction.indexOf('body = await req.json()');
    assert.ok(secret >= 0 && secret < operation && operation < body);
    assert.match(read('supabase/config.toml'), /\[functions\.serpapi-news-collector\]\s+verify_jwt = false/);
    assert.doesNotMatch(edgeFunction, /console\.(?:log|warn|error)\([^\n]*(?:operationId|accountStatus|apiKey|serpApiKey|body)/);
});

