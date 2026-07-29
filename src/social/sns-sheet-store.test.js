const test = require('node:test');
const assert = require('node:assert/strict');
const { SNS_SHEET_HEADERS } = require('./sns-sheet-schema');
const {
    normalizeOriginalUrl,
    buildEntryKey,
    buildDeliveryKey,
    parseSheetRows,
    createSnsSheetStore
} = require('./sns-sheet-store');

function createMemoryGateway(initialRows = []) {
    const values = [[...SNS_SHEET_HEADERS], ...initialRows.map((row) => [...row])];
    let prepareCount = 0;

    return {
        values,
        get prepareCount() {
            return prepareCount;
        },
        async prepare() {
            prepareCount += 1;
        },
        async readAll() {
            return values.map((row) => [...row]);
        },
        async appendRows(rows) {
            const startRow = values.length + 1;
            values.push(...rows.map((row) => [...row]));
            return {
                rowNumbers: rows.map((_, index) => startRow + index)
            };
        },
        async updateCells(updates) {
            for (const update of updates) {
                const rowIndex = update.rowNumber - 1;
                while (values.length <= rowIndex) values.push([]);
                values[rowIndex][update.columnIndex] = update.value;
            }
            return { updatedCount: updates.length };
        }
    };
}

function getCell(row, header) {
    return row[SNS_SHEET_HEADERS.indexOf(header)];
}

test('SNS keys normalize URLs and remain deterministic', () => {
    assert.equal(
        normalizeOriginalUrl('https://Example.com/post/?utm_source=test&b=2&a=1#section'),
        'https://example.com/post?a=1&b=2'
    );

    const fromUrlA = buildEntryKey({ url: 'https://example.com/post?utm_source=a' });
    const fromUrlB = buildEntryKey({ url: 'https://EXAMPLE.com/post/' });
    assert.equal(fromUrlA, fromUrlB);
    assert.equal(buildEntryKey({ guid: 'guid-1', url: 'https://a.example' }), buildEntryKey({ guid: 'guid-1' }));
    assert.equal(buildDeliveryKey(fromUrlA, 'channel-1'), buildDeliveryKey(fromUrlB, 'channel-1'));
    assert.notEqual(buildDeliveryKey(fromUrlA, 'channel-1'), buildDeliveryKey(fromUrlA, 'channel-2'));
});

test('SNS row parser follows reordered headers and ignores user columns', () => {
    const headers = ['사용자 메모', '상태', 'channel_id', ...SNS_SHEET_HEADERS.filter(
        (header) => header !== '상태' && header !== 'channel_id'
    )];
    const row = new Array(headers.length).fill('');
    row[headers.indexOf('사용자 메모')] = '보존';
    row[headers.indexOf('상태')] = '대기';
    row[headers.indexOf('channel_id')] = 'channel-1';
    row[headers.indexOf('delivery_key')] = 'delivery-1';
    row[headers.indexOf('entry_key')] = 'entry-1';

    const parsed = parseSheetRows([headers, row]);

    assert.equal(parsed.items[0].status, '대기');
    assert.equal(parsed.items[0].channelId, 'channel-1');
    assert.equal(parsed.items[0].deliveryKey, 'delivery-1');
    assert.equal(parsed.headerMap.status, 1);
});

test('SNS Sheet Store appends one row per channel and never backfills a tracked entry', async () => {
    const gateway = createMemoryGateway();
    const store = createSnsSheetStore({ gateway });
    const entry = {
        guid: 'rss-guid-1',
        sourcePlatform: 'wordpress',
        title: '새 글',
        summary: 'RSS에서 가져온 글 요약',
        hashtags: '#새글 #블로그',
        originalUrl: 'https://blog.example/post/1',
        imageUrl: 'https://blog.example/image.jpg',
        rssPublishedAt: '2026-07-29T01:00:00Z'
    };
    const channels = [
        { id: 'channel-1', service: 'threads', displayName: 'Threads' },
        { id: 'channel-2', service: 'bluesky', displayName: 'Blue Sky' }
    ];

    const first = await store.appendEntryDeliveries({ entry, channels });

    assert.equal(first.addedCount, 2);
    assert.deepEqual(first.rowNumbers, [2, 3]);
    assert.equal(getCell(gateway.values[1], '상태'), '대기');
    assert.equal(getCell(gateway.values[1], '원문 플랫폼'), 'wordpress');
    assert.equal(getCell(gateway.values[1], '글 요약'), 'RSS에서 가져온 글 요약');
    assert.equal(getCell(gateway.values[1], '해시태그'), '#새글 #블로그');
    assert.equal(getCell(gateway.values[2], 'channel_id'), 'channel-2');
    assert.equal(first.deliveryKeys.length, 2);

    const duplicate = await store.appendEntryDeliveries({
        entry,
        channels: [...channels, { id: 'channel-3', service: 'facebook', displayName: 'Facebook' }]
    });

    assert.equal(duplicate.addedCount, 0);
    assert.equal(duplicate.reason, 'entry_already_tracked');
    assert.equal(gateway.values.length, 3);
});

