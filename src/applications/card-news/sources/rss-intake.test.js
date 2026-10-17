const test = require('node:test');
const assert = require('node:assert/strict');
const { createCardNewsRssIntake } = require('./rss-intake');

function source(id, platform = 'naver') {
    return {
        kind: 'feed_item',
        item_key: id,
        canonical_url: `https://example.com/${id}`,
        title: `글 ${id}`,
        source_platform: platform,
        published_at: '2026-09-05T00:00:00.000Z'
    };
}

test('RSS intake sends all discovered sources through one append-only ledger batch', async () => {
    const calls = [];
    const intake = createCardNewsRssIntake({
        CONFIG: { GOOGLE_SHEET_ID: 'sheet-1' },
        async discoverConfiguredArticles() {
            return {
                articles: [source('one'), source('two', 'wordpress')],
                failures: [],
                configured_feed_count: 2
            };
        },
        ledgerStore: {
            async upsertCandidates(candidates) {
                calls.push(candidates);
                return { createdCount: 2, existingCount: 0 };
            }
        }
    });

    const result = await intake.collect();

    assert.equal(calls.length, 1);
    assert.equal(calls[0].length, 2);
    assert.equal(result.createdCount, 2);
    assert.equal(result.discoveredCount, 2);
});

test('RSS intake reports one feed failure while preserving healthy discoveries', async () => {
    const warnings = [];
    const intake = createCardNewsRssIntake({
        CONFIG: { GOOGLE_SHEET_ID: 'sheet-1' },
        async discoverConfiguredArticles() {
            return {
                articles: [source('one')],
                failures: [{ source_platform: 'wordpress', message: 'timeout' }],
                configured_feed_count: 2
            };
        },
        ledgerStore: {
            async upsertCandidates() { return { createdCount: 1, existingCount: 0 }; }
        },
        logger: { warn(message) { warnings.push(message); } }
    });

    const result = await intake.collect('scheduled');

    assert.equal(result.success, true);
    assert.equal(result.failureCount, 1);
    assert.match(warnings[0], /wordpress/);
});

test('RSS intake skips network and Sheet access until a management Sheet is configured', async () => {
    let discoveries = 0;
    let writes = 0;
    const intake = createCardNewsRssIntake({
        CONFIG: {},
        async discoverConfiguredArticles() { discoveries += 1; return {}; },
        ledgerStore: { async upsertCandidates() { writes += 1; } }
    });

    const result = await intake.collect();

    assert.equal(result.reason, 'sheet_not_configured');
    assert.equal(discoveries, 0);
    assert.equal(writes, 0);
});

test('RSS intake prevents overlapping collection', async () => {
    let release;
    let discoveries = 0;
    const waiting = new Promise((resolve) => { release = resolve; });
    const intake = createCardNewsRssIntake({
        CONFIG: { GOOGLE_SHEET_ID: 'sheet-1' },
        async discoverConfiguredArticles() {
            discoveries += 1;
            await waiting;
            return { articles: [], failures: [], configured_feed_count: 1 };
        },
        ledgerStore: { async upsertCandidates() { throw new Error('not expected'); } }
    });

    const first = intake.collect();
    const second = await intake.collect();
    release();
    await first;

    assert.equal(second.reason, 'in_progress');
    assert.equal(discoveries, 1);
});
