'use strict';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const SPREADSHEET_MIME_TYPE = 'application/vnd.google-apps.spreadsheet';

function escapeDriveQuery(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function localDateStamp(date = new Date()) {
    return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
}

function createGoogleDriveSpreadsheets({ axios, getAccessToken, ensureSheetsExist, now = () => new Date() } = {}) {
    if (!axios || typeof getAccessToken !== 'function') throw new Error('Google Drive Spreadsheet dependency가 준비되지 않았습니다.');

    async function request(method, path, accessToken, { params, data } = {}) {
        const response = await axios({
            method,
            url: `${DRIVE_API}${path}`,
            params,
            data,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                ...(data ? { 'Content-Type': 'application/json' } : {})
            }
        });
        return response.data || {};
    }

    async function findFile(accessToken, query) {
        const result = await request('GET', '/files', accessToken, {
            params: { q: query, pageSize: 100, fields: 'files(id,name,mimeType,webViewLink)' }
        });
        return Array.isArray(result.files) ? result.files : [];
    }

    async function getOrCreateAppFolder(accessToken) {
        const query = `name='BlogGenius' and mimeType='${FOLDER_MIME_TYPE}' and 'root' in parents and trashed=false`;
        const folders = await findFile(accessToken, query);
        if (folders[0]?.id) return folders[0];
        return request('POST', '/files', accessToken, {
            params: { fields: 'id,name,mimeType,webViewLink' },
            data: { name: 'BlogGenius', mimeType: FOLDER_MIME_TYPE, parents: ['root'] }
        });
    }

    async function getSpreadsheet(fileId) {
        const accessToken = await getAccessToken(['https://www.googleapis.com/auth/drive.file']);
        const result = await request('GET', `/files/${encodeURIComponent(fileId)}`, accessToken, {
            params: { fields: 'id,name,mimeType,webViewLink' }
        });
        if (result.mimeType !== SPREADSHEET_MIME_TYPE) {
            const error = new Error('Google Spreadsheet 파일을 선택해 주세요.');
            error.code = 'GOOGLE_PICKER_FILE_TYPE_INVALID';
            throw error;
        }
        const sheetResponse = await axios.get(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(fileId)}?fields=spreadsheetId,properties.title`, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        return {
            spreadsheetId: String(result.id || fileId),
            title: String(sheetResponse.data?.properties?.title || result.name || ''),
            spreadsheetUrl: String(result.webViewLink || `https://docs.google.com/spreadsheets/d/${encodeURIComponent(result.id || fileId)}/edit`)
        };
    }

    async function createDailySpreadsheet() {
        const accessToken = await getAccessToken(['https://www.googleapis.com/auth/drive.file']);
        const folder = await getOrCreateAppFolder(accessToken);
        if (!folder?.id) throw new Error('BlogGenius 폴더를 만들거나 찾지 못했습니다.');
        const title = `BlogGenius_${localDateStamp(now())}`;
        const query = `name='${escapeDriveQuery(title)}' and mimeType='${SPREADSHEET_MIME_TYPE}' and '${escapeDriveQuery(folder.id)}' in parents and trashed=false`;
        const existing = await findFile(accessToken, query);
        if (existing.length > 0) {
            const error = new Error(`오늘 날짜의 '${title}' 파일이 이미 있습니다. 기존 파일 선택을 이용해 주세요.`);
            error.code = 'GOOGLE_SHEET_DAILY_FILE_EXISTS';
            error.existingFile = {
                spreadsheetId: String(existing[0].id || ''),
                title: String(existing[0].name || title),
                spreadsheetUrl: String(existing[0].webViewLink || `https://docs.google.com/spreadsheets/d/${encodeURIComponent(existing[0].id || '')}/edit`)
            };
            throw error;
        }
        const file = await request('POST', '/files', accessToken, {
            params: { fields: 'id,name,mimeType,webViewLink' },
            data: { name: title, mimeType: SPREADSHEET_MIME_TYPE, parents: [folder.id] }
        });
        if (!file.id) throw new Error('새 Spreadsheet 파일을 만들지 못했습니다.');
        if (typeof ensureSheetsExist === 'function') await ensureSheetsExist(file.id);
        return {
            spreadsheetId: String(file.id),
            title: String(file.name || title),
            spreadsheetUrl: String(file.webViewLink || `https://docs.google.com/spreadsheets/d/${encodeURIComponent(file.id)}/edit`)
        };
    }

    return { createDailySpreadsheet, getSpreadsheet };
}

module.exports = { createGoogleDriveSpreadsheets, localDateStamp };