test('SNS Sheet Store appends a feed batch with one read and one write', async () => {
    const gateway = createMemoryGateway();
    let readCount = 0;
    let appendCount = 0;
    const originalReadAll = gateway.readAll;
    const originalAppendRows = gateway.appendRows;
    gateway.readAll = async () => {
        readCount += 1;
        return originalReadAll();
    };
    gateway.appendRows = async (rows) => {
        appendCount += 1;
        return originalAppendRows(rows);
    };
    const store = createSnsSheetStore({ gateway });

    const result = await store.appendEntriesDeliveries({
        entries: [
            {
                entry: {
                    guid: 'batch-1',
                    sourcePlatform: 'naver',
                    originalUrl: 'https://blog.naver.com/example/10'
                },
                status: '대기'
            },
            {
                entry: {
                    guid: 'batch-2',
                    sourcePlatform: 'wordpress',
                    originalUrl: 'https://blog.example/post/10'
                },
                status: '건너뜀'
            }
        ],
        channels: [
            { id: 'channel-1', service: 'threads' },
            { id: 'channel-2', service: 'bluesky' }
        ]
    });

    assert.equal(result.addedEntryCount, 2);
    assert.equal(result.addedCount, 4);
    assert.equal(readCount, 1);
    assert.equal(appendCount, 1);
    assert.equal(getCell(gateway.values[1], '상태'), '대기');
    assert.equal(getCell(gateway.values[3], '상태'), '건너뜀');
});

test('SNS Sheet Store returns the lowest pending row and records processing results', async () => {
    const gateway = createMemoryGateway();
    const store = createSnsSheetStore({
        gateway,
        now: () => '2026-07-29T12:00:00.000Z'
    });
    await store.appendEntryDeliveries({
        entry: {
            guid: 'rss-guid-2',
            sourcePlatform: 'naver',
            title: '네이버 글',
            originalUrl: 'https://blog.naver.com/example/1'
        },
        channels: [
            { id: 'channel-1', service: 'threads', displayName: 'Threads' },
            { id: 'channel-2', service: 'bluesky', displayName: 'Blue Sky' }
        ]
    });

    await store.updateRow(2, { status: '완료', log: '기존 기록' });
    const pending = await store.findFirstPending();
    assert.equal(pending.rowNumber, 3);

    await store.markProcessing(3, '발행 시작');
    await store.markCompleted(3, { bufferPostId: 'buffer-post-1', log: '발행 성공' });

    const rows = await store.listRows();
    const completed = rows.find((row) => row.rowNumber === 3);
    assert.equal(completed.status, '완료');
    assert.equal(completed.processedAt, '2026-07-29T12:00:00.000Z');
    assert.equal(completed.bufferPostId, 'buffer-post-1');
    assert.equal(completed.log, '발행 시작 | 발행 성공');
});

