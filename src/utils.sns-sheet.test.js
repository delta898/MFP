const test = require('node:test');
const assert = require('node:assert/strict');
const Utils = require('./utils');
const { SNS_SHEET_HEADERS } = require('./social/sns-sheet-schema');

test('SNS sheet preparation creates the canonical sheet and applies validation', async () => {
    const calls = [];
    const metadataResponses = [
        { data: { sheets: [] } },
        { data: { sheets: [{ properties: { title: 'SNS', sheetId: 77 } }] } }
    ];
    const context = {
        callWithRetry: async () => metadataResponses.shift(),
        createSheetIfMissing: async (...args) => calls.push(['create', ...args]),
        ensureSnsSheetValidation: async (...args) => calls.push(['validation', ...args])
    };

    const result = await Utils._ensureSnsSheetReady.call(context, 'token', 'spreadsheet-id', {
        suppressError: false
    });

    assert.deepEqual(result, { success: true, sheetName: 'SNS' });
    assert.deepEqual(calls[0], ['create', 'token', 'spreadsheet-id', 'SNS', 'sns']);
    assert.deepEqual(calls[1].slice(0, 5), [
        'validation',
        'token',
        'spreadsheet-id',
        77,
        'SNS'
    ]);
});

test('SNS sheet preparation does not supplement missing columns in an existing sheet', async () => {
    const calls = [];
    const context = {
        callWithRetry: async () => ({
            data: { sheets: [{ properties: { title: 'SNS', sheetId: 77 } }] }
        }),
        _syncSheetHeadersIfMissing: async (...args) => calls.push(['sync', ...args]),
        ensureSnsSheetValidation: async (...args) => calls.push(['validation', ...args])
    };

    const result = await Utils._ensureSnsSheetReady.call(context, 'token', 'spreadsheet-id', {
        suppressError: false
    });

    assert.deepEqual(result, { success: true, sheetName: 'SNS' });
    assert.equal(calls.some(([type]) => type === 'sync'), false);
    assert.equal(calls.some(([type]) => type === 'validation'), true);
});

test('SNS sheet validation rejects an existing sheet with missing canonical columns', async () => {
    const headersWithoutHashtags = SNS_SHEET_HEADERS.filter((header) => header !== '해시태그');
    const context = {
        callWithRetry: async () => ({
            data: { values: [headersWithoutHashtags] }
        })
    };

    await assert.rejects(
        Utils.ensureSnsSheetValidation.call(
            context,
            'token',
            'spreadsheet-id',
            77,
            'SNS',
            { suppressError: false }
        ),
        /필수 헤더가 없습니다: 해시태그/
    );
});

test('SNS sheet preparation isolates failures during common initialization', async () => {
    const context = {
        callWithRetry: async () => {
            throw new Error('SNS unavailable');
        }
    };

    const result = await Utils._ensureSnsSheetReady.call(context, 'token', 'spreadsheet-id', {
        suppressError: true
    });

    assert.equal(result.success, false);
    assert.equal(result.sheetName, 'SNS');
    assert.match(result.message, /SNS unavailable/);
});

test('SNS sheet strict preparation propagates failures to the SNS caller', async () => {
    const context = {
        callWithRetry: async () => {
            throw new Error('SNS unavailable');
        }
    };

    await assert.rejects(
        Utils._ensureSnsSheetReady.call(context, 'token', 'spreadsheet-id', {
            suppressError: false
        }),
        /SNS unavailable/
    );
});
