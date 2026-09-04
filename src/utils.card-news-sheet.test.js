const test = require('node:test');
const assert = require('node:assert/strict');
const Utils = require('./utils');
const { CARD_NEWS_SHEET_HEADERS } = require('./card-news/ledger-sheet-schema');

test('cardnews sheet preparation creates, repairs, and validates the canonical tab', async () => {
    const calls = [];
    const responses = [
        { data: { sheets: [] } },
        { data: { sheets: [{ properties: { title: 'cardnews', sheetId: 91 } }] } }
    ];
    const context = {
        callWithRetry: async () => responses.shift(),
        createSheetIfMissing: async (...args) => calls.push(['create', ...args]),
        _syncSheetHeadersIfMissing: async (...args) => calls.push(['sync', ...args]),
        ensureCardNewsSheetValidation: async (...args) => calls.push(['validation', ...args])
    };

    const result = await Utils._ensureCardNewsSheetReady.call(context, 'token', 'spreadsheet-id', { suppressError: false });

    assert.deepEqual(result, { success: true, sheetName: 'cardnews' });
    assert.deepEqual(calls[0], ['create', 'token', 'spreadsheet-id', 'cardnews', 'cardnews']);
    assert.deepEqual(calls[1], ['sync', 'token', 'spreadsheet-id', 'cardnews', 'cardnews', { suppressError: false }]);
    assert.deepEqual(calls[2].slice(0, 5), ['validation', 'token', 'spreadsheet-id', 91, 'cardnews']);
});

test('cardnews sheet preparation repairs existing headers before validation', async () => {
    const calls = [];
    const context = {
        callWithRetry: async () => ({ data: { sheets: [{ properties: { title: 'cardnews', sheetId: 91 } }] } }),
        _syncSheetHeadersIfMissing: async (...args) => calls.push(['sync', ...args]),
        ensureCardNewsSheetValidation: async (...args) => calls.push(['validation', ...args])
    };

    const result = await Utils._ensureCardNewsSheetReady.call(context, 'token', 'spreadsheet-id', { suppressError: false });
    assert.deepEqual(result, { success: true, sheetName: 'cardnews' });
    assert.equal(calls[0][0], 'sync');
    assert.equal(calls[1][0], 'validation');
});

test('cardnews sheet validation requires every canonical header', async () => {
    const headers = CARD_NEWS_SHEET_HEADERS.filter((header) => header !== '게시물 링크');
    const context = { callWithRetry: async () => ({ data: { values: [headers] } }) };

    await assert.rejects(
        Utils.ensureCardNewsSheetValidation.call(context, 'token', 'spreadsheet-id', 91, 'cardnews', { suppressError: false }),
        /게시물 링크/
    );
});

test('cardnews sheet preparation isolates common-startup failures', async () => {
    const context = { callWithRetry: async () => { throw new Error('cardnews unavailable'); } };
    const result = await Utils._ensureCardNewsSheetReady.call(context, 'token', 'spreadsheet-id', { suppressError: true });
    assert.equal(result.success, false);
    assert.equal(result.sheetName, 'cardnews');
    assert.match(result.message, /cardnews unavailable/);
});
