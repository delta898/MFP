const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('knowledge gateway SQL keeps cache and protection state service-role only', () => {
    const sql = read('supabase/migrations/202608270013_knowledge_gateway.sql');
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

test('gateway registers upstream Naver news and stored SerpApi corpus without desktop credentials', () => {
    const providers = read('supabase/functions/_shared/knowledge-gateway-providers.ts');
    const naverNews = read('supabase/functions/_shared/knowledge-provider-naver-news.ts');
    const naverBlogReference = read('supabase/functions/_shared/knowledge-provider-naver-blog-reference.ts');
    const serpApiCorpus = read('supabase/functions/_shared/knowledge-provider-serpapi-corpus.ts');
    const transport = read('src/knowledge/transports/server-gateway.js');
    const client = read('src/knowledge/server-gateway-client.js');
    assert.match(providers, /createNaverNewsRoute/);
    assert.match(providers, /createNaverBlogReferenceRoute/);
    assert.match(providers, /createSerpApiCorpusRoute/);
    assert.match(providers, /new Map<string, KnowledgeProviderRoute>/);
    assert.match(naverNews, /https:\/\/openapi\.naver\.com\/v1\/search\/news\.json/);
    assert.doesNotMatch(naverNews, /naverapihub|NAVER_API_HUB/);
    assert.match(naverNews, /NAVER_CLIENT_ID/);
    assert.match(naverNews, /NAVER_CLIENT_SECRET/);
    assert.doesNotMatch(naverNews, /serpapi\.com/i);
    assert.match(naverBlogReference, /https:\/\/openapi\.naver\.com\/v1\/search\/blog\.json/);
    assert.match(naverBlogReference, /NAVER_CLIENT_ID/);
    assert.match(naverBlogReference, /NAVER_CLIENT_SECRET/);
    assert.doesNotMatch(naverBlogReference, /NAVER_API_HUB/);
    assert.match(serpApiCorpus, /read_knowledge_observations/);
    assert.doesNotMatch(serpApiCorpus, /SERPAPI_API_KEY|serpapi\.com\/search/i);
    assert.doesNotMatch(transport, /api[_-]?key|authorization|base[_-]?url/i);
    assert.match(client, /const KNOWLEDGE_GATEWAY_FUNCTION = 'knowledge-gateway'/);
    assert.doesNotMatch(client, /SERPAPI|NAVER_CLIENT_SECRET|SUPABASE_SERVICE_ROLE_KEY/);
});

test('blog reference cache kind is added through an ordered migration', () => {
    const migration = read('supabase/migrations/202608290000_add_blog_reference_gateway.sql');
    assert.match(migration, /drop constraint if exists knowledge_gateway_cache_kind_check/i);
    assert.match(migration, /'trends', 'news', 'blog_reference'/i);
});

test('desktop external-reference flow uses the fixed gateway and has no direct provider credential access', () => {
    const gateway = read('src/content/reference-search-gateway.js');
    const utils = read('src/utils.js');
    const core = read('src/core.js');
    assert.match(gateway, /kind: REFERENCE_KIND/);
    assert.match(gateway, /purpose: REFERENCE_PURPOSE/);
    assert.doesNotMatch(gateway, /NAVER_CLIENT_(?:ID|SECRET)|openapi\.naver\.com/);
    const topPostsStart = utils.indexOf('fetchNaverBlogTopPosts:');
    const topPostsEnd = utils.indexOf('_resolveOwnBlogId:', topPostsStart);
    const topPosts = utils.slice(topPostsStart, topPostsEnd);
    assert.match(topPosts, /searchOptionalReferences/);
    assert.doesNotMatch(topPosts, /NAVER_CLIENT_(?:ID|SECRET)|openapi\.naver\.com/);
    assert.match(core, /관련 최신 글 수집 및 분석 시작/);
});

test('stored corpus reads occur after license rate protection and before upstream machinery', () => {
    const source = read('supabase/functions/knowledge-gateway/index.ts');
    const license = source.indexOf('check_license_status');
    const rate = source.indexOf('consume_knowledge_gateway_rate_limit');
    const stored = source.indexOf('route.execution === "stored_corpus"');
    const cache = source.indexOf('knowledge_gateway_cache');
    const quota = source.indexOf('consume_knowledge_provider_quota');
    assert.ok(license >= 0 && license < rate && rate < stored && stored < cache && cache < quota);
    assert.match(source, /KNOWLEDGE_CORPUS_READ_FAILED/);
    assert.match(source, /CORPUS_UNAVAILABLE/);
});

test('Naver Developers and API Hub credentials have explicit non-fallback owners', () => {
    const naverNews = read('supabase/functions/_shared/knowledge-provider-naver-news.ts');
    const keywordResearch = read('supabase/functions/keyword-research/index.ts');
    assert.match(naverNews, /NAVER_CLIENT_ID/);
    assert.match(naverNews, /NAVER_CLIENT_SECRET/);
    assert.doesNotMatch(naverNews, /NAVER_API_HUB/);
    assert.match(keywordResearch, /NAVER_API_HUB_CLIENT_ID/);
    assert.match(keywordResearch, /NAVER_API_HUB_CLIENT_SECRET/);
    assert.doesNotMatch(keywordResearch, /Deno\.env\.get\("NAVER_CLIENT_(?:ID|SECRET)"\)/);
});

test('empty semantic queries short-circuit before cache and provider quota', () => {
    const source = read('supabase/functions/knowledge-gateway/index.ts');
    const shortCircuit = source.indexOf('route.shouldFetch');
    const cache = source.indexOf('knowledge_gateway_cache');
    const quota = source.indexOf('consume_knowledge_provider_quota');
    assert.equal(shortCircuit >= 0, true);
    assert.equal(shortCircuit < cache, true);
    assert.equal(shortCircuit < quota, true);
});

test('gateway function orders license, rate, cache, backoff and quota before upstream', () => {
    const source = read('supabase/functions/knowledge-gateway/index.ts');
    const positions = [
        'check_license_status',
        'consume_knowledge_gateway_rate_limit',
        'knowledge_gateway_cache',
        'knowledge_gateway_provider_state',
        'consume_knowledge_provider_quota',
        'const upstream = await withTimeout(route.fetchSnapshot'
    ].map((token) => source.indexOf(token));
    assert.equal(positions.every((position) => position >= 0), true);
    assert.deepEqual([...positions].sort((left, right) => left - right), positions);
    assert.doesNotMatch(source, /console\.(?:log|warn|error)\([^\n]*(?:licenseKey|hwid|serviceRoleKey)/);
});
