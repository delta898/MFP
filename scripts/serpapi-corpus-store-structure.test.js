const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sql = fs.readFileSync(
    path.resolve(__dirname, '../supabase/migrations/202608270015_serpapi_observation_corpus.sql'),
    'utf8'
);

test('observation corpus tables are constrained and service-role only', () => {
    for (const table of ['knowledge_observations', 'knowledge_collection_runs']) {
        assert.match(sql, new RegExp(`create table if not exists public\\.${table}`));
        assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
        assert.match(sql, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`));
        assert.match(sql, new RegExp(`grant all on table public\\.${table} to service_role`));
    }
    assert.match(sql, /primary key \(provider_id, observation_id\)/);
    assert.match(sql, /unique \(provider_id, canonical_url\)/);
    assert.match(sql, /expires_at <= last_observed_at \+ interval '14 days'/);
    assert.doesNotMatch(sql.slice(0, sql.indexOf('create table if not exists public.knowledge_collection_runs')), /\bpayload\b|raw_response|article_body|owner_id|license_key|hwid/i);
});

test('corpus RPCs are bounded security-definer operations unavailable to clients', () => {
    for (const [name, signature] of [
        ['upsert_knowledge_observations', 'text, jsonb'],
        ['record_knowledge_collection_run', 'jsonb'],
        ['read_knowledge_observations', 'text, text, text\\[\\], text\\[\\], text\\[\\], text\\[\\], integer'],
        ['cleanup_knowledge_observation_corpus', 'integer, integer']
    ]) {
        assert.match(sql, new RegExp(`create or replace function public\\.${name}`));
        const functionStart = sql.indexOf(`create or replace function public.${name}`);
        const functionEnd = sql.indexOf('$$;', functionStart);
        const body = sql.slice(functionStart, functionEnd);
        assert.match(body, /security definer/);
        assert.match(body, /set search_path = public/);
        assert.match(sql, new RegExp(`revoke all on function public\\.${name}\\(\\s*${signature}`));
        assert.match(sql, new RegExp(`grant execute on function public\\.${name}\\(\\s*${signature}`));
    }
});

test('batch upsert rejects vendor leakage and duplicate identities before persistence', () => {
    const start = sql.indexOf('create or replace function public.upsert_knowledge_observations');
    const end = sql.indexOf('create or replace function public.record_knowledge_collection_run');
    const body = sql.slice(start, end);
    assert.match(body, /jsonb_array_length\(p_observations\)/);
    assert.match(body, /v_input_count > 50/);
    assert.match(body, /jsonb_object_keys\(entry\.value\)/);
    assert.match(body, /observation contains an unsupported field/);
    assert.match(body, /count\(distinct entry\.value->>'observation_id'\)/);
    assert.match(body, /count\(distinct entry\.value->>'url'\)/);
    assert.match(body, /on conflict \(provider_id, observation_id\) do nothing/);
    assert.match(body, /observation_count = existing\.observation_count \+ 1/);
});

test('read and cleanup primitives enforce expiry, exclusion and bounded retention', () => {
    const readStart = sql.indexOf('create or replace function public.read_knowledge_observations');
    const cleanupStart = sql.indexOf('create or replace function public.cleanup_knowledge_observation_corpus');
    const readBody = sql.slice(readStart, cleanupStart);
    const cleanupBody = sql.slice(cleanupStart);
    assert.match(readBody, /item\.expires_at > clock_timestamp\(\)/);
    assert.match(readBody, /cardinality\(coalesce\(p_exclude_ids, '\{\}'\)\) > 100/);
    assert.match(readBody, /limit v_limit/);
    assert.match(cleanupBody, /expires_at < v_now - make_interval\(hours => v_grace_hours\)/);
    assert.match(cleanupBody, /completed_at < v_now - make_interval\(days => v_run_days\)/);
});

test('corpus SQL remains separate from short-lived gateway cache schema', () => {
    assert.doesNotMatch(sql, /knowledge_gateway_cache|knowledge_gateway_rate_limits/);
    assert.match(sql, /Stage 4 will schedule cleanup_knowledge_observation_corpus/);
});
