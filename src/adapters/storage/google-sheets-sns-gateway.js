const { SNS_SHEET_NAME } = require('../../services/sns/sheet-schema');
const { toA1Column, parseUpdatedRowNumbers } = require('../google/sheets/gateway-utils');

function createGoogleSheetsSnsGateway(options = {}) {
    const googleSheetsClient = options.googleSheetsClient;
    const GoogleSheets = options.GoogleSheets;
    const CONFIG = options.CONFIG;
    const sheetName = SNS_SHEET_NAME;
    if (!googleSheetsClient || !GoogleSheets || !CONFIG) {
        throw new Error('Google Sheets SNS gateway에는 Sheets client, sheet readiness port, CONFIG가 필요합니다.');
    }

    function resolveSpreadsheetId() {
        const spreadsheetId = String(CONFIG.GOOGLE_SHEET_ID || '').trim();
        if (!spreadsheetId) throw new Error('GOOGLE_SHEET_ID가 비어 있습니다.');
        return spreadsheetId;
    }

    return {
        async prepare() {
            await GoogleSheets.ensureSnsSheetReadyStrict(resolveSpreadsheetId());
        },

        async readAll() {
            const spreadsheetId = resolveSpreadsheetId();
            const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}`;
            const response = await googleSheetsClient.request({ method: 'GET', url });
            return Array.isArray(response?.data?.values) ? response.data.values : [];
        },

        async appendRows(rows) {
            const spreadsheetId = resolveSpreadsheetId();
            const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}:append?valueInputOption=RAW`;
            const response = await googleSheetsClient.request({ method: 'POST', url, data: {
                range: sheetName,
                majorDimension: 'ROWS',
                values: rows
            } });
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
            await googleSheetsClient.request({ method: 'POST', url, data: {
                valueInputOption: 'RAW',
                data
            } });
            return { updatedCount: data.length };
        }
    };
}

module.exports = {
    toA1Column,
    parseUpdatedRowNumbers,
    createGoogleSheetsSnsGateway
};
