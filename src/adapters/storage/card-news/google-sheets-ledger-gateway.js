const { CARD_NEWS_SHEET_NAME } = require('./ledger-sheet-schema');
const { toA1Column, parseUpdatedRowNumbers } = require('../../google/sheets/gateway-utils');

function createCardNewsLedgerGateway(options = {}) {
    const GoogleSheets = options.GoogleSheets;
    const googleSheetsClient = options.googleSheetsClient;
    const CONFIG = options.CONFIG;
    if (!GoogleSheets || !googleSheetsClient || !CONFIG) throw new Error('Card News Sheets gateway에는 Sheets port, client, CONFIG가 필요합니다.');
    let preparePromise = null;

    function resolveSpreadsheetId() {
        const spreadsheetId = String(CONFIG.GOOGLE_SHEET_ID || '').trim();
        if (!spreadsheetId) throw new Error('GOOGLE_SHEET_ID가 비어 있습니다.');
        return spreadsheetId;
    }

    return {
        async prepare() {
            if (!preparePromise) {
                preparePromise = GoogleSheets.ensureCardNewsSheetReadyStrict(resolveSpreadsheetId())
                    .catch((error) => {
                        preparePromise = null;
                        throw error;
                    });
            }
            await preparePromise;
        },
        async readAll() {
            const spreadsheetId = resolveSpreadsheetId();
            const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(CARD_NEWS_SHEET_NAME)}`;
            const response = await googleSheetsClient.request({ method: 'GET', url });
            return Array.isArray(response?.data?.values) ? response.data.values : [];
        },
        async appendRows(rows) {
            const spreadsheetId = resolveSpreadsheetId();
            const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(CARD_NEWS_SHEET_NAME)}:append?valueInputOption=RAW`;
            const response = await googleSheetsClient.request({ method: 'POST', url, data: {
                range: CARD_NEWS_SHEET_NAME,
                majorDimension: 'ROWS',
                values: rows
            } });
            return { rowNumbers: parseUpdatedRowNumbers(response?.data?.updates?.updatedRange) };
        },
        async updateCells(updates) {
            const data = (Array.isArray(updates) ? updates : []).map((update) => ({
                range: `${CARD_NEWS_SHEET_NAME}!${toA1Column(update.columnIndex)}${update.rowNumber}`,
                majorDimension: 'ROWS',
                values: [[String(update.value ?? '')]]
            }));
            if (data.length === 0) return { updatedCount: 0 };
            const spreadsheetId = resolveSpreadsheetId();
            const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;
            await googleSheetsClient.request({ method: 'POST', url, data: { valueInputOption: 'RAW', data } });
            return { updatedCount: data.length };
        }
    };
}

module.exports = { createCardNewsLedgerGateway };
