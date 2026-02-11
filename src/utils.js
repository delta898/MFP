const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const CONFIG = require('./config-loader');
const Logger = require('./logger');

const Utils = {
    sanitizeFileName: function (str) {
        if (!str) return "untitled";
        // 🔧 [Fixed] 파일명 길이 제한 추가 (파일 시스템 에러 방지)
        let cleaned = str.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "_");
        // 파일명 최대 200자로 제한 (확장자 및 경로 고려)
        if (cleaned.length > 200) {
            cleaned = cleaned.substring(0, 200);
        }
        return cleaned;
    },

    sleep: (ms) => new Promise(res => setTimeout(res, ms)),

    // 🔒 토큰 캐싱을 위한 변수
    _cachedAccessToken: null,
    _tokenExpiry: 0,

    /**
     * 🔐 수동 구글 액세스 토큰 발급 (캐싱 적용)
     */
    getGoogleAccessToken: async function () {
        // 캐시된 토큰이 있고, 만료 시간(1시간)보다 5분 여유가 있다면 재사용
        const now = Math.floor(Date.now() / 1000);
        if (this._cachedAccessToken && this._tokenExpiry > now + 300) {
            return this._cachedAccessToken;
        }

        const rawPath = CONFIG.GOOGLE_AUTH_JSON;
        if (!rawPath) throw new Error('설정 파일에 GOOGLE_AUTH_JSON 값이 없습니다.');
        const keyFilePath = path.resolve(process.cwd(), rawPath);

        if (!fs.existsSync(keyFilePath)) throw new Error(`인증 파일을 찾을 수 없습니다: ${keyFilePath}`);

        const fileContent = fs.readFileSync(keyFilePath, 'utf-8');
        const credentials = JSON.parse(fileContent);

        const privateKey = credentials.private_key.replace(/\\n/g, '\n');
        const clientEmail = credentials.client_email;

        const header = { alg: "RS256", typ: "JWT" };
        const payload = {
            iss: clientEmail,
            scope: "https://www.googleapis.com/auth/spreadsheets",
            aud: "https://oauth2.googleapis.com/token",
            exp: now + 3600,
            iat: now
        };

        const base64UrlEncode = (obj) => {
            return Buffer.from(JSON.stringify(obj))
                .toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
        };

        const encodedHeader = base64UrlEncode(header);
        const encodedPayload = base64UrlEncode(payload);

        const sign = crypto.createSign('RSA-SHA256');
        sign.update(`${encodedHeader}.${encodedPayload}`);
        sign.end();
        const signature = sign.sign(privateKey, 'base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

        const jwt = `${encodedHeader}.${encodedPayload}.${signature}`;

        try {
            const res = await axios.post('https://oauth2.googleapis.com/token', null, {
                params: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }
            });

            // 토큰 캐싱 저장
            this._cachedAccessToken = res.data.access_token;
            this._tokenExpiry = now + res.data.expires_in; // 보통 3600초

            return this._cachedAccessToken;
        } catch (e) {
            throw new Error(`토큰 발급 실패: ${e.message}`);
        }
    },

    /**
     * 🛡️ API 호출 래퍼 (Rate Limit 자동 재시도)
     */
    callWithRetry: async function (fn, retries = 5, delay = 2000) {
        for (let i = 0; i < retries; i++) {
            try {
                return await fn();
            } catch (e) {
                // 429(Too Many Requests) 또는 5xx 에러인 경우 재시도
                if (i < retries - 1 && (e.response?.status === 429 || e.response?.status >= 500)) {
                    const wait = delay * Math.pow(2, i); // 지수 백오프
                    Logger.warn(`⚠️ Google API Rate Limit(${e.response?.status}). ${wait / 1000}초 후 재시도...`);
                    await new Promise(res => setTimeout(res, wait));
                } else {
                    throw e;
                }
            }
        }
    },

    /**
     * 0. 초기화: 모든 필수 시트가 있는지 확인하고 없으면 생성
     */
    ensureAllSheetsExist: async function () {
        try {
            Logger.info("🔍 필수 시트 존재 여부 확인 중...");
            const accessToken = await this.getGoogleAccessToken();
            const spreadsheetId = CONFIG.GOOGLE_SHEET_ID;

            // 현재 시트 목록 조회
            const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
            const metaRes = await this.callWithRetry(() => axios.get(metaUrl, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            }));

            const existingSheets = metaRes.data.sheets.map(s => s.properties.title);
            const requiredSheets = [
                { name: CONFIG.GOOGLE_TRENDS_SHEET || 'trends', type: 'trends' },
                { name: CONFIG.GOOGLE_KEYWORDS_SHEET || 'keywords', type: 'keywords' },
                { name: CONFIG.GOOGLE_TOPICS_SHEET || 'topics', type: 'topics' }
            ];

            for (const sheet of requiredSheets) {
                if (!existingSheets.includes(sheet.name)) {
                    Logger.info(`✨ '${sheet.name}' 시트가 없어서 생성을 시작합니다...`);
                    await this.createSheetIfMissing(accessToken, spreadsheetId, sheet.name, sheet.type);
                } else {
                    // Logger.info(`   ✅ '${sheet.name}' 시트 확인됨`);
                }
            }
            Logger.info("✅ 모든 필수 시트 준비 완료");

        } catch (e) {
            Logger.error(`❌ 시트 초기화 실패: ${e.message}`);
            // 초기화 실패해도 프로그램은 계속 진행하도록 (치명적이지 않을 수 있음)
        }
    },

    /**
     * 0-1. 시트 생성 및 초기화 (헤더, 고정, 드롭다운)
     */
    createSheetIfMissing: async function (accessToken, spreadsheetId, sheetName, type) {
        try {
            // 1. 시트 생성 (1행 고정)
            const createUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
            const createRes = await this.callWithRetry(() => axios.post(createUrl, {
                requests: [{
                    addSheet: {
                        properties: {
                            title: sheetName,
                            gridProperties: { frozenRowCount: 1 }
                        }
                    }
                }]
            }, { headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }));

            const newSheetId = createRes.data.replies[0].addSheet.properties.sheetId;

            // 2. 헤더 및 데이터 유효성 검사 설정
            let headerRow = [];
            let validationRequests = [];

            if (type === 'keywords') {
                // 헤더: keyword, 동작 / 상태, 작업 시간
                headerRow = [['keyword', '동작 / 상태', '작업 시간']];

                // Dropdown: B열 (Index 1) -> 대기, 연관검색어 조사, 연관검색어 조사 완료
                validationRequests.push({
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
                });
            } else if (type === 'topics') {
                // 헤더: blog, subject, keywords, 참고/지시 사항, 상태, 이미지 생성, 외부 참고 여부, 참고 URL, 발행 시간, 로그
                headerRow = [['blog', 'subject', 'keywords', '참고/지시 사항', '상태', '이미지 생성', '외부 참고 여부', '참고 URL', '발행 시간', '로그']];

                // Dropdown: E열 (Index 4) -> 대기, 블로그 발행 준비 완료, 블로그 발행 완료
                validationRequests.push({
                    setDataValidation: {
                        range: { sheetId: newSheetId, startRowIndex: 1, startColumnIndex: 4, endColumnIndex: 5 },
                        rule: {
                            condition: {
                                type: 'ONE_OF_LIST',
                                values: [
                                    { userEnteredValue: '대기' },
                                    { userEnteredValue: '블로그 발행 준비 완료' },
                                    { userEnteredValue: '블로그 발행 완료' }
                                ]
                            },
                            showCustomUi: true, strict: true
                        }
                    }
                });

                // Dropdown: F열 (Index 5) -> Yes, No (이미지 생성 여부)
                validationRequests.push({
                    setDataValidation: {
                        range: { sheetId: newSheetId, startRowIndex: 1, startColumnIndex: 5, endColumnIndex: 6 },
                        rule: {
                            condition: {
                                type: 'ONE_OF_LIST',
                                values: [
                                    { userEnteredValue: 'Yes' },
                                    { userEnteredValue: 'No' }
                                ]
                            },
                            showCustomUi: true, strict: true
                        }
                    }
                });

                // Dropdown: G열 (Index 6) -> Yes, No (외부 참고 여부)
                validationRequests.push({
                    setDataValidation: {
                        range: { sheetId: newSheetId, startRowIndex: 1, startColumnIndex: 6, endColumnIndex: 7 },
                        rule: {
                            condition: {
                                type: 'ONE_OF_LIST',
                                values: [
                                    { userEnteredValue: 'Yes' },
                                    { userEnteredValue: 'No' }
                                ]
                            },
                            showCustomUi: true, strict: true
                        }
                    }
                });
            } else if (type === 'trends') {
                // 헤더: 날짜, 주제, 키워드, 증감, 동작/상태
                headerRow = [['날짜', '주제', '키워드', '증감', '동작/상태']];

                // Dropdown: E열 (Index 4) -> 대기, 키워드 목록에 추가
                validationRequests.push({
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
                });
            }

            // 3. 드롭다운 적용
            if (validationRequests.length > 0) {
                await this.callWithRetry(() => axios.post(createUrl, { requests: validationRequests }, {
                    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
                }));
            }

            // 4. 헤더 쓰기
            const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}:append?valueInputOption=USER_ENTERED`;
            await this.callWithRetry(() => axios.post(appendUrl, { range: sheetName, majorDimension: 'ROWS', values: headerRow }, {
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
            }));

            Logger.info(`   ✅ '${sheetName}' 시트 생성 및 초기화 완료`);

        } catch (e) {
            Logger.error(`   ❌ '${sheetName}' 시트 생성 중 오류: ${e.message}`);
            throw e;
        }
    },

    readGoogleSheetTopics: async function () {
        try {
            Logger.info("🌐 구글 스프레드시트 읽기 (Native Auth Mode)");
            const accessToken = await this.getGoogleAccessToken();

            const sheetName = CONFIG.GOOGLE_TOPICS_SHEET || 'topics';
            const spreadsheetId = CONFIG.GOOGLE_SHEET_ID;
            const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}`;

            const res = await this.callWithRetry(() => axios.get(url, {
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
            }));

            const rows = res.data.values;
            if (!rows || rows.length === 0) return [];

            const headers = rows[0].map(h => h.toLowerCase().replace(/[\s\/_]/g, '').trim());
            const results = rows.slice(1).map((row, index) => {
                const entry = {};
                headers.forEach((h, i) => { entry[h] = row[i] !== undefined ? row[i] : ""; });
                const getVal = (cols) => {
                    for (let col of cols) {
                        const cleanCol = col.toLowerCase().replace(/[\s\/_]/g, '').trim();
                        if (entry[cleanCol]) return String(entry[cleanCol]).trim();
                    }
                    return "";
                };

                const subject = getVal(['subject', '주제', '제목']);
                const kwStr = getVal(['keywords', '키워드']);
                const instruction = getVal(['참고지시사항', '참고/지시사항', 'instruction', '지시사항', '내용']);
                const urlStr = getVal(['참고url', '참고/url', 'references', 'url']);
                const status = getVal(['상태', 'status']);
                const imgGenStr = getVal(['이미지생성', 'image_gen', 'img_gen']);
                const imgCountStr = getVal(['이미지개수', 'image_count', 'count']);
                const extRefStr = getVal(['외부참고여부', 'external_ref', 'ext_ref']);

                return {
                    rowIndex: index,
                    subject: subject || undefined,
                    keywords: kwStr ? kwStr.split(',').map(k => k.trim()).filter(k => k) : [],
                    content_guide: {
                        additional_instructions: instruction,
                        reference_urls: urlStr ? urlStr.split(',').map(u => u.trim()).filter(u => u) : []
                    },
                    status: status ? status.trim() : "",
                    use_external_ref: ['y', 'yes', 'true', 't', '예', '참', 'o'].includes(extRefStr.toLowerCase()),
                    image_options: {
                        generate: ['y', 'yes', 'true', 't', '예', '참', 'o'].includes(imgGenStr.toLowerCase()),
                        count: parseInt(imgCountStr) || 4
                    }
                };
            });

            // 🔥 [수정됨] 주제, 키워드, URL 중 하나라도 있으면 OK
            return results.filter(item => {
                const hasData = item.subject ||
                    item.keywords.length > 0 ||
                    item.content_guide.reference_urls.length > 0; // 👈 여기 추가됨
                return hasData && (item.status === '블로그 발행 준비 완료');
            });

        } catch (e) {
            Logger.error(`❌ 구글 시트 읽기 실패: ${e.message}`);
            return [];
        }
    },

    /**
     * 1-1. 키워드 시트 읽기 ('연관검색어 조사' 상태만)
     */
    readGoogleSheetKeywords: async function () {
        try {
            Logger.info("🌐 구글 키워드 시트 읽기 (Target: 연관검색어 조사)");
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
            Logger.error(`❌ 키워드 시트 읽기 실패: ${e.message}`);
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
    appendGoogleSheetTopics: async function (newTopics) {
        if (!newTopics || newTopics.length === 0) return;

        try {
            const accessToken = await this.getGoogleAccessToken();
            const sheetName = CONFIG.GOOGLE_TOPICS_SHEET || 'topics';
            const spreadsheetId = CONFIG.GOOGLE_SHEET_ID;

            // 순서: 주제, 키워드, 참고지시사항, 참고URL, 상태, 이미지생성, 이미지개수, 로그, 발행시간
            // (헤더 순서를 모르므로, 일반적인 순서로 값을 준비하고 append)
            // *중요*: 사용자의 헤더 순서와 맞지 않을 수 있지만, append endpoint는 컬럼 매핑 기능이 없음.
            // 따라서 3.0버전부터는 헤더를 읽어서 순서대로 정렬하는 로직 필요하나, 현재는 약속된 순서(또는 주요 컬럼만)로 추가 시도.
            // 여기서는 헤더를 먼저 읽어서 매핑하는 방식을 사용.

            const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:1`;

            let headerRes;
            try {
                headerRes = await this.callWithRetry(() => axios.get(readUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } }));
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
                    // (appendGoogleSheetTopics) Status: E열 (Index 4) -> 대기, 블로그 발행 준비 완료, 블로그 발행 완료
                    // 이미지 생성: F열 (Index 5) -> Yes, No
                    // 외부 참고 여부: G열 (Index 6) -> Yes, No
                    const validationReq = {
                        requests: [{
                            setDataValidation: {
                                range: { sheetId: newSheetId, startRowIndex: 1, startColumnIndex: 4, endColumnIndex: 5 },
                                rule: {
                                    condition: {
                                        type: 'ONE_OF_LIST',
                                        values: [
                                            { userEnteredValue: '대기' },
                                            { userEnteredValue: '블로그 발행 준비 완료' },
                                            { userEnteredValue: '블로그 발행 완료' }
                                        ]
                                    },
                                    showCustomUi: true, strict: true
                                }
                            }
                        }, {
                            setDataValidation: {
                                range: { sheetId: newSheetId, startRowIndex: 1, startColumnIndex: 5, endColumnIndex: 6 },
                                rule: {
                                    condition: {
                                        type: 'ONE_OF_LIST',
                                        values: [
                                            { userEnteredValue: 'Yes' },
                                            { userEnteredValue: 'No' }
                                        ]
                                    },
                                    showCustomUi: true, strict: true
                                }
                            }
                        }, {
                            setDataValidation: {
                                range: { sheetId: newSheetId, startRowIndex: 1, startColumnIndex: 6, endColumnIndex: 7 },
                                rule: {
                                    condition: {
                                        type: 'ONE_OF_LIST',
                                        values: [
                                            { userEnteredValue: 'Yes' },
                                            { userEnteredValue: 'No' }
                                        ]
                                    },
                                    showCustomUi: true, strict: true
                                }
                            }
                        }]
                    };
                    await this.callWithRetry(() => axios.post(createUrl, validationReq, { headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' } }));

                    // 헤더 추가: blog, subject, keywords, 참고/지시 사항, 상태, 이미지 생성, 외부 참고 여부, 참고 URL, 발행 시간, 로그
                    const headerRow = [['blog', 'subject', 'keywords', '참고/지시 사항', '상태', '이미지 생성', '외부 참고 여부', '참고 URL', '발행 시간', '로그']];
                    const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}:append?valueInputOption=USER_ENTERED`;
                    await this.callWithRetry(() => axios.post(appendUrl, { range: sheetName, majorDimension: 'ROWS', values: headerRow }, {
                        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
                    }));

                    Logger.info(`   ✅ 시트 생성 및 헤더 추가 완료`);
                    // 헤더가 생성되었으므로 다시 읽기보다는, 생성한 헤더를 그대로 사용
                    headerRes = { data: { values: headerRow } };
                } else {
                    throw e;
                }
            }

            const headers = headerRes.data.values[0];
            const map = {};
            headers.forEach((h, i) => {
                const clean = h.toLowerCase().replace(/[\s\/_]/g, '');
                if (clean.includes('blog') || clean.includes('블로그')) map.blog = i;
                else if (clean.includes('주제') || clean.includes('subject')) map.subject = i;
                else if (clean.includes('키워드') || clean.includes('keyword')) map.keyword = i;
                else if (clean.includes('외부참고') || clean.includes('extref') || clean.includes('external')) map.extRef = i;
                else if (clean.includes('url') || clean.includes('참고')) map.url = i;
                else if (clean.includes('상태') || clean.includes('status')) map.status = i;
                else if (clean.includes('이미지생성') || clean.includes('gen')) map.imgGen = i;
            });

            // 헤더가 없거나 매핑이 안되면 기본값 사용
            if (map.blog === undefined) map.blog = 0;
            if (map.subject === undefined) map.subject = 1;
            if (map.keyword === undefined) map.keyword = 2;

            const maxCol = Math.max(...Object.values(map));
            const rowsToAdd = newTopics.map(topic => {
                const row = new Array(maxCol + 1).fill("");
                if (map.blog !== undefined) row[map.blog] = 'naver'; // 기본값 'naver'
                if (map.subject !== undefined) row[map.subject] = topic.subject;
                if (map.keyword !== undefined) row[map.keyword] = topic.keywords;
                if (map.extRef !== undefined) row[map.extRef] = topic.use_external_ref !== undefined ? (topic.use_external_ref ? 'Yes' : 'No') : 'Yes';
                if (map.url !== undefined) row[map.url] = topic.reference_urls || '';
                if (map.status !== undefined) row[map.status] = '대기';
                if (map.imgGen !== undefined) row[map.imgGen] = 'No'; // 사용자 요청: 기본값 No
                return row;
            });

            const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}:append?valueInputOption=USER_ENTERED`;

            await this.callWithRetry(() => axios.post(appendUrl, { range: sheetName, majorDimension: 'ROWS', values: rowsToAdd }, {
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
            }));

            // ⏳ 사용자 요청: API 호출 간 안전한 대기 시간 추가
            await this.sleep(1000);

            Logger.info(`   ✅ 토픽 시트에 ${rowsToAdd.length}건 추가 완료`);

        } catch (e) {
            Logger.error(`❌ 토픽 추가 실패: ${e.message}`);
        }
    },

    /**
     * 1-6. 트렌드 시트에 데이터 추가 (Date, Category, Keyword, Status)
     */
    appendGoogleSheetTrends: async function (trendData) {
        if (!trendData || trendData.length === 0) return;

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
            const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

            const rowsToAdd = trendData.map(item => {
                const row = new Array(maxCol + 1).fill("");
                if (map.date !== undefined) row[map.date] = dateStr;
                if (map.category !== undefined) row[map.category] = item.category;
                if (map.keyword !== undefined) row[map.keyword] = item.keyword;
                if (map.variation !== undefined) row[map.variation] = item.variation || '-';
                if (map.status !== undefined) row[map.status] = '대기';
                return row;
            });

            const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}:append?valueInputOption=USER_ENTERED`;

            await this.callWithRetry(() => axios.post(appendUrl, { range: sheetName, majorDimension: 'ROWS', values: rowsToAdd }, {
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
            }));

            // ⏳ API 호출 간 안전 대기
            await this.sleep(1000);

            Logger.info(`   ✅ 트렌드 시트(${sheetName})에 ${rowsToAdd.length}건 추가 완료`);

        } catch (e) {
            Logger.error(`❌ 트렌드 시트 추가 실패: ${e.message}`);
        }
    },

    /**
     * 1-3-1. 네이버 블로그 URL 모바일 변환 헬퍼
     */
    convertToMobileNaverBlogUrl: function (url) {
        if (!url) return url;
        if (url.includes('blog.naver.com') && !url.includes('m.blog.naver.com')) {
            return url.replace('http://blog.naver.com', 'https://m.blog.naver.com')
                .replace('https://blog.naver.com', 'https://m.blog.naver.com');
        }
        return url;
    },

    /**
     * 1-4. 네이버 연관검색어 추출
     */
    fetchNaverRelatedKeywords: async function (keyword) {
        try {
            const url = `https://ac.search.naver.com/nx/ac?q=${encodeURIComponent(keyword)}&st=1000&frm=nv&ans=1`;
            const res = await axios.get(url);

            // items 배열 추출
            const items = res.data?.items?.[0];
            if (!items || !Array.isArray(items)) return [];

            // items는 [[keyword, ...], [keyword, ...]] 형태
            const keywords = items.map(item => item[0]);
            return keywords;

        } catch (e) {
            Logger.warn(`⚠️ 연관검색어 추출 실패 (${keyword}): ${e.message}`);
            return [];
        }
    },

    /**
     * 1-5. 네이버 블로그 검색 (참고 URL 수집)
     */
    fetchNaverBlogSearchResults: async function (keyword) {
        if (!CONFIG.NAVER_CLIENT_ID || !CONFIG.NAVER_CLIENT_SECRET) {
            Logger.warn("⚠️ 네이버 검색 API 설정(Client ID/Secret)이 없습니다. 블로그 검색을 건너뜁니다.");
            return [];
        }

        try {
            const url = `https://openapi.naver.com/v1/search/blog.json`;
            const res = await axios.get(url, {
                headers: {
                    'X-Naver-Client-Id': CONFIG.NAVER_CLIENT_ID,
                    'X-Naver-Client-Secret': CONFIG.NAVER_CLIENT_SECRET
                },
                params: {
                    query: keyword,
                    display: 5,
                    sort: 'sim' // 정확도순
                }
            });

            if (res.data && res.data.items) {
                // postdate 기준 내림차순 정렬 (최신순)
                const items = res.data.items.sort((a, b) => Number(b.postdate) - Number(a.postdate));

                // 가장 최신 글 1개의 링크만 리턴
                if (items.length > 0) {
                    let link = items[0].link;
                    return this.convertToMobileNaverBlogUrl(link);
                }
            }
            return "";

        } catch (e) {
            Logger.warn(`⚠️ 블로그 검색 API 실패 (${keyword}): ${e.message}`);
            return "";
        }
    },

    /**
     * 1-5-1. 네이버 블로그 인기글 상위 N개 URL 수집 (최신순)
     * - 외부 참고 여부가 Yes인 경우 batch 실행 시 호출
     * - 모든 로그는 DEBUG 레벨에서만 출력
     */
    fetchNaverBlogTopPosts: async function (keyword, count) {
        const Constants = require('./constants');
        const blogCount = count || Constants.REFERENCE_BLOG_COUNT || 3;

        if (!CONFIG.NAVER_CLIENT_ID || !CONFIG.NAVER_CLIENT_SECRET) {
            Logger.debug('🔍 [외부 참고] 네이버 검색 API 설정이 없어 인기글 수집을 건너뜁니다.');
            return [];
        }

        try {
            const url = `https://openapi.naver.com/v1/search/blog.json`;
            const res = await axios.get(url, {
                headers: {
                    'X-Naver-Client-Id': CONFIG.NAVER_CLIENT_ID,
                    'X-Naver-Client-Secret': CONFIG.NAVER_CLIENT_SECRET
                },
                params: {
                    query: keyword,
                    display: Math.max(blogCount * 2, 10), // 여유를 두고 많이 가져와서 필터링
                    sort: 'sim' // 정확도순
                }
            });

            if (res.data && res.data.items && res.data.items.length > 0) {
                // postdate 기준 내림차순 정렬 (최신순)
                const sorted = res.data.items.sort((a, b) => Number(b.postdate) - Number(a.postdate));

                // 상위 N개만 선택 후 모바일 URL 변환
                const topPosts = sorted.slice(0, blogCount).map(item => {
                    return {
                        title: (item.title || '').replace(/<[^>]*>/g, ''), // HTML 태그 제거
                        link: this.convertToMobileNaverBlogUrl(item.link),
                        postdate: item.postdate || ''
                    };
                });

                Logger.debug(`🔍 [외부 참고] '${keyword}' 인기글 ${topPosts.length}개 수집 완료`);
                return topPosts;
            }

            Logger.debug(`🔍 [외부 참고] '${keyword}' 검색 결과 없음`);
            return [];

        } catch (e) {
            Logger.debug(`🔍 [외부 참고] 인기글 수집 실패 (${keyword}): ${e.message}`);
            return [];
        }
    },

    /**
     * 2. 구글 시트 상태 업데이트
     * 🔧 [Fixed] 재시도 로직 추가 및 백업 로깅
     */
    /**
     * 2. 구글 시트 상태 업데이트
     * 🔧 [Refactored] callWithRetry 사용 및 백업 로깅 유지
     */
    updateGoogleSheetStatus: async function (rowIndex, status, logMessage) {
        try {
            const accessToken = await this.getGoogleAccessToken();
            const sheetName = CONFIG.GOOGLE_TOPICS_SHEET || 'topics';
            const spreadsheetId = CONFIG.GOOGLE_SHEET_ID;

            // 헤더 읽기
            const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:1`;
            const headerRes = await this.callWithRetry(() => axios.get(readUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } }));

            const headers = headerRes.data.values[0];
            let statusColIndex = -1, logColIndex = -1, timeColIndex = -1;

            headers.forEach((h, i) => {
                const clean = h.toLowerCase().replace(/[\s\/_]/g, '');
                if (clean.includes('상태') || clean.includes('status')) statusColIndex = i;
                else if (clean.includes('로그') || clean.includes('log')) logColIndex = i;
                else if (clean.includes('발행') || clean.includes('time')) timeColIndex = i;
            });

            const targetRow = rowIndex + 2;
            const toA1 = (colIdx) => {
                let letter = '';
                let num = colIdx;
                while (num >= 0) {
                    letter = String.fromCharCode((num % 26) + 65) + letter;
                    num = Math.floor(num / 26) - 1;
                    if (num < 0) break;
                }
                return letter;
            };

            const dataToUpdate = [];
            if (statusColIndex !== -1) dataToUpdate.push({ range: `${sheetName}!${toA1(statusColIndex)}${targetRow}`, values: [[status]] });
            if (logColIndex !== -1) dataToUpdate.push({ range: `${sheetName}!${toA1(logColIndex)}${targetRow}`, values: [[logMessage]] });
            if (timeColIndex !== -1) dataToUpdate.push({ range: `${sheetName}!${toA1(timeColIndex)}${targetRow}`, values: [[new Date().toLocaleString()]] });

            if (dataToUpdate.length === 0) return;

            const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;
            await this.callWithRetry(() => axios.post(updateUrl, { valueInputOption: 'USER_ENTERED', data: dataToUpdate }, {
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
            }));

            // ⏳ API 호출 간 안전 대기
            await this.sleep(500);

        } catch (e) {
            Logger.error(`❌ 구글 시트 업데이트 최종 실패 (Row ${rowIndex + 1}): ${e.message}`);
            // 🔧 [Backup] 로컬 파일에 백업 기록
            const backupLog = `${new Date().toISOString()} | Row ${rowIndex + 1} | ${status} | ${logMessage}\n`;
            try {
                fs.appendFileSync('failed_updates.log', backupLog);
                Logger.warn(`   💾 백업 로그에 기록됨: failed_updates.log`);
            } catch (fileErr) {
                Logger.error(`   ❌ 백업 로그 기록 실패: ${fileErr.message}`);
            }
        }
    },

    /**
     * 3. 엑셀 읽기 (기존 유지 + 필터 수정)
     */
    // 3. (Deleted) Excel Support Removed
    // readExcelTopics & updateExcelStatus functions were removed.

    fetchReferenceContent: async function (url) {
        if (!url) return "";
        // 🔒 외부 참고 관련 로그는 DEBUG 레벨에서만 출력
        Logger.debug(`🌐 [Scraping] 접속 시도: ${url}`);
        const cheerio = require('cheerio');
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
                },
                timeout: CONFIG.SCRAPING_TIMEOUT || 20000,
                maxRedirects: 5
            });
            const $ = cheerio.load(response.data);
            const tagsToRemove = ['script', 'style', 'nav', 'footer', 'header', 'iframe', 'noscript', '.ad', '#ad', 'form', 'button'];
            tagsToRemove.forEach(tag => $(tag).remove());
            const rawText = $('body').text();
            const cleanText = rawText.replace(/\s+/g, ' ').trim();
            Logger.debug(`   ✅ 스크래핑 성공 (길이: ${cleanText.length}자)`);
            return cleanText.substring(0, 3500);
        } catch (e) {
            Logger.debug(`⚠️ 스크래핑 실패 (${url}): ${e.message}`);
            return "";
        }
    },

    // 🔧 [Fixed] Gemini API 재시도 로직 추가 (지수 백오프)
    callGeminiText: async function (prompt, retries = 3) {
        if (!CONFIG.GEMINI_API_KEY) throw new Error('API Key 누락');

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const response = await axios.post(`${CONFIG.GEMINI_TEXT_ENDPOINT}?key=${CONFIG.GEMINI_API_KEY}`,
                    { contents: [{ parts: [{ text: prompt }] }] },
                    { headers: { 'Content-Type': 'application/json' } }
                );
                const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!text) throw new Error('Empty response from Gemini');
                return text;
            } catch (e) {
                Logger.warn(`⚠️ Gemini Text API 호출 실패 (시도 ${attempt}/${retries}): ${e.message}`);

                if (attempt === retries) {
                    Logger.error(`❌ Gemini Text API 최대 재시도 횟수 초과`);
                    throw e; // null 대신 에러 throw
                }

                // 지수 백오프 (1초, 2초, 4초...)
                const waitTime = 1000 * Math.pow(2, attempt - 1);
                Logger.info(`   ⏳ ${waitTime / 1000}초 후 재시도...`);
                await this.sleep(waitTime);
            }
        }
    },

    // 🔧 [Fixed] 이미지 생성 API 재시도 로직 추가
    callGeminiImage: async function (prompt, savePath, retries = 3) {
        if (!CONFIG.GEMINI_API_KEY) throw new Error('API Key 누락');

        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const endpoint = `${CONFIG.GEMINI_IMAGE_ENDPOINT}?key=${CONFIG.GEMINI_API_KEY}`;
                const response = await axios.post(endpoint,
                    { contents: [{ parts: [{ text: prompt }] }] },
                    { headers: { 'Content-Type': 'application/json' } }
                );
                const candidates = response.data.candidates;
                if (!candidates || candidates.length === 0) throw new Error("No candidates returned");
                const imagePart = candidates[0].content.parts.find(part => part.inlineData);
                if (!imagePart) throw new Error('No inlineData found');

                const fullPath = `${savePath}.png`;
                fs.writeFileSync(fullPath, Buffer.from(imagePart.inlineData.data, 'base64'));
                Logger.info(`   ✅ 이미지 저장 완료: ${path.basename(fullPath)}`);
                return fullPath;
            } catch (e) {
                Logger.warn(`⚠️ Gemini Image API 호출 실패 (시도 ${attempt}/${retries}): ${e.message}`);

                if (attempt === retries) {
                    Logger.error(`❌ 이미지 생성 최대 재시도 횟수 초과`);
                    throw e; // null 대신 에러 throw
                }

                // 지수 백오프
                const waitTime = 1000 * Math.pow(2, attempt - 1);
                Logger.info(`   ⏳ ${waitTime / 1000}초 후 재시도...`);
                await this.sleep(waitTime);
            }
        }
    },

    parseMarkdown: function (raw) {
        const lines = raw.split('\n');
        let title = '';
        const contents = [];
        let skipImageBlock = false;
        let currentImageIndex = null;
        let currentImageLines = [];

        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!title && trimmedLine.startsWith('# ')) {
                title = trimmedLine.replace(/^#\s+/, '').trim();
                continue;
            }
            const imageStart = trimmedLine.match(/^\[\[IMAGE_(\d+)/);
            if (imageStart) {
                // 🔧 [Fixed] 중첩된 이미지 블록 감지 및 처리
                if (skipImageBlock) {
                    Logger.warn(`⚠️ 중첩된 이미지 블록 감지: ${trimmedLine}`);
                    // 이전 블록 강제 종료
                    contents.push({
                        type: 'image',
                        index: currentImageIndex,
                        raw: currentImageLines.join('\n'),
                        text: 'Error: Nested block detected',
                        prompt: 'Invalid nested block'
                    });
                }

                skipImageBlock = true;
                currentImageIndex = Number(imageStart[1]);
                currentImageLines = [line];
                if (trimmedLine.endsWith(']]')) {
                    const blockText = currentImageLines.join('\n');
                    contents.push({
                        type: 'image', index: currentImageIndex, raw: blockText,
                        text: this.extractInfo(blockText, 'title'), prompt: this.extractInfo(blockText, 'prompt')
                    });
                    skipImageBlock = false;
                }
                continue;
            }
            if (skipImageBlock) {
                currentImageLines.push(line);
                if (trimmedLine.includes(']]')) {
                    const blockText = currentImageLines.join('\n');
                    contents.push({
                        type: 'image', index: currentImageIndex, raw: blockText,
                        text: this.extractInfo(blockText, 'title'), prompt: this.extractInfo(blockText, 'prompt')
                    });
                    skipImageBlock = false;
                }
                continue;
            }
            if (trimmedLine === '') { contents.push({ type: 'newline' }); continue; }
            if (/^##\s+/.test(trimmedLine)) {
                contents.push({ type: 'header-h2', text: trimmedLine.replace(/^##\s+/, '').trim() });
                continue;
            }
            contents.push({ type: 'paragraph', text: line.replace(/\*\*(.*?)\*\*/g, '$1') });
        }
        return { title, contents };
    },

    extractInfo: function (txt, key) {
        let val = '';
        const regex = new RegExp(`^${key}\\s*:`, 'i');
        txt.split('\n').forEach(l => {
            const trimmed = l.trim();
            if (regex.test(trimmed)) { val = trimmed.replace(regex, '').trim(); }
        });
        return val;
    }
};

module.exports = Utils;