test('SNS Sheet Store selects and updates the first pending entry as a channel group', async () => {
    const gateway = createMemoryGateway();
    const store = createSnsSheetStore({
        gateway,
        now: () => '2026-07-29T14:00:00.000Z'
    });
    await store.appendEntryDeliveries({
        entry: {
            guid: 'group-entry-1',
            sourcePlatform: 'naver',
            title: '첫 번째 글',
            originalUrl: 'https://blog.naver.com/example/group-1'
        },
        channels: [
            { id: 'channel-1', service: 'threads' },
            { id: 'channel-2', service: 'bluesky' }
        ]
    });
    await store.appendEntryDeliveries({
        entry: {
            guid: 'group-entry-2',
            sourcePlatform: 'naver',
            title: '두 번째 글',
            originalUrl: 'https://blog.naver.com/example/group-2'
        },
        channels: [{ id: 'channel-1', service: 'threads' }]
    });

    const group = await store.findFirstPendingGroup();
    assert.equal(group.rows.length, 2);
    assert.deepEqual(group.rows.map((row) => row.rowNumber), [2, 3]);

    await store.markGroupProcessing(group.rows, '원문 글 묶음 발행 시작');
    await store.applyDeliveryResults([
        { rowNumber: 2, status: '완료', bufferPostId: 'post-1', log: '발행 성공' },
        { rowNumber: 3, status: '실패', log: '채널 오류' }
    ]);

    const rows = await store.listRows();
    assert.equal(rows[0].status, '완료');
    assert.equal(rows[0].bufferPostId, 'post-1');
    assert.equal(rows[1].status, '실패');
    assert.match(rows[1].log, /원문 글 묶음 발행 시작 \| 채널 오류/);
    assert.equal(rows[2].status, '대기');
});

test('SNS Sheet Store saves generated hashtags only into blank rows for the same entry', async () => {
    const gateway = createMemoryGateway();
    const store = createSnsSheetStore({ gateway });
    const appended = await store.appendEntryDeliveries({
        entry: {
            guid: 'hashtag-entry',
            sourcePlatform: 'wordpress',
            title: '해시태그 저장 글',
            originalUrl: 'https://blog.example/hashtags'
        },
        channels: [
            { id: 'channel-1', service: 'threads' },
            { id: 'channel-2', service: 'bluesky' }
        ]
    });
    gateway.values[2][SNS_SHEET_HEADERS.indexOf('해시태그')] = '#사용자입력';

    const result = await store.saveEntryHashtags(appended.entryKey, '#블로그 #자동화');
    const rows = await store.listRows();

    assert.equal(result.updatedCount, 1);
    assert.equal(rows[0].hashtags, '#블로그 #자동화');
    assert.equal(rows[1].hashtags, '#사용자입력');
});

test('SNS Sheet Store skips only pending rows from a disabled source', async () => {
    const gateway = createMemoryGateway();
    const store = createSnsSheetStore({
        gateway,
        now: () => '2026-07-29T13:00:00.000Z'
    });
    await store.appendEntryDeliveries({
        entry: {
            guid: 'naver-entry',
            sourcePlatform: 'naver',
            originalUrl: 'https://blog.naver.com/example/2'
        },
        channels: [{ id: 'channel-1', service: 'threads', displayName: 'Threads' }]
    });
    await store.appendEntryDeliveries({
        entry: {
            guid: 'wordpress-entry',
            sourcePlatform: 'wordpress',
            originalUrl: 'https://blog.example/post/2'
        },
        channels: [{ id: 'channel-1', service: 'threads', displayName: 'Threads' }]
    });

    const result = await store.skipPendingBySource('naver');
    const rows = await store.listRows();

    assert.deepEqual(result.rowNumbers, [2]);
    assert.equal(rows[0].status, '건너뜀');
    assert.equal(rows[0].processedAt, '2026-07-29T13:00:00.000Z');
    assert.match(rows[0].log, /SNS 발행 대상 블로그에서 제외됨/);
    assert.equal(rows[1].status, '대기');
});

test('SNS Sheet Store rejects unsupported status and more than three channels', async () => {
    const store = createSnsSheetStore({ gateway: createMemoryGateway() });
    const entry = { guid: 'entry', originalUrl: 'https://example.com/post' };

    await assert.rejects(
        store.appendEntryDeliveries({
            entry,
            status: '재시도',
            channels: [{ id: 'channel-1' }]
        }),
        /허용되지 않은 SNS 상태/
    );
    await assert.rejects(
        store.appendEntryDeliveries({
            entry,
            channels: [1, 2, 3, 4].map((number) => ({ id: `channel-${number}` }))
        }),
        /최대 3개/
    );
});
