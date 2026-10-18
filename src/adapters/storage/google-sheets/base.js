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
    _sheetCache: {}, // { key: { data: any, expiry: number } }
    _headerCache: {}, // { key: { map: any, timestamp: number } }

    /**
     * 🛡️ 간단한 시간 기반 캐시 래퍼 (5초 TTL)
     */
    withSimpleCache: async function (key, fn, ttlMs = 5000) {
        const now = Date.now();
        const entry = this._sheetCache[key];
        if (entry && entry.expiry > now) {
            return entry.data;
        }
        const data = await fn();
        this._sheetCache[key] = { data, expiry: now + ttlMs };
        return data;
    },

    /**
     * 🧹 캐시 강제 무효화
     */
    clearSheetCache: function (keyPrefix) {
        if (keyPrefix) {
            Object.keys(this._sheetCache).forEach(k => {
                if (k === keyPrefix || k.startsWith(keyPrefix + '_') || k.startsWith(keyPrefix)) {
                    delete this._sheetCache[k];
                }
            });
        } else {
            this._sheetCache = {};
        }
    },

    _cachedAccessToken: null,
    _tokenExpiry: 0,
    _cachedScopeKey: '',
    _sheetsHealthLogState: {
        hasIssue: null,
        lastIssueMessage: '',
        updatedAt: null
    },

    clearGoogleAuthCache: function () {
        this._cachedAccessToken = null;
        this._tokenExpiry = 0;
        this._cachedScopeKey = '';
    },

    /**
     * 🔐 수동 구글 액세스 토큰 발급 (캐싱 적용)
     */
    getGoogleAccessToken: async function (scopes = []) {
        const normalizedScopes = (() => {
            const incoming = Array.isArray(scopes) ? scopes : [];
            const merged = incoming.length > 0
                ? incoming
                : ['https://www.googleapis.com/auth/drive.file'];
            return Array.from(new Set(merged.map(s => String(s || '').trim()).filter(Boolean))).sort();
        })();
        const scopeKey = normalizedScopes.join(' ');

        // 캐시된 토큰이 있고, 만료 시간(1시간)보다 5분 여유가 있다면 재사용
        const now = Math.floor(Date.now() / 1000);
        if (this._cachedAccessToken && this._tokenExpiry > now + 300 && this._cachedScopeKey === scopeKey) {
            return this._cachedAccessToken;
        }

        try {
            const { accessToken, tokens } = await GoogleOAuth.getAccessToken(normalizedScopes);
            this._cachedAccessToken = accessToken;
            this._tokenExpiry = Math.floor(Number(tokens.expiry_date || 0) / 1000);
            this._cachedScopeKey = scopeKey;
            return accessToken;
        } catch (e) {
            throw new Error(`Google OAuth 토큰 발급 실패: ${e.message}`);
        }
    },

    /**
     * 🛡️ API 호출 래퍼 (Rate Limit 자동 재시도)
     */
    callWithRetry: async function (fn, retries = 5, delay = 2000) {
        for (let i = 0; i < retries; i++) {
            try {
                // 🛡️ [Fixed] 기본 타임아웃 15초 부여 (무한 대기 방지)
                return await fn();
            } catch (e) {
                // 429(Too Many Requests) 또는 5xx 에러인 경우 재시도
                if (i < retries - 1 && (e.response?.status === 429 || e.response?.status >= 500)) {
                    const wait = delay * Math.pow(2, i); // 지수 백오프
                    Logger.warn(`⚠️ Google Sheets API Rate Limit(${e.response?.status}). ${wait / 1000}초 후 재시도...`);
                    await new Promise(res => setTimeout(res, wait));
                } else {
                    throw new Error(this.formatAxiosError(e));
                }
            }
        }
    },

    /**
     * 🌐 Google Sheets API POST 요청 래퍼
     */
    googleSheetPost: async function (url, data) {
        const accessToken = await this.getGoogleAccessToken();
        return this.callWithRetry(() => axios.post(url, data, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        })).then(res => res.data);
    },

    /**
     * 🔍 시트 이름으로 sheetId 조회
     */
    getSheetIdByName: async function (spreadsheetId, sheetName) {
        const accessToken = await this.getGoogleAccessToken();
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`;
        const res = await this.callWithRetry(() => axios.get(url, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        }));

        const sheet = (res.data.sheets || []).find(s => s.properties.title === sheetName);
        return sheet ? sheet.properties.sheetId : null;
    },

    /**
     * 0. 초기화: 모든 필수 시트가 있는지 확인하고 없으면 생성
     */
    ensureAllSheetsExist: async function () {
        return this._ensureAllSheetsExistInternal({ spreadsheetId: CONFIG.GOOGLE_SHEET_ID, suppressError: true });
    },

    ensureAllSheetsExistStrict: async function (spreadsheetId) {
        return this._ensureAllSheetsExistInternal({ spreadsheetId, suppressError: false });
    },

    ensureSnsSheetReadyStrict: async function (spreadsheetId = CONFIG.GOOGLE_SHEET_ID) {
        const accessToken = await this.getGoogleAccessToken();
        const targetSpreadsheetId = String(spreadsheetId || '').trim();
        if (!targetSpreadsheetId) throw new Error('GOOGLE_SHEET_ID가 비어 있습니다.');

        await this._ensureSnsSheetReady(accessToken, targetSpreadsheetId, { suppressError: false });
        return {
            success: true,
            spreadsheetId: targetSpreadsheetId,
            sheetName: SNS_SHEET_NAME
        };
    },

    ensureCardNewsSheetReadyStrict: async function (spreadsheetId = CONFIG.GOOGLE_SHEET_ID) {
        const accessToken = await this.getGoogleAccessToken();
        const targetSpreadsheetId = String(spreadsheetId || '').trim();
        if (!targetSpreadsheetId) throw new Error('GOOGLE_SHEET_ID가 비어 있습니다.');

        await this._ensureCardNewsSheetReady(accessToken, targetSpreadsheetId, { suppressError: false });
        return {
            success: true,
            spreadsheetId: targetSpreadsheetId,
            sheetName: CARD_NEWS_SHEET_NAME
        };
    },

    readGoogleSheetTrends: async function (options = {}) {
        const result = [];
        try {
            if (!options.silent) Logger.info("🌐 구글 트렌드 시트 전체 스캔 중...");
            const accessToken = await this.getGoogleAccessToken();
            const spreadsheetId = CONFIG.GOOGLE_SHEET_ID;
            const sheetName = CONFIG.GOOGLE_TRENDS_SHEET || 'trends';
            const targetSpreadsheetId = String(spreadsheetId || '').trim();
            if (!targetSpreadsheetId) throw new Error('GOOGLE_SHEET_ID가 비어 있습니다.');

            const url = `https://sheets.googleapis.com/v4/spreadsheets/${targetSpreadsheetId}/values/${encodeURIComponent(sheetName)}`;
            const res = await this.callWithRetry(() => axios.get(url, {
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
            }));

            const rows = res.data.values;
            if (!rows || rows.length === 0) return [];

            const headers = rows[0].map(h => h.toLowerCase().replace(/[\s\/_]/g, '').trim());
            const parsed = rows.slice(1).map((row, index) => {
                const entry = {};
                headers.forEach((h, i) => { entry[h] = row[i] !== undefined ? row[i] : ""; });
                const getVal = (cols) => {
                    for (const col of cols) {
                        const cleanCol = String(col).toLowerCase().replace(/[\s\/_]/g, '').trim();
                        if (Object.prototype.hasOwnProperty.call(entry, cleanCol) && String(entry[cleanCol]).trim() !== '') {
                            return String(entry[cleanCol]).trim();
                        }
                    }
                    return "";
                };

                const date = getVal(['날짜', 'date']);
                const subject = getVal(['주제', 'subject']);
                const keywords = getVal(['키워드', 'keyword']);
                const change = getVal(['증감', 'change']);
                const status = getVal(['동작상태', '동작/상태', 'status']);

                return {
                    rowIndex: index,
                    rowNumber: index + 2,
                    date: date || '',
                    subject: subject || '',
                    keywords: keywords ? keywords.split(',').map(k => k.trim()).filter(k => k) : [],
                    change: change || '',
                    status: status || ''
                };
            });

            return parsed;

        } catch (e) {
            if (CONFIG.CONFIG_IS_ESSENTIAL_SET) {
                Logger.info(`구글 트렌드 시트 읽기 실패: ${e.message} (미사용 시 무시 가능)`);
            }
            return [];
        }
    },

    _ensureAllSheetsExistInternal: async function ({ spreadsheetId, suppressError }) {
        try {
            const accessToken = await this.getGoogleAccessToken();
            const targetSpreadsheetId = String(spreadsheetId || '').trim();
            if (!targetSpreadsheetId) throw new Error('GOOGLE_SHEET_ID가 비어 있습니다.');

            // 현재 시트 목록 조회
            const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${targetSpreadsheetId}`;
            const metaRes = await this.callWithRetry(() => axios.get(metaUrl, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            }));

            const existingSheets = metaRes.data.sheets.map(s => s.properties.title);
            const requiredSheets = [
                // [REMOVED] trends, keywords 시트는 production에서 불필요하여 자동 생성에서 제외됨
                // { name: CONFIG.GOOGLE_TRENDS_SHEET || 'trends', type: 'trends' },
                // { name: CONFIG.GOOGLE_KEYWORDS_SHEET || 'keywords', type: 'keywords' },
                { name: CONFIG.GOOGLE_TOPICS_SHEET || 'topics', type: 'topics' },
                { name: CONFIG.GOOGLE_SHOPPING_SHEET || 'shopping', type: 'shopping' }
            ];

            for (const sheet of requiredSheets) {
                if (!existingSheets.includes(sheet.name)) {
                    Logger.info(`✨ '${sheet.name}' 시트가 없어서 생성을 시작합니다...`);
                    await this.createSheetIfMissing(accessToken, targetSpreadsheetId, sheet.name, sheet.type);
                } else {
                    // [Added] 이미 존재하는 시트에도 필수 헤더(특히 options)가 있는지 확인하고 동기화
                    await this._syncSheetHeadersIfMissing(accessToken, targetSpreadsheetId, sheet.name, sheet.type);
                }
            }

            // 이미 존재하는 shopping 시트도 상태 드롭다운(발행 중 포함)을 최신 규칙으로 보정
            const shoppingSheetName = CONFIG.GOOGLE_SHOPPING_SHEET || 'shopping';
            const latestMeta = await this.callWithRetry(() => axios.get(metaUrl, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            }));
            const topicsSheetName = CONFIG.GOOGLE_TOPICS_SHEET || 'topics';
            const topicsSheet = (latestMeta.data.sheets || []).find(s => s.properties?.title === topicsSheetName);
            if (topicsSheet?.properties?.sheetId !== undefined) {
                await this.ensureTopicsSheetImageModeValidation(accessToken, targetSpreadsheetId, topicsSheet.properties.sheetId, topicsSheetName);
            }
            const shoppingSheet = (latestMeta.data.sheets || []).find(s => s.properties?.title === shoppingSheetName);
            if (shoppingSheet?.properties?.sheetId !== undefined) {
                await this.ensureShoppingSheetValidation(accessToken, targetSpreadsheetId, shoppingSheet.properties.sheetId, shoppingSheetName);
            }

            // SNS는 모든 플랜에 공통으로 준비하되, 준비 실패가 topics/shopping 사용을 막지는 않는다.
            // 실제 SNS 수집/발행 경로에서는 ensureSnsSheetReadyStrict()로 다시 확인한다.
            const snsResult = await this._ensureSnsSheetReady(accessToken, targetSpreadsheetId, { suppressError: true });
            // 카드뉴스 관리대장은 SNS처럼 독립적으로 준비하며, 실패가 기존 글쓰기 기능을 막지 않는다.
            const cardNewsResult = await this._ensureCardNewsSheetReady(accessToken, targetSpreadsheetId, { suppressError: true });

            if (this._sheetsHealthLogState?.hasIssue === true) {
                Logger.info("✅ 필수 시트 준비 이슈 해지");
            }
            this._sheetsHealthLogState = {
                hasIssue: false,
                lastIssueMessage: '',
                updatedAt: new Date().toISOString()
            };
            return {
                success: true,
                spreadsheetId: targetSpreadsheetId,
                snsReady: snsResult.success,
                snsMessage: snsResult.message || '',
                cardNewsReady: cardNewsResult.success,
                cardNewsMessage: cardNewsResult.message || ''
            };

        } catch (e) {
            const errMessage = String(e?.message || e || 'unknown');
            const prevHasIssue = this._sheetsHealthLogState?.hasIssue === true;
            const prevMessage = String(this._sheetsHealthLogState?.lastIssueMessage || '');
            if (!prevHasIssue || prevMessage !== errMessage) {
                Logger.error(`❌ 필수 시트 준비 이슈: ${errMessage}`);
            }
            this._sheetsHealthLogState = {
                hasIssue: true,
                lastIssueMessage: errMessage,
                updatedAt: new Date().toISOString()
            };
            if (suppressError) {
                return { success: false, spreadsheetId: String(spreadsheetId || '').trim(), message: errMessage };
            }
            throw e;
        }
    },

    createSpreadsheetWithDefaultSheets: async function (options = {}) {
        const title = String(options.title || '').trim() || `BlogGenius ${new Date().toISOString().slice(0, 10)}`;
        const shareEmail = String(options.shareEmail || '').trim();
        const sheetsToken = await this.getGoogleAccessToken(['https://www.googleapis.com/auth/drive.file']);
        let createRes;
        try {
            createRes = await this.callWithRetry(() => axios.post(
                'https://sheets.googleapis.com/v4/spreadsheets',
                {
                    properties: { title }
                },
                {
                    headers: { 'Authorization': `Bearer ${sheetsToken}`, 'Content-Type': 'application/json' }
                }
            ));
        } catch (e) {
            throw new Error(`시트 생성 실패: ${this.formatAxiosError(e)}`);
        }

        const spreadsheetId = String(createRes?.data?.spreadsheetId || '').trim();
        const spreadsheetUrl = String(createRes?.data?.spreadsheetUrl || '').trim();
        if (!spreadsheetId) throw new Error('스프레드시트 생성에 실패했습니다. spreadsheetId를 받지 못했습니다.');

        try {
            await this.ensureAllSheetsExistStrict(spreadsheetId);
        } catch (e) {
            throw new Error(`기본 시트 초기화 실패: ${this.formatAxiosError(e)}`);
        }

        const shareResult = { attempted: false, success: false, message: '' };
        if (shareEmail) {
            shareResult.attempted = true;
            try {
                const driveToken = await this.getGoogleAccessToken(['https://www.googleapis.com/auth/drive.file']);
                await this.callWithRetry(() => axios.post(
                    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(spreadsheetId)}/permissions`,
                    {
                        role: 'writer',
                        type: 'user',
                        emailAddress: shareEmail
                    },
                    {
                        params: { sendNotificationEmail: true },
                        headers: { 'Authorization': `Bearer ${driveToken}`, 'Content-Type': 'application/json' }
                    }
                ));
                shareResult.success = true;
                shareResult.message = '공유 완료';
            } catch (e) {
                shareResult.success = false;
                shareResult.message = e?.response?.data?.error?.message || e.message || '공유 실패';
            }
        }

        return {
            spreadsheetId,
            spreadsheetUrl,
            title,
            share: shareResult
        };
    },

    ensureTopicsSheetImageModeValidation: async function (accessToken, spreadsheetId, sheetId, sheetName) {
        try {
            const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:1`;
            const headerRes = await this.callWithRetry(() => axios.get(readUrl, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            }));
            const headers = Array.isArray(headerRes?.data?.values?.[0]) ? headerRes.data.values[0] : [];
            const imageModeColIndex = headers.findIndex((header) => {
                const clean = String(header || '').toLowerCase().replace(/[\s\/_]/g, '');
                return ['이미지처리', '이미지생성', 'imagemode', 'imagegen', 'imggen'].includes(clean);
            });
            if (imageModeColIndex < 0) return;

            if (String(headers[imageModeColIndex] || '').trim() !== '이미지 처리') {
                const toA1 = (colIdx) => {
                    let letter = '';
                    let num = colIdx;
                    while (num >= 0) {
                        letter = String.fromCharCode((num % 26) + 65) + letter;
                        num = Math.floor(num / 26) - 1;
                    }
                    return letter;
                };
                const headerUpdateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!${toA1(imageModeColIndex)}1?valueInputOption=USER_ENTERED`;
                await this.callWithRetry(() => axios.put(headerUpdateUrl, {
                    range: `${sheetName}!${toA1(imageModeColIndex)}1`,
                    majorDimension: 'ROWS',
                    values: [['이미지 처리']]
                }, {
                    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
                }));
            }

            const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
            await this.callWithRetry(() => axios.post(updateUrl, {
                requests: [{
                    setDataValidation: {
                        range: { sheetId, startRowIndex: 1, startColumnIndex: imageModeColIndex, endColumnIndex: imageModeColIndex + 1 },
                        rule: {
                            condition: {
                                type: 'ONE_OF_LIST',
                                values: [
                                    { userEnteredValue: '이미지 생성' },
                                    { userEnteredValue: '프롬프트 포함' },
                                    { userEnteredValue: '미포함' }
                                ]
                            },
                            showCustomUi: true,
                            strict: true
                        }
                    }
                }]
            }, {
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
            }));
        } catch (error) {
            Logger.warn(`⚠️ topics 이미지 처리 검증 규칙 업데이트 실패: ${error.message}`);
        }
    },

    ensureShoppingSheetValidation: async function (accessToken, spreadsheetId, sheetId, sheetName) {
        try {
            let wpStatusColIndex = -1;
            let generalStatusColIndex = -1;
            try {
                const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:1`;
                const headerRes = await this.callWithRetry(() => axios.get(readUrl, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                }));
                const headers = (headerRes.data.values && headerRes.data.values[0]) ? headerRes.data.values[0] : [];
                const cleanHeaders = headers.map(h => String(h || '').toLowerCase().replace(/[\s\/_]/g, ''));

                // 1. post_status (WP) 컬럼 찾기
                wpStatusColIndex = cleanHeaders.findIndex(h => h === 'poststatus' || h === '발행상태');

                // 2. 일반 상태 컬럼 찾기 (post_status 제외)
                generalStatusColIndex = cleanHeaders.findIndex((h, i) => i !== wpStatusColIndex && (h === '상태' || h === 'status'));

                // fallback for legacy
                if (generalStatusColIndex === -1 && wpStatusColIndex === -1) {
                    generalStatusColIndex = cleanHeaders.findIndex(h => h.includes('상태') || h.includes('status'));
                }
            } catch (e) {
                // 헤더 조회 실패 시 중단
                return;
            }

            const validationRequests = [];

            // WP 상태 드롭다운 (publish, draft, schedule)
            if (wpStatusColIndex >= 0) {
                validationRequests.push({
                    setDataValidation: {
                        range: { sheetId, startRowIndex: 1, startColumnIndex: wpStatusColIndex, endColumnIndex: wpStatusColIndex + 1 },
                        rule: {
                            condition: {
                                type: 'ONE_OF_LIST',
                                values: [{ userEnteredValue: 'publish' }, { userEnteredValue: 'draft' }, { userEnteredValue: 'schedule' }]
                            },
                            showCustomUi: true, strict: true
                        }
                    }
                });
            }

            // 일반 상태 드롭다운 (준비, 발행 중, ...)
            if (generalStatusColIndex >= 0) {
                validationRequests.push({
                    setDataValidation: {
                        range: { sheetId, startRowIndex: 1, startColumnIndex: generalStatusColIndex, endColumnIndex: generalStatusColIndex + 1 },
                        rule: {
                            condition: {
                                type: 'ONE_OF_LIST',
                                values: [
                                    { userEnteredValue: '준비' },
                                    { userEnteredValue: '발행 중' },
                                    { userEnteredValue: '발행 준비 완료' },
                                    { userEnteredValue: '발행 완료' },
                                    { userEnteredValue: '임시 저장 완료' },
                                    { userEnteredValue: '예약 포스팅 등록 완료' },
                                    { userEnteredValue: '실패' }
                                ]
                            },
                            showCustomUi: true, strict: true
                        }
                    }
                });
            }

            if (validationRequests.length > 0) {
                const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
                await this.callWithRetry(() => axios.post(updateUrl, { requests: validationRequests }, {
                    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
                }));
            }
        } catch (e) {
            Logger.warn(`⚠️ shopping 시트 검증 규칙 업데이트 실패: ${e.message}`);
        }
    },

    _ensureSnsSheetReady: async function (accessToken, spreadsheetId, options = {}) {
        const suppressError = options.suppressError !== false;
        try {
            const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
            let metaRes = await this.callWithRetry(() => axios.get(metaUrl, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            }));
            let snsSheet = (metaRes.data.sheets || []).find(
                (sheet) => sheet.properties?.title === SNS_SHEET_NAME
            );

            if (!snsSheet) {
                Logger.info(`✨ '${SNS_SHEET_NAME}' 시트가 없어서 생성을 시작합니다...`);
                await this.createSheetIfMissing(accessToken, spreadsheetId, SNS_SHEET_NAME, 'sns');
                metaRes = await this.callWithRetry(() => axios.get(metaUrl, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                }));
                snsSheet = (metaRes.data.sheets || []).find(
                    (sheet) => sheet.properties?.title === SNS_SHEET_NAME
                );
            }

            if (snsSheet?.properties?.sheetId === undefined) {
                throw new Error(`'${SNS_SHEET_NAME}' 시트의 sheetId를 확인하지 못했습니다.`);
            }

            await this.ensureSnsSheetValidation(
                accessToken,
                spreadsheetId,
                snsSheet.properties.sheetId,
                SNS_SHEET_NAME,
                { suppressError: false }
            );

            return { success: true, sheetName: SNS_SHEET_NAME };
        } catch (e) {
            const message = String(e?.message || e || 'unknown');
            Logger.warn(`⚠️ '${SNS_SHEET_NAME}' 시트 준비 실패: ${message}`);
            if (!suppressError) throw e;
            return { success: false, sheetName: SNS_SHEET_NAME, message };
        }
    },

    _ensureCardNewsSheetReady: async function (accessToken, spreadsheetId, options = {}) {
        const suppressError = options.suppressError !== false;
        try {
            const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
            let metaRes = await this.callWithRetry(() => axios.get(metaUrl, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            }));
            let cardNewsSheet = (metaRes.data.sheets || []).find(
                (sheet) => sheet.properties?.title === CARD_NEWS_SHEET_NAME
            );

            if (!cardNewsSheet) {
                Logger.info(`✨ '${CARD_NEWS_SHEET_NAME}' 시트가 없어서 생성을 시작합니다...`);
                await this.createSheetIfMissing(accessToken, spreadsheetId, CARD_NEWS_SHEET_NAME, 'cardnews');
                metaRes = await this.callWithRetry(() => axios.get(metaUrl, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                }));
                cardNewsSheet = (metaRes.data.sheets || []).find(
                    (sheet) => sheet.properties?.title === CARD_NEWS_SHEET_NAME
                );
            }

            if (cardNewsSheet?.properties?.sheetId === undefined) {
                throw new Error(`'${CARD_NEWS_SHEET_NAME}' 시트의 sheetId를 확인하지 못했습니다.`);
            }

            await this._syncSheetHeadersIfMissing(
                accessToken,
                spreadsheetId,
                CARD_NEWS_SHEET_NAME,
                'cardnews',
                { suppressError: false }
            );
            await this.ensureCardNewsSheetValidation(
                accessToken,
                spreadsheetId,
                cardNewsSheet.properties.sheetId,
                CARD_NEWS_SHEET_NAME,
                { suppressError: false }
            );
            return { success: true, sheetName: CARD_NEWS_SHEET_NAME };
        } catch (e) {
            const message = String(e?.message || e || 'unknown');
            Logger.warn(`⚠️ '${CARD_NEWS_SHEET_NAME}' 시트 준비 실패: ${message}`);
            if (!suppressError) throw e;
            return { success: false, sheetName: CARD_NEWS_SHEET_NAME, message };
        }
    },

    ensureCardNewsSheetValidation: async function (accessToken, spreadsheetId, sheetId, sheetName, options = {}) {
        const suppressError = options.suppressError !== false;
        try {
            const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:1`;
            const headerRes = await this.callWithRetry(() => axios.get(readUrl, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            }));
            const normalizedHeaders = new Set((headerRes?.data?.values?.[0] || []).map(
                (header) => String(header || '').toLowerCase().replace(/[\s/_]/g, '').trim()
            ));
            const missingHeaders = CARD_NEWS_SHEET_HEADERS.filter((header) => !normalizedHeaders.has(
                String(header || '').toLowerCase().replace(/[\s/_]/g, '').trim()
            ));
            if (missingHeaders.length > 0) {
                throw new Error(`'${sheetName}' 시트 필수 헤더가 없습니다: ${missingHeaders.join(', ')}`);
            }

            const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
            await this.callWithRetry(() => axios.post(updateUrl, {
                requests: buildCardNewsStatusValidationRequests(sheetId)
            }, {
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
            }));
        } catch (e) {
            if (!suppressError) throw e;
            Logger.warn(`⚠️ '${CARD_NEWS_SHEET_NAME}' 시트 검증 규칙 업데이트 실패: ${e.message}`);
        }
    },

    ensureSnsSheetValidation: async function (accessToken, spreadsheetId, sheetId, sheetName, options = {}) {
        const suppressError = options.suppressError !== false;
        try {
            const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:1`;
            const headerRes = await this.callWithRetry(() => axios.get(readUrl, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            }));
            const headers = Array.isArray(headerRes?.data?.values?.[0])
                ? headerRes.data.values[0]
                : [];
            const normalizedHeaders = new Set(
                headers.map((header) => String(header || '').toLowerCase().replace(/[\s/_]/g, '').trim())
            );
            const missingHeaders = SNS_SHEET_HEADERS.filter(
                (header) => !normalizedHeaders.has(
                    String(header || '').toLowerCase().replace(/[\s/_]/g, '').trim()
                )
            );
            if (missingHeaders.length > 0) {
                throw new Error(`'${sheetName}' 시트 필수 헤더가 없습니다: ${missingHeaders.join(', ')}`);
            }
            const statusColumnIndex = headers.findIndex(
                (header) => String(header || '').toLowerCase().replace(/[\s\/_]/g, '').trim() === '상태'
            );
            if (statusColumnIndex < 0) {
                throw new Error(`'${sheetName}' 시트에서 상태 컬럼을 찾지 못했습니다.`);
            }

            const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
            await this.callWithRetry(() => axios.post(
                updateUrl,
                { requests: [buildSnsStatusValidationRequest(sheetId, statusColumnIndex)] },
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            ));
        } catch (e) {
            if (!suppressError) throw e;
            Logger.warn(`⚠️ SNS 시트 검증 규칙 업데이트 실패: ${e.message}`);
        }
    },

    /**
     * 0-2. 기존 시트에 필수 헤더가 빠져있으면 추가 (Sync)
     */
    _syncSheetHeadersIfMissing: async function (accessToken, spreadsheetId, sheetName, type, options = {}) {
        const suppressError = options.suppressError !== false;
        try {
            const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:1`;
            const headerRes = await this.callWithRetry(() => axios.get(readUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } }));
            const currentHeaders = Array.isArray(headerRes?.data?.values?.[0]) ? headerRes.data.values[0] : [];
            const currentHeadersClean = currentHeaders.map(h => String(h || '').toLowerCase().replace(/[\s\/_]/g, '').trim());

            let requiredHeaders = [];
            if (type === 'topics') {
                requiredHeaders = [
                    'category', 'post_status', 'schedule_date', 'subject', 'keywords',
                    '참고/지시 사항', '상태', '이미지 처리', '외부 참고 여부', '참고 URL',
                    'options', '발행 시간', '로그', '추가일시', '소스', '트렌드일자'
                ];
            } else if (type === 'shopping') {
                requiredHeaders = [
                    'category', 'post_status', 'schedule_date', 'URL', '상품', '참고/지시 사항', '상태', '발행 시간', '로그', 'options'
                ];
            } else if (type === 'cardnews') {
                requiredHeaders = [...CARD_NEWS_SHEET_HEADERS];
            }

            const missingHeaders = requiredHeaders.filter(h => {
                const cleanH = h.toLowerCase().replace(/[\s\/_]/g, '').trim();
                if (cleanH === '이미지처리' && currentHeadersClean.some((value) => ['이미지처리', '이미지생성', 'imagegen', 'imggen', 'imagemode'].includes(value))) {
                    return false;
                }
                return !currentHeadersClean.includes(cleanH);
            });

            if (missingHeaders.length > 0) {
                Logger.info(`   🔍 '${sheetName}' 시트에 누락된 헤더 발견: ${missingHeaders.join(', ')}. 추가를 시작합니다...`);
                const newHeaders = [...currentHeaders, ...missingHeaders];
                const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:1?valueInputOption=USER_ENTERED`;
                await this.callWithRetry(() => axios.put(updateUrl, {
                    range: `${sheetName}!1:1`,
                    majorDimension: 'ROWS',
                    values: [newHeaders]
                }, {
                    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
                }));
                Logger.info(`   ✅ '${sheetName}' 시트 헤더 동기화 완료`);
            }
        } catch (e) {
            if (!suppressError) throw e;
            Logger.warn(`⚠️ '${sheetName}' 헤더 동기화 중 오류 (무시 가능): ${e.message}`);
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
                // 헤더: category, post_status, schedule_date, subject, keywords, 참고/지시 사항, 상태, 이미지 처리, 외부 참고 여부, 참고 URL, 발행 시간, 로그, 추가일시, 소스, 트렌드일자
                headerRow = [[
                    'category',
                    'post_status',
                    'schedule_date',
                    'subject',
                    'keywords',
                    '참고/지시 사항',
                    '상태',
                    '이미지 처리',
                    '외부 참고 여부',
                    '참고 URL',
                    'options', // [Added] JSON 확장 옵션 컬럼
                    '발행 시간',
                    '로그',
                    '추가일시',
                    '소스',
                    '트렌드일자'
                ]];

                // Dropdown: B열 (Index 1) -> publish, draft, schedule (발행 옵션)
                validationRequests.push({
                    setDataValidation: {
                        range: { sheetId: newSheetId, startRowIndex: 1, startColumnIndex: 1, endColumnIndex: 2 },
                        rule: {
                            condition: {
                                type: 'ONE_OF_LIST',
                                values: [
                                    { userEnteredValue: 'publish' },
                                    { userEnteredValue: 'draft' },
                                    { userEnteredValue: 'schedule' }
                                ]
                            },
                            showCustomUi: true, strict: true
                        }
                    }
                });

                // Dropdown: G열 (Index 6) -> 대기, 발행 준비 완료, 발행 완료 (처리 상태)
                validationRequests.push({
                    setDataValidation: {
                        range: { sheetId: newSheetId, startRowIndex: 1, startColumnIndex: 6, endColumnIndex: 7 },
                        rule: {
                            condition: {
                                type: 'ONE_OF_LIST',
                                values: [
                                    { userEnteredValue: '대기' },
                                    { userEnteredValue: '발행 준비 완료' },
                                    { userEnteredValue: '발행 완료' },
                                    { userEnteredValue: '임시 저장 완료' },
                                    { userEnteredValue: '예약 포스팅 등록 완료' }
                                ]
                            },
                            showCustomUi: true, strict: true
                        }
                    }
                });

                // Dropdown: H열 (Index 7) -> 이미지 처리 방식
                validationRequests.push({
                    setDataValidation: {
                        range: { sheetId: newSheetId, startRowIndex: 1, startColumnIndex: 7, endColumnIndex: 8 },
                        rule: {
                            condition: {
                                type: 'ONE_OF_LIST',
                                values: [
                                    { userEnteredValue: '이미지 생성' },
                                    { userEnteredValue: '프롬프트 포함' },
                                    { userEnteredValue: '미포함' }
                                ]
                            },
                            showCustomUi: true, strict: true
                        }
                    }
                });

                // Dropdown: I열 (Index 8) -> Yes, No (외부 참고 여부)
                validationRequests.push({
                    setDataValidation: {
                        range: { sheetId: newSheetId, startRowIndex: 1, startColumnIndex: 8, endColumnIndex: 9 },
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
            } else if (type === 'shopping') {
                // 헤더: category, post_status, schedule_date, URL, 상품, 참고/지시 사항, 상태, 발행 시간, 로그, options
                headerRow = [['category', 'post_status', 'schedule_date', 'URL', '상품', '참고/지시 사항', '상태', '발행 시간', '로그', 'options']];

                // Dropdown: B열 (Index 1) -> publish, draft, schedule (발행 옵션)
                validationRequests.push({
                    setDataValidation: {
                        range: { sheetId: newSheetId, startRowIndex: 1, startColumnIndex: 1, endColumnIndex: 2 },
                        rule: {
                            condition: {
                                type: 'ONE_OF_LIST',
                                values: [
                                    { userEnteredValue: 'publish' },
                                    { userEnteredValue: 'draft' },
                                    { userEnteredValue: 'schedule' }
                                ]
                            },
                            showCustomUi: true, strict: true
                        }
                    }
                });

                // Dropdown: F열 (Index 5) -> 준비, 발행 중, 발행 준비 완료, 발행 완료, 실패 (상태)
                validationRequests.push({
                    setDataValidation: {
                        range: { sheetId: newSheetId, startRowIndex: 1, startColumnIndex: 5, endColumnIndex: 6 },
                        rule: {
                            condition: {
                                type: 'ONE_OF_LIST',
                                values: [
                                    { userEnteredValue: '준비' },
                                    { userEnteredValue: '발행 중' },
                                    { userEnteredValue: '발행 준비 완료' },
                                    { userEnteredValue: '발행 완료' },
                                    { userEnteredValue: '임시 저장 완료' },
                                    { userEnteredValue: '예약 포스팅 등록 완료' },
                                    { userEnteredValue: '실패' }
                                ]
                            },
                            showCustomUi: true, strict: true
                        }
                    }
                });
            } else if (type === 'sns') {
                headerRow = [[...SNS_SHEET_HEADERS]];
                validationRequests.push(buildSnsStatusValidationRequest(newSheetId));
            } else if (type === 'cardnews') {
                headerRow = [[...CARD_NEWS_SHEET_HEADERS]];
                validationRequests.push(...buildCardNewsStatusValidationRequests(newSheetId));
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
};
