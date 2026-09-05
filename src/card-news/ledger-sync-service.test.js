const test = require('node:test');
const assert = require('node:assert/strict');
const {
    buildLedgerCandidate,
    workflowStatusForGeneration,
    buildPublishingPatch,
    createCardNewsLedgerSyncService
} = require('./ledger-sync-service');

test('ledger candidates cover feed, URL, and directly entered text identities', () => {
    assert.equal(buildLedgerCandidate({ kind: 'feed_item', source_platform: 'naver' }, {}).source_platform, 'naver');
    assert.equal(buildLedgerCandidate({ kind: 'feed_item', source_platform: 'rss-123', feed_label: '업계 뉴스' }, {}).source_platform, '업계 뉴스');
    assert.equal(buildLedgerCandidate({ kind: 'url' }, {}).source_platform, 'URL 직접 입력');
    assert.equal(buildLedgerCandidate({ kind: 'manuscript', management_id: 'manual-1' }, {}).source_platform, '직접 입력');
});

test('generation and publishing states are mapped independently', () => {
    assert.equal(workflowStatusForGeneration({ status: 'prompt_ready' }), '제작 중');
    assert.equal(workflowStatusForGeneration({ status: 'completed' }), '제작 완료');
    assert.deepEqual(buildPublishingPatch({
        confirmed: true,
        results: [
            { success: true, channel_name: 'Threads', external_link: 'https://threads.example/one' },
            { success: false, service: 'bluesky', message: '전송 실패' }
        ]
    }, () => '2026-09-05T01:00:00.000Z'), {
        publishingStatus: '일부 완료',
        channels: 'Threads, bluesky',
        postLinks: 'https://threads.example/one',
        processedAt: '2026-09-05T01:00:00.000Z',
        lastError: '전송 실패'
    });
});

test('ledger synchronization records generation and publication on the same row', async () => {
    const calls = [];
    const store = {
        async upsertCandidates(candidates) {
            calls.push(['upsert', candidates]);
            return { results: [{ rowNumber: 4 }] };
        },
        async findByGenerationId(id) {
            calls.push(['find', id]);
            return { rowNumber: 4 };
        },
        async updateRow(rowNumber, patch) {
            calls.push(['update', rowNumber, patch]);
            return { rowNumber, ...patch };
        },
        async upsertCandidateWithPatch(candidate, patch) {
            calls.push(['upsert-and-update', candidate, patch]);
            return { rowNumber: 4, ...patch };
        },
        async updateByGenerationId(id, patch) {
            calls.push(['update-by-generation', id, patch]);
            return { rowNumber: 4, ...patch };
        }
    };
    const service = createCardNewsLedgerSyncService({ store, now: () => '2026-09-05T01:00:00.000Z' });
    await service.recordGeneration({
        source: { kind: 'manuscript', management_id: 'manual-1' },
        title: '직접 쓴 글'
    }, { id: 'generation-1', status: 'prompt_ready', cards: [{}, {}] });
    await service.recordGenerationProgress({ id: 'generation-1', status: 'completed', cards: [{}, {}] });
    await service.recordPublishing('generation-1', {
        confirmed: true,
        results: [{ success: true, service: 'threads', external_link: 'https://threads.example/post' }]
    });

    assert.equal(calls.filter(([kind]) => kind === 'upsert-and-update').length, 1);
    assert.deepEqual([
        calls.find(([kind]) => kind === 'upsert-and-update')[2].workflowStatus,
        ...calls.filter(([kind]) => kind === 'update-by-generation').map((call) => call[2].workflowStatus).filter(Boolean)
    ], ['제작 중', '제작 완료']);
    assert.equal(calls.at(-1)[2].publishingStatus, '발행 완료');
});

test('ledger failures are logged and never replace the successful local result', async () => {
    const warnings = [];
    const service = createCardNewsLedgerSyncService({
        store: { async upsertCandidates() { throw new Error('sheet unavailable'); } },
        logger: { warn(message) { warnings.push(message); } }
    });
    assert.equal(await service.registerSources([{ kind: 'url', canonical_url: 'https://example.com' }]), null);
    assert.equal(warnings.length, 1);
});

test('an unchanged RSS source set is registered only once per app session', async () => {
    let upserts = 0;
    const service = createCardNewsLedgerSyncService({
        store: {
            async upsertCandidates() {
                upserts += 1;
                return { success: true };
            }
        }
    });
    const sources = [{ kind: 'feed_item', item_key: 'rss-1', canonical_url: 'https://example.com/1' }];
    await service.registerSources(sources);
    assert.deepEqual(await service.registerSources(sources), { success: true, skipped: true });
    assert.equal(upserts, 1);
    await service.registerSources([...sources, { kind: 'feed_item', item_key: 'rss-2', canonical_url: 'https://example.com/2' }]);
    assert.equal(upserts, 2);
});

test('cached RSS annotations follow generation and publishing updates in the same app session', async () => {
    const source = { kind: 'feed_item', item_key: 'rss-1', canonical_url: 'https://example.com/1' };
    let row = {
        entryKey: require('./ledger-sheet-store').buildEntryKey(source),
        workflowStatus: '후보', publishingStatus: '미발행', generationId: ''
    };
    const service = createCardNewsLedgerSyncService({
        store: {
            async upsertCandidates() { return { success: true, results: [{ entryKey: row.entryKey, item: { ...row } }] }; },
            async upsertCandidateWithPatch(_candidate, patch) { row = { ...row, ...patch }; return { ...row }; },
            async updateByGenerationId(_id, patch) { row = { ...row, ...patch }; return { ...row }; },
            async listRows() { return [row, { generationId: '' }]; }
        },
        now: () => '2026-09-05T02:00:00.000Z'
    });
    const registered = await service.registerSources([source]);
    await service.recordGeneration({ source, title: '글' }, { id: 'generation-1', status: 'completed', cards: [{}] });
    await service.recordPublishing('generation-1', {
        confirmed: true,
        results: [{ success: true, channel_name: 'Threads', external_link: 'https://threads.example/1' }]
    });
    const annotated = service.annotateSources([source], await service.registerSources([source]));
    assert.equal(registered.results[0].item.publishingStatus, '미발행');
    assert.equal(annotated[0].management.publishing_status, '발행 완료');
    assert.equal((await service.listManagedRows()).length, 1);
});
