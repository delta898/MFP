'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createGoogleDriveSpreadsheets, localDateStamp } = require('./google-drive-spreadsheets');

test('daily file naming uses the computer local calendar date', () => {
    assert.equal(localDateStamp(new Date(2026, 8, 29, 23, 59)), '20260929');
});

test('creates the BlogGenius folder and a dated spreadsheet, then initializes app sheets', async () => {
    const calls = [];
    const axios = async (request) => {
        calls.push(request);
        if (request.url.endsWith('/files') && request.method === 'GET') return { data: { files: [] } };
        if (request.url.endsWith('/files') && request.method === 'POST' && request.data.mimeType === 'application/vnd.google-apps.folder') {
            return { data: { id: 'folder-id', name: 'BlogGenius' } };
        }
        if (request.url.endsWith('/files') && request.method === 'POST') {
            return { data: { id: 'sheet-id', name: 'BlogGenius_20260929', mimeType: 'application/vnd.google-apps.spreadsheet' } };
        }
        throw new Error(`Unexpected request: ${request.method} ${request.url}`);
    };
    let initialized = '';
    const service = createGoogleDriveSpreadsheets({
        axios,
        getAccessToken: async (scopes) => {
            assert.deepEqual(scopes, ['https://www.googleapis.com/auth/drive.file']);
            return 'token';
        },
        ensureSheetsExist: async (id) => { initialized = id; },
        now: () => new Date(2026, 8, 29, 12)
    });

    const created = await service.createDailySpreadsheet();
    assert.deepEqual(created, {
        spreadsheetId: 'sheet-id',
        title: 'BlogGenius_20260929',
        spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sheet-id/edit'
    });
    assert.equal(initialized, 'sheet-id');
    assert.equal(calls.length, 4);
    assert.deepEqual(calls[3].data.parents, ['folder-id']);
});

test('does not create a duplicate daily spreadsheet', async () => {
    const axios = async (request) => {
        if (request.url.endsWith('/files') && request.method === 'GET') {
            if (request.params.q.includes("mimeType='application/vnd.google-apps.folder'")) {
                return { data: { files: [{ id: 'folder-id', name: 'BlogGenius' }] } };
            }
            return { data: { files: [{ id: 'existing-id', name: 'BlogGenius_20260929' }] } };
        }
        throw new Error('A duplicate file must not be created.');
    };
    const service = createGoogleDriveSpreadsheets({
        axios,
        getAccessToken: async () => 'token',
        now: () => new Date(2026, 8, 29)
    });
    await assert.rejects(service.createDailySpreadsheet(), (error) => {
        assert.equal(error.code, 'GOOGLE_SHEET_DAILY_FILE_EXISTS');
        assert.equal(error.existingFile.spreadsheetId, 'existing-id');
        return true;
    });
});

test('accepts only spreadsheet files returned from Picker', async () => {
    const axios = async () => ({ data: { id: 'picked-id', name: 'Existing workbook', mimeType: 'application/vnd.google-apps.spreadsheet' } });
    axios.get = async () => ({ data: { properties: { title: 'Existing workbook' } } });
    const service = createGoogleDriveSpreadsheets({
        axios,
        getAccessToken: async () => 'token'
    });
    assert.deepEqual(await service.getSpreadsheet('picked-id'), {
        spreadsheetId: 'picked-id',
        title: 'Existing workbook',
        spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/picked-id/edit'
    });
});
