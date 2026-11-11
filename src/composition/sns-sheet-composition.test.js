const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createSnsSheetStoreComposition: createStore } = require('./sns-sheet-store');
const { SNS_SHEET_HEADERS } = require('../services/sns/sheet-schema');

test('SNS sheet composition shares live configuration and preserves readiness, read order, and errors', async () => {
    const calls = [];
    const CONFIG = { GOOGLE_SHEET_ID: 'first' };
    const failure = new Error('readiness failure');
    let fail = false;
    const GoogleSheets = { async ensureSnsSheetReadyStrict(id) { calls.push(['prepare', id]); if (fail) throw failure; } };
    const googleSheetsClient = { async request({ url }) { calls.push(['read', url]); return { data: { values: [SNS_SHEET_HEADERS] } }; } };
    const store = createStore({ GoogleSheets, googleSheetsClient, CONFIG });
    assert.deepEqual(await store.listRows(), []);
    CONFIG.GOOGLE_SHEET_ID = 'second';
    assert.deepEqual(await store.listRows(), []);
    assert.deepEqual(calls.map((call) => call[0]), ['prepare', 'read', 'prepare', 'read']);
    assert.equal(calls[0][1], 'first');
    assert.equal(calls[2][1], 'second');
    assert.match(calls[3][1], /spreadsheets\/second\//);
    fail = true;
    await assert.rejects(store.listRows(), (error) => error === failure);
    assert.equal(calls.length, 5);
});

test('UI composition constructs one SNS store before both consumers and outside server reload', () => {
    const source = fs.readFileSync(path.join(__dirname, 'ui-server.js'), 'utf8');
    assert.equal((source.match(/createSnsSheetStoreComposition\(\{/g) || []).length, 1);
    const created = source.indexOf('const snsSheetStore = createSnsSheetStoreComposition(');
    const discovery = source.indexOf('const snsRssDiscovery = createSnsRssDiscovery(');
    const runner = source.indexOf('const snsDistributionRunner = createSnsDistributionRunner(');
    const http = source.indexOf('const uiHttpServerRuntime = createUiHttpServerRuntime(');
    assert.ok(created >= 0 && created < discovery && discovery < runner && runner < http);
    assert.match(source.slice(discovery, runner), /store: snsSheetStore/);
    assert.match(source.slice(runner, http), /store: snsSheetStore/);
});
