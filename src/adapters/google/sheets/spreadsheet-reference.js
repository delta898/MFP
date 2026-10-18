'use strict';

const SPREADSHEET_ID_PATTERN = /^[a-zA-Z0-9-_]{20,}$/;

function extractGoogleSheetId(input, { allowForeignUrlHost = true } = {}) {
    const raw = String(input || '').trim();
    if (!raw) return '';
    if (SPREADSHEET_ID_PATTERN.test(raw)) return raw;

    try {
        const url = new URL(raw);
        const isGoogleHost = /docs\.google\.com$/i.test(url.hostname)
            || /googleusercontent\.com$/i.test(url.hostname);
        if (!allowForeignUrlHost && !isGoogleHost) return '';

        const byPath = url.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/i);
        if (byPath?.[1]) return byPath[1];
        const byQuery = url.searchParams.get('id');
        if (byQuery && SPREADSHEET_ID_PATTERN.test(byQuery)) return byQuery;
    } catch (_error) { }
    return '';
}

function normalizeGoogleSheetUrl(rawUrl, fallbackId = '', options = {}) {
    const input = String(rawUrl || '').trim();
    if (input) {
        const id = extractGoogleSheetId(input, options);
        if (id) return `https://docs.google.com/spreadsheets/d/${id}`;
        if (/^https?:\/\//i.test(input)) return input;
    }

    const id = extractGoogleSheetId(fallbackId, options);
    return id ? `https://docs.google.com/spreadsheets/d/${id}` : '';
}

module.exports = {
    extractGoogleSheetId,
    normalizeGoogleSheetUrl
};
