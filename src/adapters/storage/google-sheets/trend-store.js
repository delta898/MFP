'use strict';

const {
    fs, axios, CONFIG, Logger, GoogleOAuth, formatSheetImageModeValue,
    mergeShoppingSheetOptions, mergeTopicSheetOptions, parseSheetImageModeValue,
    resolveShoppingSheetState, resolveTopicSheetState, stringifySheetOptionsValue,
    SNS_SHEET_NAME, SNS_SHEET_HEADERS, buildSnsStatusValidationRequest,
    CARD_NEWS_SHEET_NAME, CARD_NEWS_SHEET_HEADERS, buildCardNewsStatusValidationRequests,
    buildTopicRowMoveRequest, getAgentEventStore
} = require('./dependencies');

module.exports = {
    appendGoogleSheetTrends: async function (trendData, dateOverride = null) {
        if (!trendData || trendData.length === 0) {
            return { success: true, addedCount: 0, skippedExisting: 0, skippedInBatch: 0 };
        }

        try {
            const accessToken = await this.getGoogleAccessToken();
            // 기본값 'trends', 설정 없으면 'trends'
            const sheetName = CONFIG.GOOGLE_TRENDS_SHEET || 'trends';
            const spreadsheetId = CONFIG.GOOGLE_SHEET_ID;

            // 1. 헤더 확인 및 매핑
            let headers = [];

            try {
                const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:1`;
                const headerRes = await this.callWithRetry(() => axios.get(readUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } }));
                headers = headerRes.data.values ? headerRes.data.values[0] : [];
            } catch (e) {
                // 400 Bad Request => 시트가 없을 가능성이 높음 -> 시트 생성 시도
                if (e.response && (e.response.status === 400 || e.response.data?.error?.status === 'INVALID_ARGUMENT')) {
                    Logger.info(`✨ '${sheetName}' 시트가 없어서 새로 생성합니다...`);

                    // 시트 생성 (1행 고정) & ID 획득
                    const createUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
                    const res = await this.callWithRetry(() => axios.post(createUrl, {
                        requests: [{
                            addSheet: {
                                properties: {
                                    title: sheetName,
                                    gridProperties: { frozenRowCount: 1 } // 1행 고정
                                }
                            }
                        }]
                    }, { headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }));

                    const newSheetId = res.data.replies[0].addSheet.properties.sheetId;

                    // 데이터 유효성 검사 (Dropdown)
                    // (appendGoogleSheetTrends) Status: E열 (Index 4) -> 대기, 키워드 목록에 추가
                    const validationReq = {
                        requests: [{
                            setDataValidation: {
                                range: { sheetId: newSheetId, startRowIndex: 1, startColumnIndex: 4, endColumnIndex: 5 },
                                rule: {
                                    condition: {
                                        type: 'ONE_OF_LIST',
                                        values: [
                                            { userEnteredValue: '대기' },
                                            { userEnteredValue: '키워드 목록에 추가' },
                                            { userEnteredValue: '키워드 목록 추가 완료' },
                                            { userEnteredValue: '연관검색어 조사' },
                                            { userEnteredValue: '연관검색어 조사 완료' }
                                        ]
                                    },
                                    showCustomUi: true, strict: true
                                }
                            }
                        }]
                    };
                    await this.callWithRetry(() => axios.post(createUrl, validationReq, { headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }));

                    // 헤더 추가
                    const headerRow = [['날짜', '주제', '키워드', '증감', '동작/상태']];
                    const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}:append?valueInputOption=USER_ENTERED`;
                    await this.callWithRetry(() => axios.post(appendUrl, { range: sheetName, majorDimension: 'ROWS', values: headerRow }, {
                        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
                    }));

                    headers = headerRow[0];
                    Logger.info(`   ✅ 시트 생성 및 헤더 추가 완료`);
                } else {
                    throw e; // 다른 에러는 throw
                }
            }

            const map = {};

            // 헤더가 비어있다면(새 시트), 기본 헤더를 먼저 써주는게 좋겠지만 복잡도를 낮추기 위해
            // 기존에 헤더가 있다고 가정하고 매핑 시도. 만약 헤더가 없으면 A,B,C,D 순서로 간주.

            if (headers.length > 0) {
                headers.forEach((h, i) => {
                    const clean = h.toLowerCase().replace(/[\s\/_]/g, '');
                    if (clean.includes('날짜') || clean.includes('date')) map.date = i;
                    else if (clean.includes('주제') || clean.includes('subject') || clean.includes('category')) map.category = i;
                    else if (clean.includes('키워드') || clean.includes('keyword')) map.keyword = i;
                    else if (clean.includes('증감') || clean.includes('변동') || clean.includes('variation') || clean.includes('rank')) map.variation = i;
                    else if (clean.includes('동작') || clean.includes('상태') || clean.includes('status')) map.status = i;
                });
            } else {
                // 헤더가 없으면 기본 매핑 (A=Date, B=Category, C=Keyword, D=Variation, E=Status)
                map.date = 0;
                map.category = 1;
                map.keyword = 2;
                map.variation = 3;
                map.status = 4;
            }

            const maxCol = Math.max(...Object.values(map));
            const today = new Date();
            const defaultDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            const dateStr = (typeof dateOverride === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateOverride))
                ? dateOverride
                : defaultDateStr;
            const normalizeDate = (raw) => {
                const text = String(raw || '').trim();
                if (!text) return '';
                const compact = text.match(/^(\d{4})(\d{2})(\d{2})$/);
                if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
                const dashed = text.match(/^(\d{4})[.\-/\s]+(\d{1,2})[.\-/\s]+(\d{1,2})$/);
                if (dashed) {
                    const y = dashed[1];
                    const m = String(parseInt(dashed[2], 10)).padStart(2, '0');
                    const d = String(parseInt(dashed[3], 10)).padStart(2, '0');
                    return `${y}-${m}-${d}`;
                }
                return text;
            };
            const trendKey = (dateVal, categoryVal, keywordVal) =>
                `${normalizeDate(dateVal).toLowerCase()}|${String(categoryVal || '').trim().toLowerCase()}|${String(keywordVal || '').trim().toLowerCase()}`;

            // 기존 데이터 기준 dedupe 세트 구축 (date+category+keyword)
            const existingRowsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}`;
            const existingRowsRes = await this.callWithRetry(() => axios.get(existingRowsUrl, {
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
            }));
            const existingRows = Array.isArray(existingRowsRes?.data?.values) ? existingRowsRes.data.values : [];
            const existingKeySet = new Set();
            if (existingRows.length > 1) {
                for (let i = 1; i < existingRows.length; i++) {
                    const row = existingRows[i] || [];
                    const rowDate = map.date !== undefined ? row[map.date] : '';
                    const rowCategory = map.category !== undefined ? row[map.category] : '';
                    const rowKeyword = map.keyword !== undefined ? row[map.keyword] : '';
                    const key = trendKey(rowDate, rowCategory, rowKeyword);
                    if (key && !key.startsWith('||')) existingKeySet.add(key);
                }
            }

            const inBatchKeySet = new Set();
            const rowsToAdd = [];
            let skippedExisting = 0;
            let skippedInBatch = 0;
            for (const item of trendData) {
                const category = String(item?.category || '').trim();
                const keyword = String(item?.keyword || '').trim();
                if (!category || !keyword) continue;
                const key = trendKey(dateStr, category, keyword);
                if (existingKeySet.has(key)) {
                    skippedExisting += 1;
                    continue;
                }
                if (inBatchKeySet.has(key)) {
                    skippedInBatch += 1;
                    continue;
                }
                inBatchKeySet.add(key);

                const row = new Array(maxCol + 1).fill("");
                if (map.date !== undefined) row[map.date] = dateStr;
                if (map.category !== undefined) row[map.category] = category;
                if (map.keyword !== undefined) row[map.keyword] = keyword;
                if (map.variation !== undefined) row[map.variation] = item.variation || '-';
                if (map.status !== undefined) row[map.status] = '대기';
                rowsToAdd.push(row);
            }

            if (rowsToAdd.length === 0) {
                Logger.info(`   ℹ️ 트렌드 시트(${sheetName}) 중복 검사 결과 신규 추가할 데이터가 없습니다. (기존중복 ${skippedExisting}건, 배치중복 ${skippedInBatch}건)`);
                return {
                    success: true,
                    addedCount: 0,
                    date: dateStr,
                    skippedExisting,
                    skippedInBatch
                };
            }

            const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}:append?valueInputOption=USER_ENTERED`;

            await this.callWithRetry(() => axios.post(appendUrl, { range: sheetName, majorDimension: 'ROWS', values: rowsToAdd }, {
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
            }));

            // ⏳ API 호출 간 안전 대기
            await this.sleep(1000);

            Logger.info(`   ✅ 트렌드 시트(${sheetName})에 ${rowsToAdd.length}건 추가 완료 (기존중복 ${skippedExisting}건, 배치중복 ${skippedInBatch}건 제외)`);
            return {
                success: true,
                addedCount: rowsToAdd.length,
                date: dateStr,
                skippedExisting,
                skippedInBatch
            };

        } catch (e) {
            // Trends 시트가 없는 경우 400 에러(Unable to parse range)가 발생할 수 있음 (미사용 시 무시)
            if (e.response?.status !== 400 && !String(e.message).includes('Unable to parse range')) {
                Logger.debug(`⚠️ trends 시트 읽기 실패: ${e.message}`);
            }
            return [];
        }
    },

    readGoogleSheetTrendsAll: async function (options = {}) {
        try {
            const accessToken = await this.getGoogleAccessToken();
            const sheetName = CONFIG.GOOGLE_TRENDS_SHEET || 'trends';
            const spreadsheetId = CONFIG.GOOGLE_SHEET_ID;
            const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}`;

            const res = await this.callWithRetry(() => axios.get(url, {
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
            }));
            const rows = res.data.values;
            if (!rows || rows.length === 0) {
                return { items: [], total: 0, limit: 0, offset: 0 };
            }

            const headers = rows[0].map(h => String(h || '').toLowerCase().replace(/[\s\/_]/g, '').trim());
            const parsed = rows.slice(1).map((row, index) => {
                const entry = {};
                headers.forEach((h, i) => { entry[h] = row[i] !== undefined ? row[i] : ""; });
                const getVal = (cols) => {
                    for (const col of cols) {
                        const cleanCol = String(col || '').toLowerCase().replace(/[\s\/_]/g, '').trim();
                        if (Object.prototype.hasOwnProperty.call(entry, cleanCol) && String(entry[cleanCol]).trim() !== '') {
                            return String(entry[cleanCol]).trim();
                        }
                    }
                    return "";
                };

                return {
                    rowIndex: index,
                    rowNumber: index + 2,
                    date: getVal(['날짜', 'date']),
                    category: getVal(['주제', 'category', 'subject']),
                    keyword: getVal(['키워드', 'keyword']),
                    variation: getVal(['증감', 'variation', 'rank']),
                    status: getVal(['동작상태', '동작/상태', '상태', 'status'])
                };
            });

            const statusFilter = String(options.status || '').trim();
            const q = String(options.q || '').trim().toLowerCase();
            let filtered = parsed;
            if (statusFilter) {
                filtered = filtered.filter(item => String(item.status || '').trim() === statusFilter);
            }
            if (q) {
                filtered = filtered.filter(item => {
                    const haystack = [
                        item.date,
                        item.category,
                        item.keyword,
                        item.variation,
                        item.status
                    ].join(' ').toLowerCase();
                    return haystack.includes(q);
                });
            }

            const sortBy = String(options.sortBy || 'rowNumber').trim();
            const sortDir = String(options.sortDir || 'desc').trim().toLowerCase() === 'desc' ? 'desc' : 'asc';
            const compareValues = (a, b) => {
                const aNull = a === null || a === undefined || a === '';
                const bNull = b === null || b === undefined || b === '';
                if (aNull && bNull) return 0;
                if (aNull) return 1;
                if (bNull) return -1;
                if (typeof a === 'number' && typeof b === 'number') return a - b;
                return String(a).localeCompare(String(b), 'ko', { numeric: true, sensitivity: 'base' });
            };
            const parseVariationValue = (raw) => {
                const text = String(raw || '').trim();
                if (!text) return 0;
                if (text.includes('▲')) {
                    const num = parseInt(text.replace(/[^\d-]/g, ''), 10);
                    return Number.isNaN(num) ? 0 : Math.abs(num);
                }
                if (text.includes('▼')) {
                    const num = parseInt(text.replace(/[^\d-]/g, ''), 10);
                    return Number.isNaN(num) ? 0 : -Math.abs(num);
                }
                const plain = parseInt(text.replace(/[^\d-]/g, ''), 10);
                return Number.isNaN(plain) ? 0 : plain;
            };
            const getSortValue = (item) => {
                if (sortBy === 'rowNumber') return Number(item.rowNumber || 0);
                if (sortBy === 'date') return String(item.date || '');
                if (sortBy === 'category') return String(item.category || '');
                if (sortBy === 'keyword') return String(item.keyword || '');
                if (sortBy === 'variation') return parseVariationValue(item.variation);
                if (sortBy === 'status') return String(item.status || '');
                return Number(item.rowNumber || 0);
            };
            filtered = filtered
                .map((item, index) => ({ item, index }))
                .sort((a, b) => {
                    const cmp = compareValues(getSortValue(a.item), getSortValue(b.item));
                    if (cmp !== 0) return sortDir === 'desc' ? -cmp : cmp;
                    return a.index - b.index;
                })
                .map(v => v.item);

            const total = filtered.length;
            const limit = Number.isFinite(Number(options.limit)) ? Math.max(1, parseInt(options.limit, 10)) : 100;
            const offset = Number.isFinite(Number(options.offset)) ? Math.max(0, parseInt(options.offset, 10)) : 0;
            const items = filtered.slice(offset, offset + limit);
            return { items, total, limit, offset };
        } catch (e) {
            //Trends 시트가 없는 경우 400 에러(Unable to parse range)가 발생할 수 있음
            //사용자가 트렌드 기능을 사용하지 않는 경우이므로 에러 로그 대신 디버그 로그로 처리
            if (e.response?.status === 400 || String(e.message).includes('Unable to parse range')) {
                Logger.debug(`[GoogleSheet] trends 시트 읽기 건너뜐 (미사용 혹은 시트 없음)`);
            } else {
                Logger.warn(`⚠️ trends 시트 조회 실패 (미사용 시 무시 가능): ${e.message}`);
            }
            return { items: [], total: 0, limit: 0, offset: 0 };
        }
    },

    readGoogleSheetKeywordsAll: async function (options = {}) {
        try {
            const accessToken = await this.getGoogleAccessToken();
            const sheetName = CONFIG.GOOGLE_KEYWORDS_SHEET || 'keywords';
            const spreadsheetId = CONFIG.GOOGLE_SHEET_ID;
            const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}`;

            const res = await this.callWithRetry(() => axios.get(url, {
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
            }));
            const rows = res.data.values;
            if (!rows || rows.length === 0) {
                return { items: [], total: 0, limit: 0, offset: 0 };
            }

            const headers = rows[0].map(h => String(h || '').toLowerCase().replace(/[\s\/_]/g, '').trim());
            const parsed = rows.slice(1).map((row, index) => {
                const entry = {};
                headers.forEach((h, i) => { entry[h] = row[i] !== undefined ? row[i] : ""; });
                const getVal = (cols) => {
                    for (const col of cols) {
                        const cleanCol = String(col || '').toLowerCase().replace(/[\s\/_]/g, '').trim();
                        if (Object.prototype.hasOwnProperty.call(entry, cleanCol) && String(entry[cleanCol]).trim() !== '') {
                            return String(entry[cleanCol]).trim();
                        }
                    }
                    return "";
                };

                return {
                    rowIndex: index,
                    rowNumber: index + 2,
                    keyword: getVal(['키워드', 'keyword']),
                    status: getVal(['동작상태', '동작/상태', '상태', 'status']),
                    updatedAt: getVal(['작업시간', '작업 시간', '시간', 'time', 'date'])
                };
            });

            const statusFilter = String(options.status || '').trim();
            const q = String(options.q || '').trim().toLowerCase();
            let filtered = parsed;
            if (statusFilter) {
                filtered = filtered.filter(item => String(item.status || '').trim() === statusFilter);
            }
            if (q) {
                filtered = filtered.filter(item => {
                    const haystack = [
                        item.keyword,
                        item.status,
                        item.updatedAt
                    ].join(' ').toLowerCase();
                    return haystack.includes(q);
                });
            }

            const total = filtered.length;
            const limit = Number.isFinite(Number(options.limit)) ? Math.max(1, parseInt(options.limit, 10)) : 100;
            const offset = Number.isFinite(Number(options.offset)) ? Math.max(0, parseInt(options.offset, 10)) : 0;
            const items = filtered.slice(offset, offset + limit);
            return { items, total, limit, offset };
        } catch (e) {
            Logger.error(`❌ keywords 전체 조회 실패: ${e.message}`);
            return { items: [], total: 0, limit: 0, offset: 0 };
        }
    },

    updateGoogleSheetTrendStatus: async function (rowIndex, status) {
        try {
            const accessToken = await this.getGoogleAccessToken();
            const sheetName = CONFIG.GOOGLE_TRENDS_SHEET || 'trends';
            const spreadsheetId = CONFIG.GOOGLE_SHEET_ID;

            const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:1`;
            const headerRes = await this.callWithRetry(() => axios.get(readUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } }));
            const headers = (headerRes.data.values && headerRes.data.values[0]) ? headerRes.data.values[0] : [];

            let statusColIndex = -1;
            headers.forEach((h, i) => {
                const clean = String(h || '').toLowerCase().replace(/[\s\/_]/g, '');
                if (clean.includes('동작상태') || clean.includes('동작') || clean.includes('상태') || clean.includes('status')) statusColIndex = i;
            });
            if (statusColIndex === -1) return;

            const targetRow = rowIndex + 2;
            const toA1 = (colIdx) => {
                let letter = '';
                let num = colIdx;
                while (num >= 0) {
                    letter = String.fromCharCode((num % 26) + 65) + letter;
                    num = Math.floor(num / 26) - 1;
                }
                return letter;
            };

            const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;
            await this.callWithRetry(() => axios.post(updateUrl, {
                valueInputOption: 'USER_ENTERED',
                data: [{ range: `${sheetName}!${toA1(statusColIndex)}${targetRow}`, values: [[status]] }]
            }, {
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
            }));
            await this.sleep(300);
        } catch (e) {
            Logger.error(`❌ 트렌드 상태 업데이트 실패 (Row ${rowIndex}): ${e.message}`);
        }
    },

    updateGoogleSheetTrendStatusBulk: async function (rowIndices = [], status) {
        try {
            const uniqueRows = Array.from(
                new Set(
                    (Array.isArray(rowIndices) ? rowIndices : [])
                        .map((v) => parseInt(v, 10))
                        .filter((v) => Number.isInteger(v) && v >= 0)
                )
            );
            if (uniqueRows.length === 0) return { success: true, updatedCount: 0 };

            const accessToken = await this.getGoogleAccessToken();
            const sheetName = CONFIG.GOOGLE_TRENDS_SHEET || 'trends';
            const spreadsheetId = CONFIG.GOOGLE_SHEET_ID;

            const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:1`;
            const headerRes = await this.callWithRetry(() => axios.get(readUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } }));
            const headers = (headerRes.data.values && headerRes.data.values[0]) ? headerRes.data.values[0] : [];

            let statusColIndex = -1;
            headers.forEach((h, i) => {
                const clean = String(h || '').toLowerCase().replace(/[\s\/_]/g, '');
                if (clean.includes('동작상태') || clean.includes('동작') || clean.includes('상태') || clean.includes('status')) statusColIndex = i;
            });
            if (statusColIndex === -1) return { success: false, updatedCount: 0, message: '상태 컬럼을 찾지 못했습니다.' };

            const toA1 = (colIdx) => {
                let letter = '';
                let num = colIdx;
                while (num >= 0) {
                    letter = String.fromCharCode((num % 26) + 65) + letter;
                    num = Math.floor(num / 26) - 1;
                }
                return letter;
            };

            const data = uniqueRows.map((rowIndex) => {
                const targetRow = rowIndex + 2;
                return {
                    range: `${sheetName}!${toA1(statusColIndex)}${targetRow}`,
                    values: [[status]]
                };
            });

            const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;
            await this.callWithRetry(() => axios.post(updateUrl, {
                valueInputOption: 'USER_ENTERED',
                data
            }, {
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
            }));

            return { success: true, updatedCount: uniqueRows.length };
        } catch (e) {
            Logger.error(`❌ 트렌드 상태 일괄 업데이트 실패: ${e.message}`);
            return { success: false, updatedCount: 0, message: e.message };
        }
    },
};
