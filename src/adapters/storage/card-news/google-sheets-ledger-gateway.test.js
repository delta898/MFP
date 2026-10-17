const test = require('node:test');
const assert = require('node:assert/strict');
const { createCardNewsLedgerGateway } = require('./google-sheets-ledger-gateway');

test('cardnews gateway prepares the strict ledger and uses canonical tab ranges', async () => {
    const calls = [];
    const Utils = {
        async ensureCardNewsSheetReadyStrict(id) { calls.push(['prepare', id]); },
        async getGoogleAccessToken() { return 'token'; },
        async callWithRetry(work) { return work(); }
    };
    const httpClient = {
        async request(request) {
            calls.push([request.method, request.url, request.data]);
            return { data: request.method === 'GET' ? { values: [['header']] } : { updates: { updatedRange: 'cardnews!A2:P2' } } };
        }
    };
    const gateway = createCardNewsLedgerGateway({ Utils, CONFIG: { GOOGLE_SHEET_ID: 'sheet-1' }, httpClient });
    await gateway.prepare();
    await gateway.prepare();
    assert.deepEqual(await gateway.readAll(), [['header']]);
    assert.deepEqual(await gateway.appendRows([['row']]), { rowNumbers: [2] });
    await gateway.updateCells([{ rowNumber: 2, columnIndex: 27, value: 'done' }]);
    assert.deepEqual(calls[0], ['prepare', 'sheet-1']);
    assert.equal(calls.filter(([kind]) => kind === 'prepare').length, 1);
    assert.match(calls[1][1], /values\/cardnews$/);
    assert.match(calls[2][1], /values\/cardnews:append/);
    assert.equal(calls[3][2].data[0].range, 'cardnews!AB2');
});
