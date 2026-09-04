const axios = require('axios');
const { SNS_SHEET_NAME } = require('./sns-sheet-schema');
const { toA1Column, parseUpdatedRowNumbers } = require('../google-sheets/sheet-gateway-utils');

function createGoogleSheetsSnsGateway(options = {}) {
    const Utils = options.Utils;
    const CONFIG = options.CONFIG;
    const httpClient = options.httpClient || axios;
    const sheetName = SNS_SHEET_NAME;
    if (!Utils || !CONFIG) {
        throw new Error('Google Sheets SNS gateway에는 Utils와 CONFIG가 필요합니다.');
    }

    function resolveSpreadsheetId() {
        const spreadsheetId = String(CONFIG.GOOGLE_SHEET_ID || '').trim();
        if (!spreadsheetId) throw new Error('GOOGLE_SHEET_ID가 비어 있습니다.');
        return spreadsheetId;
    }

    async function requestWithToken(method, url, data) {
        const accessToken = await Utils.getGoogleAccessToken();
        return Utils.callWithRetry(() => httpClient.request({
            method,
            url,
            data,
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        }));
    }

    return {
        async prepare() {
            await Utils.ensureSnsSheetReadyStrict(resolveSpreadsheetId());
        },

        async readAll() {
            const spreadsheetId = resolveSpreadsheetId();
            const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}`;
            const response = await requestWithToken('GET', url);
            return Array.isArray(response?.data?.values) ? response.data.values : [];
        },

        async appendRows(rows) {
            const spreadsheetId = resolveSpreadsheetId();
            const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}:append?valueInputOption=RAW`;
            const response = await requestWithToken('POST', url, {
                range: sheetName,
                majorDimension: 'ROWS',
                values: rows
            });
            return {
                rowNumbers: parseUpdatedRowNumbers(response?.data?.updates?.updatedRange)
            };
        },

        async updateCells(updates) {
            const spreadsheetId = resolveSpreadsheetId();
            const data = (Array.isArray(updates) ? updates : []).map((update) => {
                const column = toA1Column(update.columnIndex);
                const range = `${sheetName}!${column}${update.rowNumber}`;
                return {
                    range,
                    majorDimension: 'ROWS',
                    values: [[String(update.value ?? '')]]
                };
            });
            if (data.length === 0) return { updatedCount: 0 };

            const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;
            await requestWithToken('POST', url, {
                valueInputOption: 'RAW',
                data
            });
            return { updatedCount: data.length };
        }
    };
}

module.exports = {
    toA1Column,
    parseUpdatedRowNumbers,
    createGoogleSheetsSnsGateway
};
