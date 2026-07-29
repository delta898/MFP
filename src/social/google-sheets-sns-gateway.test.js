const test = require('node:test');
const assert = require('node:assert/strict');
const {
    toA1Column,
    parseUpdatedRowNumbers,
    createGoogleSheetsSnsGateway
} = require('./google-sheets-sns-gateway');

test('Google Sheets SNS gateway converts columns and append ranges', () => {
    assert.equal(toA1Column(0), 'A');
    assert.equal(toA1Column(13), 'N');
    assert.equal(toA1Column(26), 'AA');
    assert.deepEqual(parseUpdatedRowNumbers('SNS!A2:N4'), [2, 3, 4]);
    assert.deepEqual(parseUpdatedRowNumbers(''), []);
});

test('Google Sheets SNS gateway prepares strictly and writes values as RAW', async () => {
    const requests = [];
    const preparedIds = [];
    const Utils = {
        async ensureSnsSheetReadyStrict(spreadsheetId) {
            preparedIds.push(spreadsheetId);
        },
        async getGoogleAccessToken() {
            return 'token';
        },
        async callWithRetry(fn) {
            return fn();
        }
    };
    const httpClient = {
        async request(request) {
            requests.push(request);
            if (request.url.includes(':append')) {
                return { data: { updates: { updatedRange: 'SNS!A2:N2' } } };
            }
            return { data: {} };
        }
    };
    const gateway = createGoogleSheetsSnsGateway({
        Utils,
        CONFIG: { GOOGLE_SHEET_ID: 'spreadsheet-id' },
        httpClient
    });

    await gateway.prepare();
    const appendResult = await gateway.appendRows([['=not-a-formula']]);
    await gateway.updateCells([{ rowNumber: 2, columnIndex: 13, value: '=still-text' }]);

    assert.deepEqual(preparedIds, ['spreadsheet-id']);
    assert.deepEqual(appendResult.rowNumbers, [2]);
    assert.match(requests[0].url, /valueInputOption=RAW/);
    assert.equal(requests[0].data.values[0][0], '=not-a-formula');
    assert.equal(requests[1].data.valueInputOption, 'RAW');
    assert.equal(requests[1].data.data[0].range, 'SNS!N2');
});
