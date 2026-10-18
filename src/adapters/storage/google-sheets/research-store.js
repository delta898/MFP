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
    readGoogleSheetKeywords: async function (options = {}) {
        try {
            if (!options.silent) Logger.info("🌐 구글 키워드 시트 읽기 (Target: 연관검색어 조사)");
            const accessToken = await this.getGoogleAccessToken();

            const sheetName = CONFIG.GOOGLE_KEYWORDS_SHEET || 'keywords';
            const spreadsheetId = CONFIG.GOOGLE_SHEET_ID;
            const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}`;

            let res;
            try {
                res = await this.callWithRetry(() => axios.get(url, {
                    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
                }));
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
                    // (readGoogleSheetKeywords) Status: B열 (Index 1) -> 대기, 연관검색어 조사, 연관검색어 조사 완료
                    const validationReq = {
                        requests: [{
                            setDataValidation: {
                                range: { sheetId: newSheetId, startRowIndex: 1, startColumnIndex: 1, endColumnIndex: 2 },
                                rule: {
                                    condition: {
                                        type: 'ONE_OF_LIST',
                                        values: [
                                            { userEnteredValue: '대기' },
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

                    // 헤더 추가: keyword, 동작 / 상태, 작업 시간
                    const headerRow = [['keyword', '동작 / 상태', '작업 시간']];
                    const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}:append?valueInputOption=USER_ENTERED`;
                    await this.callWithRetry(() => axios.post(appendUrl, { range: sheetName, majorDimension: 'ROWS', values: headerRow }, {
                        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
                    }));

                    Logger.info(`   ✅ 시트 생성 및 헤더 추가 완료`);
                    return []; // 빈 시트이므로 빈 배열 반환
                } else {
                    throw e;
                }
            }

            const rows = res.data.values;
            if (!rows || rows.length === 0) return [];

            const headers = rows[0].map(h => h.toLowerCase().replace(/[\s\/_]/g, '').trim());

            // 인덱스 찾기
            let kwIdx = -1, statusIdx = -1;
            headers.forEach((h, i) => {
                const clean = h.toLowerCase().replace(/[\s\/_]/g, '');
                if (clean.includes('키워드') || clean.includes('keyword')) kwIdx = i;
                else if (clean.includes('상태') || clean.includes('status') || clean.includes('동작')) statusIdx = i;
            });

            if (kwIdx === -1 || statusIdx === -1) {
                Logger.error("❌ 키워드 시트 헤더를 찾을 수 없습니다. (키워드, 상태 필수)");
                return [];
            }

            const targets = [];
            rows.slice(1).forEach((row, index) => {
                const status = row[statusIdx] ? row[statusIdx].trim() : "";
                if (status === '연관검색어 조사') {
                    targets.push({
                        rowIndex: index, // 0-based index relative to data rows
                        keyword: row[kwIdx],
                        status: status
                    });
                }
            });

            return targets;

        } catch (e) {
            if (CONFIG.CONFIG_IS_ESSENTIAL_SET) {
                Logger.error(`❌ 키워드 시트 읽기 실패: ${e.message}`);
            }
            return [];
        }
    },

    /**
     * 1-2. 키워드 시트 상태 업데이트 (개별 row)
     */
    updateGoogleSheetKeywordStatus: async function (rowIndex, status) {
        try {
            const accessToken = await this.getGoogleAccessToken();
            const sheetName = CONFIG.GOOGLE_KEYWORDS_SHEET || 'keywords';
            const spreadsheetId = CONFIG.GOOGLE_SHEET_ID;

            // 헤더 찾기 (상태 컬럼 위치 확인용)
            const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:1`;
            const headerRes = await this.callWithRetry(() => axios.get(readUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } }));

            const headers = headerRes.data.values[0];
            let statusColIndex = -1, timeColIndex = -1;

            headers.forEach((h, i) => {
                const clean = h.toLowerCase().replace(/[\s\/_]/g, '');
                if (clean.includes('상태') || clean.includes('status') || clean.includes('동작')) statusColIndex = i;
                else if (clean.includes('시간') || clean.includes('time') || clean.includes('date') || clean.includes('작업')) timeColIndex = i;
            });

            if (statusColIndex === -1) return;

            const targetRow = rowIndex + 2; // Header(1) + 0-based index(1)
            const toA1 = (colIdx) => {
                let letter = '';
                let num = colIdx;
                while (num >= 0) {
                    letter = String.fromCharCode((num % 26) + 65) + letter;
                    num = Math.floor(num / 26) - 1;
                }
                return letter;
            };

            const dataToUpdate = [];
            dataToUpdate.push({ range: `${sheetName}!${toA1(statusColIndex)}${targetRow}`, values: [[status]] });
            if (timeColIndex !== -1) dataToUpdate.push({ range: `${sheetName}!${toA1(timeColIndex)}${targetRow}`, values: [[new Date().toLocaleString()]] });

            const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;
            await this.callWithRetry(() => axios.post(updateUrl, { valueInputOption: 'USER_ENTERED', data: dataToUpdate }, {
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
            }));

            // ⏳ 사용자 요청: API 호출 간 안전한 대기 시간 추가
            await this.sleep(500);

        } catch (e) {
            Logger.error(`❌ 키워드 상태 업데이트 실패 (Row ${rowIndex}): ${e.message}`);
        }
    },

    /**
     * 1-3. 토픽 시트에 새로운 행 추가 (Append)
     */
};
