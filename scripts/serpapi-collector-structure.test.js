const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function sourceFiles(relativeDirectory) {
    const directory = path.join(root, relativeDirectory);
    if (!fs.existsSync(directory)) return [];
    return fs.readdirSync(directory, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => path.join(entry.parentPath || entry.path, entry.name))
        .filter((file) => /\.(?:js|ts|html|css|json)$/.test(file));
}

test('SerpApi developer credentials remain server-side', () => {
    const edgeFunction = read('supabase/functions/serpapi-news-collector/index.ts');
    assert.match(edgeFunction, /Deno\.env\.get\("SERPAPI_API_KEY"\)/);
    assert.match(edgeFunction, /Deno\.env\.get\("SERPAPI_COLLECTOR_SECRET"\)/);

    for (const directory of ['src', 'ui']) {
        for (const file of sourceFiles(directory)) {
            const contents = fs.readFileSync(file, 'utf8');
            assert.doesNotMatch(contents, /SERPAPI_API_KEY|SERPAPI_COLLECTOR_SECRET/,
                `${path.relative(root, file)} must not know server collector secrets`);
        }
    }
});

test('provider fixes endpoint, engine and lane queries in server code', () => {
    const provider = read('supabase/functions/_shared/knowledge-provider-serpapi-google-news.ts');
    assert.match(provider, /const SERPAPI_ENDPOINT = "https:\/\/serpapi\.com\/search\.json"/);
    assert.match(provider, /url\.searchParams\.set\("engine", "google_news"\)/);
    assert.match(provider, /SERPAPI_GOOGLE_NEWS_LANES/);
    assert.match(provider, /if \(definition\.query\) url\.searchParams\.set\("q", definition\.query\)/);
    assert.doesNotMatch(provider, /request\.(?:query|q|endpoint|engine|apiKey|api_key)/);
});

test('collector authenticates before parsing a bounded contract request', () => {
    const edgeFunction = read('supabase/functions/serpapi-news-collector/index.ts');
    const methodCheck = edgeFunction.indexOf('req.method !== "POST"');
    const authCheck = edgeFunction.indexOf('secureEqual(presentedSecret, collectorSecret)');
    const bodyRead = edgeFunction.indexOf('body = await req.json()');
    const serviceRun = edgeFunction.indexOf('service.run(body, operationId)');
    assert.ok(methodCheck >= 0 && methodCheck < authCheck);
    assert.ok(authCheck < bodyRead && bodyRead < serviceRun);

    const contract = read('supabase/functions/_shared/serpapi-collection-contract.ts');
    assert.match(contract, /new Set\(\["schema_version", "lane", "trigger"\]\)/);
});

test('collector returns aggregate runs and logs stable codes only', () => {
    const edgeFunction = read('supabase/functions/serpapi-news-collector/index.ts');
    assert.match(edgeFunction, /fetched_count: run\.fetched_count/);
    assert.match(edgeFunction, /accepted_count: run\.accepted_count/);
    assert.match(edgeFunction, /attempted_upstream: run\.attempted_upstream/);
    assert.match(edgeFunction, /error_code: run\.error_code/);
    assert.match(edgeFunction, /console\.warn\("SERPAPI_COLLECTION_FAILED", \{ code: failure\.code \}\)/);
    assert.doesNotMatch(edgeFunction, /console\.(?:log|warn|error)\([^\n]*(?:body|apiKey|serpApiKey|url|error\.message)/);
    assert.doesNotMatch(edgeFunction, /observations:\s*run\.|api_key:\s*|SERPAPI_API_KEY\s*:/);
});
