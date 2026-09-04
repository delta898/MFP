const test = require('node:test');
const assert = require('node:assert/strict');
const {
    CARD_NEWS_SHEET_HEADERS
} = require('./ledger-sheet-schema');
const {
    buildEntryKey,
    normalizeOriginalUrl,
    createCardNewsLedgerStore
} = require('./ledger-sheet-store');

function createMemoryGateway(initialRows = []) {
    const values = [[...CARD_NEWS_SHEET_HEADERS], ...initialRows.map((row) => [...row])];
    const calls = { prepare: 0, reads: 0, appends: 0, updates: [] };
    return {
        values,
        calls,
        async prepare() { calls.prepare += 1; },
        async readAll() { calls.reads += 1; return values.map((row) => [...row]); },
        async appendRows(rows) {
            calls.appends += 1;
            const firstRowNumber = values.length + 1;
            rows.forEach((row) => values.push([...row]));
            return { rowNumbers: rows.map((_, index) => firstRowNumber + index) };
        },
        async updateCells(updates) {
            calls.updates.push(...updates);
            updates.forEach((update) => { values[update.rowNumber - 1][update.columnIndex] = update.value; });
            return { updatedCount: updates.length };
        }
    };
}

function valueAt(row, header) {
    return row[CARD_NEWS_SHEET_HEADERS.indexOf(header)];
}

test('cardnews entry key prefers RSS identity and normalizes URL fallbacks', () => {
    assert.equal(buildEntryKey({ kind: 'feed_item', item_key: 'rss-id-1', canonical_url: 'https://example.com/one' }), buildEntryKey({ kind: 'feed_item', item_key: 'rss-id-1', canonical_url: 'https://example.com/two' }));
    assert.equal(
        buildEntryKey({ kind: 'url', canonical_url: 'https://Example.com/article/?utm_source=mail#top' }),
        buildEntryKey({ kind: 'url', canonical_url: 'https://example.com/article' })
    );
    assert.equal(normalizeOriginalUrl('https://Example.com/article/?utm_source=mail#top'), 'https://example.com/article');
    assert.equal(
        buildEntryKey({ kind: 'manuscript', management_id: 'manual-session-1' }),
        buildEntryKey({ kind: 'manuscript', management_id: 'manual-session-1', text: '수정된 본문' })
    );
});

test('cardnews ledger appends each RSS candidate once and preserves source fields', async () => {
    const gateway = createMemoryGateway();
    const store = createCardNewsLedgerStore({ gateway, now: () => '2026-09-05T00:00:00.000Z' });
    const candidate = {
        source: { kind: 'feed_item', item_key: 'rss-1', canonical_url: 'https://blog.example/post/1', title: '첫 글', published_at: '2026-09-04T00:00:00Z' },
        source_platform: 'naver'
    };

    const first = await store.upsertCandidates([candidate]);
    const second = await store.upsertCandidates([candidate]);

    assert.equal(first.createdCount, 1);
    assert.equal(second.createdCount, 0);
    assert.equal(second.existingCount, 1);
    assert.equal(gateway.values.length, 2);
    assert.equal(valueAt(gateway.values[1], '상태'), '후보');
    assert.equal(valueAt(gateway.values[1], '발행 상태'), '미발행');
    assert.equal(valueAt(gateway.values[1], '원문 플랫폼'), 'naver');
    assert.equal(valueAt(gateway.values[1], '글 제목'), '첫 글');
});

test('cardnews ledger updates only approved state fields and leaves identity intact', async () => {
    const gateway = createMemoryGateway();
    const store = createCardNewsLedgerStore({ gateway });
    await store.upsertCandidates([{ source: { kind: 'feed_item', item_key: 'rss-1', canonical_url: 'https://blog.example/post/1', title: '첫 글' } }]);
    const beforeKey = valueAt(gateway.values[1], 'entry_key');
    const updated = await store.updateRow(2, {
        workflowStatus: '제작 완료',
        publishingStatus: '미발행',
        generationId: 'generation-1',
        cardCount: 3
    });

    assert.equal(updated.workflowStatus, '제작 완료');
    assert.equal(valueAt(gateway.values[1], 'entry_key'), beforeKey);
    assert.equal(valueAt(gateway.values[1], 'generation_id'), 'generation-1');
    assert.equal(valueAt(gateway.values[1], '카드 수'), '3');
    assert.equal((await store.findByGenerationId('generation-1')).rowNumber, 2);
    assert.equal(await store.findByGenerationId('missing-generation'), null);
});

test('cardnews ledger updates a generation with one read and skips identical writes', async () => {
    const gateway = createMemoryGateway();
    const store = createCardNewsLedgerStore({ gateway });
    await store.upsertCandidateWithPatch({
        source: { kind: 'url', canonical_url: 'https://example.com/post' },
        title: '글'
    }, {
        workflowStatus: '제작 중',
        generationId: 'generation-1',
        cardCount: 3
    });
    const readsBeforeUpdate = gateway.calls.reads;
    const writesBeforeUpdate = gateway.calls.updates.length;
    await store.updateByGenerationId('generation-1', {
        workflowStatus: '제작 중',
        cardCount: 3
    });
    assert.equal(gateway.calls.reads - readsBeforeUpdate, 1);
    assert.equal(gateway.calls.updates.length, writesBeforeUpdate);

    await store.updateByGenerationId('generation-1', { workflowStatus: '제작 완료' });
    assert.equal(gateway.calls.updates.length, writesBeforeUpdate + 1);
});

test('cardnews ledger rejects invalid independent states', async () => {
    const gateway = createMemoryGateway();
    const store = createCardNewsLedgerStore({ gateway });
    await store.upsertCandidates([{ source: { kind: 'feed_item', item_key: 'rss-1', canonical_url: 'https://blog.example/post/1' } }]);
    await assert.rejects(store.updateRow(2, { workflowStatus: '완료' }), /허용되지 않은 카드뉴스 상태/);
    await assert.rejects(store.updateRow(2, { publishingStatus: '완료' }), /허용되지 않은 카드뉴스 발행 상태/);
});

test('cardnews ledger ignores unknown fields and preserves user-added columns', async () => {
    const headers = [...CARD_NEWS_SHEET_HEADERS, '사용자 메모'];
    const row = new Array(headers.length).fill('');
    row[headers.indexOf('entry_key')] = buildEntryKey({ kind: 'feed_item', item_key: 'rss-1', canonical_url: 'https://blog.example/post/1' });
    row[headers.indexOf('원문 URL')] = 'https://blog.example/post/1';
    row[headers.indexOf('사용자 메모')] = '직접 기록';
    const gateway = createMemoryGateway([row]);
    gateway.values[0] = headers;
    const store = createCardNewsLedgerStore({ gateway });
    await store.updateRow(2, { workflowStatus: '제외', unexpected: 'should-not-write' });
    assert.equal(gateway.values[1][headers.indexOf('사용자 메모')], '직접 기록');
    assert.equal(gateway.calls.updates.length, 1);
});
