const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('SerpApi collection contract is server-owned, deterministic and credential free', () => {
    const contract = read('supabase/functions/_shared/serpapi-collection-contract.ts');
    assert.match(contract, /SERPAPI_COLLECTION_LANES/);
    assert.match(contract, /SERPAPI_COLLECTION_MAX_RETENTION_MS = 14 \* 24 \* 60 \* 60 \* 1000/);
    assert.match(contract, /SERPAPI_NEWS_PROVIDER_ID = "serpapi-google-news"/);
    assert.doesNotMatch(contract, /fetch\s*\(|serpapi\.com|Deno\.env|getEnv|generateContent|openai/i);
});

test('collection request cannot inject vendor execution parameters', () => {
    const contract = read('supabase/functions/_shared/serpapi-collection-contract.ts');
    const requestStart = contract.indexOf('export function normalizeSerpApiCollectionRequest');
    const requestEnd = contract.indexOf('export async function normalizeSerpApiObservation');
    const requestContract = contract.slice(requestStart, requestEnd);
    assert.match(requestContract, /new Set\(\["schema_version", "lane", "trigger"\]\)/);
    assert.doesNotMatch(requestContract, /query|engine|endpoint|country|locale|api_key/i);
});

test('active plans preserve staged branches and server-push client-read boundaries', () => {
    const mainPlan = read('docs/plans/active/serpapi-collection-main-plan.md');
    const stagePlan = read('docs/plans/active/serpapi-collection-01-contracts-plan.md');
    const decision = read('docs/decisions/2026-08-25-server-managed-serpapi-corpus.md');
    for (let stage = 1; stage <= 7; stage += 1) {
        assert.match(mainPlan, new RegExp(`### Stage ${stage} —`));
    }
    assert.match(mainPlan, /user's request마다 SerpApi를 호출하지 않는다|사용자의 요청마다 SerpApi를 호출하지 않는다/);
    assert.match(stagePlan, /No SQL, Edge Function network call, scheduler or UI change belongs in this stage/);
    assert.match(decision, /Accepted on 2026-08-25/);
    assert.match(decision, /desktop action never directly triggers the SerpApi upstream/);
});
