const test = require('node:test');
const assert = require('node:assert/strict');
const { createGoogleSheetsClient } = require('./client');

test('Google Sheets client adds the Google access token to provider requests', async () => {
    const requests = [];
    const client = createGoogleSheetsClient({
        getAccessToken: async (scopes) => {
            assert.deepEqual(scopes, ['https://www.googleapis.com/auth/drive.file']);
            return 'test-token';
        },
        httpClient: { async request(request) { requests.push(request); return { data: {} }; } }
    });

    await client.request({
        method: 'POST',
        url: 'https://sheets.googleapis.com/v4/spreadsheets/sheet/values:batchUpdate',
        data: { valueInputOption: 'RAW' },
        scopes: ['https://www.googleapis.com/auth/drive.file']
    });

    assert.equal(requests[0].headers.Authorization, 'Bearer test-token');
    assert.equal(requests[0].headers['Content-Type'], 'application/json');
    assert.deepEqual(requests[0].data, { valueInputOption: 'RAW' });
});

test('Google Sheets client retries rate limits with exponential backoff', async () => {
    let attempts = 0;
    const client = createGoogleSheetsClient({
        getAccessToken: async () => 'test-token',
        httpClient: { async request() {
            attempts += 1;
            if (attempts === 1) throw { response: { status: 429 } };
            return { data: { ok: true } };
        } },
        retries: 2,
        retryDelayMs: 0
    });

    assert.deepEqual(await client.request({ method: 'GET', url: 'https://sheets.googleapis.com' }), { data: { ok: true } });
    assert.equal(attempts, 2);
});
