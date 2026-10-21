'use strict';

const {
    fs, axios, CONFIG, Logger, GoogleOAuth, formatSheetImageModeValue,
    mergeShoppingSheetOptions, mergeTopicSheetOptions, parseSheetImageModeValue,
    resolveShoppingSheetState, resolveTopicSheetState, stringifySheetOptionsValue,
    SNS_SHEET_NAME, SNS_SHEET_HEADERS, buildSnsStatusValidationRequest,
    CARD_NEWS_SHEET_NAME, CARD_NEWS_SHEET_HEADERS, buildCardNewsStatusValidationRequests,
    buildTopicRowMoveRequest, getAgentEventStore
} = require('./dependencies');
const { sleep } = require('../../../utilities/async/sleep');

module.exports = {
    appendGoogleSheetTopics: async function (topics, options = {}) {
        if (!Array.isArray(topics) || topics.length === 0) {
            return { success: true, addedCount: 0, rowNumbers: [], rowIndices: [] };
        }

        Logger.info(`📝 [GoogleSheets] topic append started count=${topics.length}`);
        try {
        const accessToken = await this.getGoogleAccessToken();
        const sheetName = CONFIG.GOOGLE_TOPICS_SHEET || 'topics';
        const spreadsheetId = CONFIG.GOOGLE_SHEET_ID;
        const headersUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:1`;
        const headerResponse = await this.callWithRetry(() => axios.get(headersUrl, {
            headers: { Authorization: `Bearer ${accessToken}` }
        }));
        const headers = Array.isArray(headerResponse?.data?.values?.[0])
            ? headerResponse.data.values[0]
            : [];
        if (headers.length === 0) {
            throw Object.assign(new Error(`'${sheetName}' 시트의 헤더를 읽지 못했습니다.`), { code: 'TOPIC_SHEET_HEADERS_UNAVAILABLE' });
        }

        const normalizeHeader = value => String(value || '').toLowerCase().replace(/[\s/_]/g, '').trim();
        const columns = {};
        headers.forEach((header, index) => {
            const name = normalizeHeader(header);
            if (name.includes('category') || name.includes('카테고리')) columns.category = index;
            else if (name.includes('poststatus') || name.includes('발행옵션')) columns.postStatus = index;
            else if (name.includes('scheduledate') || name.includes('예약일시')) columns.scheduleDate = index;
            else if (name.includes('주제') || name.includes('subject') || name.includes('제목')) columns.subject = index;
            else if (name.includes('키워드') || name.includes('keyword')) columns.keywords = index;
            else if (name.includes('참고지시사항') || name.includes('instruction') || name.includes('지시사항')) columns.instruction = index;
            else if (name.includes('외부참고') || name.includes('extref') || name.includes('external')) columns.externalReference = index;
            else if (name.includes('참고url') || name.includes('referenceurl') || name === 'url') columns.referenceUrls = index;
            else if (name.includes('상태') || name.includes('status')) columns.status = index;
            else if (name.includes('이미지개수') || name.includes('imagecount')) columns.imageCount = index;
            else if (name.includes('이미지처리') || name.includes('imagemode') || name.includes('이미지생성') || name.includes('imagegen') || name.includes('imggen')) columns.imageMode = index;
            else if (name.includes('추가일시') || name.includes('addedat') || name.includes('createdat')) columns.addedAt = index;
            else if (name === '소스' || name.includes('source')) columns.source = index;
            else if (name.includes('트렌드일자') || name.includes('trenddate')) columns.trendDate = index;
            else if (name === 'options' || name === '옵션' || name === 'extraoptions') columns.options = index;
        });
        if (columns.subject === undefined || columns.keywords === undefined) {
            throw Object.assign(new Error(`'${sheetName}' 시트에 주제와 키워드 헤더가 필요합니다.`), { code: 'TOPIC_REQUIRED_HEADERS_MISSING' });
        }

        const defaultStatus = String(options.defaultStatus || '대기').trim() || '대기';
        const rows = topics.map(topic => {
            const row = Array(headers.length).fill('');
            const keywords = Array.isArray(topic.keywords) ? topic.keywords.join(', ') : String(topic.keywords || '');
            const guide = topic.content_guide || {};
            const instruction = String(guide.additional_instructions || topic.instruction || topic.additional_instructions || '').trim();
            const references = Array.isArray(guide.reference_urls)
                ? guide.reference_urls.join(', ')
                : (Array.isArray(topic.reference_urls) ? topic.reference_urls.join(', ') : String(topic.reference_urls || topic.reference_url || ''));
            const imageMode = parseSheetImageModeValue(topic.image_options?.mode || topic.image_mode, {
                legacyGenerate: typeof topic.image_options?.generate === 'boolean' ? topic.image_options.generate : topic.image_generation
            });
            const externalReference = typeof topic.use_external_ref === 'boolean'
                ? topic.use_external_ref
                : (typeof topic.external_reference === 'boolean' ? topic.external_reference : topic.options?.external_reference !== false);
            const status = String(topic.status || defaultStatus).trim() || defaultStatus;
            const postStatus = String(topic.postStatus || topic.post_status || topic.options?.post_status || '').trim();
            const scheduleDate = String(topic.scheduleDate || topic.schedule_date || topic.options?.schedule_date || '').trim();
            const category = String(topic.category || topic.options?.category || '').trim();
            const platforms = topic.targets || topic.platforms || topic.options?.platforms;

            const put = (column, value) => {
                if (columns[column] !== undefined) row[columns[column]] = value;
            };
            put('subject', String(topic.subject || '').trim());
            put('keywords', keywords);
            put('instruction', instruction);
            put('referenceUrls', references);
            put('status', status);
            put('imageMode', formatSheetImageModeValue(imageMode));
            put('imageCount', topic.image_options?.count ?? topic.image_count ?? topic.options?.image_count ?? '');
            put('externalReference', externalReference ? 'Yes' : 'No');
            put('category', category);
            put('postStatus', postStatus);
            put('scheduleDate', scheduleDate);
            put('addedAt', String(topic.addedAt || options.addedAt || new Date().toISOString()));
            put('source', String(topic.source || options.source || 'manual'));
            put('trendDate', String(topic.trendDate || topic.trend_date || options.trendDate || ''));

            if (columns.options !== undefined) {
                const syncedOptions = mergeTopicSheetOptions(topic.options, {
                    title: topic.title,
                    subject: topic.subject,
                    keywords: topic.keywords,
                    instruction,
                    referenceUrls: guide.reference_urls || topic.reference_urls,
                    category,
                    postStatus,
                    scheduleDate,
                    imageMode,
                    imageCount: topic.image_options?.count ?? topic.image_count ?? topic.options?.image_count,
                    externalReference,
                    writingStrategy: topic.writing_strategy || topic.writingStrategy || topic.options?.writing_strategy,
                    writingOverrides: guide.writing_overrides || topic.writing_overrides || topic.options?.writing_overrides,
                    platforms
                });
                row[columns.options] = stringifySheetOptionsValue(syncedOptions);
            }
            return row;
        });

        const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}:append?valueInputOption=USER_ENTERED`;
        const response = await this.callWithRetry(() => axios.post(appendUrl, {
            range: sheetName,
            majorDimension: 'ROWS',
            values: rows
        }, {
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
        }));

        const updates = response?.data?.updates || {};
        const updatedRange = String(updates.updatedRange || '');
        const rangeMatch = updatedRange.match(/![A-Z]+(\d+):[A-Z]+(\d+)$/i)
            || updatedRange.match(/![A-Z]+(\d+)$/i);
        const startRow = rangeMatch ? Number(rangeMatch[1]) : null;
        const endRow = rangeMatch?.[2] ? Number(rangeMatch[2]) : startRow;
        const rowNumbers = Number.isInteger(startRow) && Number.isInteger(endRow)
            ? Array.from({ length: endRow - startRow + 1 }, (_, index) => startRow + index)
            : [];
        const updatedRows = Number(updates.updatedRows);
        if ((Number.isFinite(updatedRows) && updatedRows !== rows.length) || (!Number.isFinite(updatedRows) && rowNumbers.length !== rows.length)) {
            throw Object.assign(new Error(`Google Sheets가 글감 ${rows.length}건 저장을 확인하지 않았습니다.`), { code: 'TOPIC_APPEND_UNCONFIRMED' });
        }

        this.clearSheetCache('topics');
        for (const topic of topics) {
            try {
                const guide = topic.content_guide || {};
                await getAgentEventStore().recordTopic(
                    topic.chatId || options.chatId || null,
                    {
                        subject: topic.subject || '',
                        platform: Array.isArray(topic.targets || topic.platforms)
                            ? (topic.targets || topic.platforms).join(', ')
                            : 'naver',
                        category: topic.category || topic.options?.category || '',
                        keywords: Array.isArray(topic.keywords) ? topic.keywords.join(', ') : String(topic.keywords || ''),
                        instruction: guide.additional_instructions || topic.instruction || '',
                        source: topic.source || options.source || 'manual'
                    },
                    topic.memory_provenance || options.memoryProvenance || {}
                );
            } catch (memoryError) {
                Logger.error(`⚠️ 토픽 메모리 기록 실패: ${memoryError.message}`);
            }
        }
        const appendResult = {
            success: true,
            addedCount: rows.length,
            rowNumbers,
            rowIndices: rowNumbers.map(rowNumber => rowNumber - 2).filter(index => index >= 0)
        };
        Logger.info(`✅ [GoogleSheets] topic append completed count=${appendResult.addedCount} rows=${appendResult.rowNumbers.join(',') || 'unavailable'}`);
        return appendResult;
        } catch (error) {
            const code = String(error?.code || error?.name || 'UNKNOWN').replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 80) || 'UNKNOWN';
            const status = Number(error?.response?.status);
            Logger.error(`❌ [GoogleSheets] topic append failed code=${code}${Number.isFinite(status) && status > 0 ? ` http_status=${status}` : ''}`);
            throw error;
        }
    },

    readGoogleSheetTopics: async function (options = {}) {
        try {
            if (!options.silent) Logger.info("🌐 구글 스프레드시트 읽기 (Native Auth Mode)");
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
                const ctgRaw = getVal(['category', '카테고리']);
                const status = getVal(['상태', 'status']);
                const imageModeStr = getVal(['이미지처리', 'image_mode', 'imagemode', '이미지생성', 'image_gen', 'img_gen']);
                const imgCountStr = getVal(['이미지개수', 'image_count', 'count']);
                const extRefStr = getVal(['외부참고여부', 'external_ref', 'ext_ref']);

                return {
                    rowIndex: index,
                    category: ctgRaw || '',
                    subject: subject || undefined,
                    keywords: kwStr ? kwStr.split(',').map(k => k.trim()).filter(k => k) : [],
                    content_guide: {
                        additional_instructions: instruction,
                        reference_urls: urlStr ? urlStr.split(',').map(u => u.trim()).filter(u => u) : []
                    },
                    status: status ? status.trim() : "",
                    use_external_ref: ['y', 'yes', 'true', 't', '예', '참', 'o'].includes(extRefStr.toLowerCase()),
                    image_options: {
                        mode: parseSheetImageModeValue(imageModeStr),
                        generate: parseSheetImageModeValue(imageModeStr) === 'generate',
                        count: imgCountStr ? Number(imgCountStr) : undefined
                    }
                };
            });

            // 🔥 [수정됨] 주제, 키워드, URL 중 하나라도 있으면 OK
            return results.filter(item => {
                const hasData = item.subject ||
                    item.keywords.length > 0 ||
                    item.content_guide.reference_urls.length > 0; // 👈 여기 추가됨
                return hasData && (item.status === '발행 준비 완료');
            });

        } catch (e) {
            if (CONFIG.CONFIG_IS_ESSENTIAL_SET) {
                Logger.info(`구글 시트 읽기 실패: ${e.message}`);
            }
            return [];
        }
    },

    /**
     * UI/운영용: topics 시트 전체 조회 (상태/검색/페이징 지원)
     */
    readGoogleSheetTopicsAll: async function (options = {}) {
        const cacheKey = `topics_${options.status || 'all'}_${options.q || ''}_${options.limit || 'max'}_${options.offset || 0}_${options.sortBy || 'none'}_${options.sortDir || 'none'}_${options.throwOnError === true ? 'strict' : 'safe'}`;
        return this.withSimpleCache(cacheKey, async () => {
            try {
                const accessToken = await this.getGoogleAccessToken();
                const sheetName = CONFIG.GOOGLE_TOPICS_SHEET || 'topics';
                const spreadsheetId = CONFIG.GOOGLE_SHEET_ID;
                const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}`;

                const res = await this.callWithRetry(() => axios.get(url, {
                    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
                }));

                const rows = res.data.values;
                if (!rows || rows.length === 0) {
                    return { items: [], total: 0, limit: 0, offset: 0 };
                }

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

                    const subject = getVal(['subject', '주제', '제목']);
                    const kwStr = getVal(['keywords', '키워드']);
                    const instruction = getVal(['참고지시사항', '참고/지시사항', 'instruction', '지시사항', '내용']);
                    const urlStr = getVal(['참고url', '참고/url', 'references', 'url']);
                    const ctgRaw = getVal(['category', '카테고리']);
                    const postStatus = getVal(['poststatus', 'post_status', '발행옵션', '발행_옵션']);
                    const scheduleDate = getVal(['scheduledate', 'schedule_date', '예약일시', '예약_일시']);
                    const status = getVal(['상태', 'status']);
                    const imageModeStr = getVal(['이미지처리', 'image_mode', 'imagemode', '이미지생성', 'image_gen', 'img_gen']);
                    const imgCountStr = getVal(['이미지개수', 'image_count', 'count']);
                    const extRefStr = getVal(['외부참고여부', 'external_ref', 'ext_ref']);
                    const optionsStr = getVal(['options', '옵션', 'extra_options']);
                    const logStr = getVal(['로그', 'log']);
                    const publishedAt = getVal(['발행시간', '발행 시간', 'publish_time', 'time']);
                    const addedAt = getVal(['추가일시', '추가 일시', 'addedat', 'createdat']);
                    const source = getVal(['소스', 'source']);
                    const trendDate = getVal(['트렌드일자', '트렌드 일자', 'trenddate']);

                    const explicitImageMode = imageModeStr ? parseSheetImageModeValue(imageModeStr) : undefined;
                    const explicitExtRef = extRefStr ? ['y', 'yes', 'true', 't', '예', '참', 'o'].includes(String(extRefStr).toLowerCase()) : undefined;
                    const resolvedState = resolveTopicSheetState({
                        subject,
                        keywords: kwStr ? kwStr.split(',').map(k => k.trim()).filter(k => k) : [],
                        instruction,
                        referenceUrls: urlStr ? urlStr.split(',').map(u => u.trim()).filter(u => u) : [],
                        category: ctgRaw || '',
                        postStatus: postStatus || 'publish',
                        scheduleDate: scheduleDate || '',
                        imageMode: explicitImageMode,
                        imageGeneration: explicitImageMode !== undefined ? explicitImageMode === 'generate' : false,
                        externalReference: explicitExtRef !== undefined ? explicitExtRef : true,
                        options: optionsStr
                    });

                    return {
                        rowIndex: index,
                        rowNumber: index + 2,
                        category: resolvedState.category || '',
                        postStatus: resolvedState.postStatus || 'publish',
                        post_status_explicit: Boolean(postStatus || Object.prototype.hasOwnProperty.call(resolvedState.options || {}, 'post_status')),
                        scheduleDate: resolvedState.scheduleDate || '',
                        title: resolvedState.title || '',
                        subject: resolvedState.subject || '',
                        keywords: resolvedState.keywords,
                        keywordsRaw: resolvedState.keywords.join(', ') || kwStr || '',
                        content_guide: {
                            additional_instructions: resolvedState.instruction || '',
                            reference_urls: resolvedState.referenceUrls,
                            writing_overrides: resolvedState.writingOverrides
                        },
                        status: status || '',
                        image_mode: resolvedState.imageMode,
                        image_gen: resolvedState.imageGeneration,
                        image_options: {
                            mode: resolvedState.imageMode,
                            generate: resolvedState.imageGeneration,
                            count: imgCountStr ? Number(imgCountStr) : resolvedState.imageCount
                        },
                        image_count: imgCountStr ? Number(imgCountStr) : resolvedState.imageCount,
                        external_reference: resolvedState.externalReference,
                        writing_strategy: resolvedState.writingStrategy,
                        writing_overrides: resolvedState.writingOverrides,
                        options: resolvedState.options,
                        log: logStr || '',
                        published_at: publishedAt || '',
                        created_at: addedAt || '',
                        source: source || '',
                        trend_date: trendDate || ''
                    };
                });

                const statusFilter = String(options.status || '').trim();
                const q = String(options.q || '').trim().toLowerCase();
                let filtered = parsed;

                if (statusFilter) {
                    filtered = filtered.filter(item => String(item.status || '').trim() === statusFilter);
                }
                if (q) {
                    filtered = filtered.filter((item) => {
                        const haystack = [
                            item.subject,
                            item.keywordsRaw,
                            item.content_guide?.additional_instructions || '',
                            (item.content_guide?.reference_urls || []).join(' '),
                            item.status,
                            item.log,
                            item.addedAt,
                            item.source,
                            item.trendDate
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
                const getSortValue = (item) => {
                    if (sortBy === 'rowNumber') return Number(item.rowNumber || 0);
                    if (sortBy === 'subject') return String(item.subject || '');
                    if (sortBy === 'keywords') return Array.isArray(item.keywords) ? item.keywords.join(', ') : '';
                    if (sortBy === 'instruction') return String(item.content_guide?.additional_instructions || '');
                    if (sortBy === 'referenceUrl') return Array.isArray(item.content_guide?.reference_urls) ? item.content_guide.reference_urls.join(', ') : '';
                    if (sortBy === 'imageMode' || sortBy === 'imageGeneration') return String(item.image_mode || 'prompt_only');
                    if (sortBy === 'externalReference') return item.use_external_ref === true ? 1 : 0;
                    if (sortBy === 'runtimeLog') return String(item.log || '');
                    if (sortBy === 'status') return String(item.status || '');
                    if (sortBy === 'addedAt') return String(item.addedAt || '');
                    if (sortBy === 'source') return String(item.source || '');
                    if (sortBy === 'trendDate') return String(item.trendDate || '');
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
                const limit = Number.isFinite(Number(options.limit)) ? Math.max(1, parseInt(options.limit, 10)) : 50;
                const offset = Number.isFinite(Number(options.offset)) ? Math.max(0, parseInt(options.offset, 10)) : 0;
                const items = filtered.slice(offset, offset + limit);

                return { items, total, limit, offset };
            } catch (e) {
                Logger.error(`❌ topics 전체 조회 실패: ${e.message}`);
                if (options.throwOnError === true) throw e;
                return { items: [], total: 0, limit: 0, offset: 0 };
            }
        });
    },

    /**
     * Topics Sheet의 행 전체를 다른 위치로 이동한다.
     * move index는 Google Sheets grid 기준(헤더 포함, 0-based)이다.
     */
    moveGoogleSheetTopicRow: async function (move = {}) {
        const sourceStartIndex = Number(move.sourceStartIndex);
        const sourceEndIndex = Number(move.sourceEndIndex);
        const destinationIndex = Number(move.destinationIndex);
        if (!Number.isInteger(sourceStartIndex) || sourceStartIndex < 1
            || !Number.isInteger(sourceEndIndex) || sourceEndIndex !== sourceStartIndex + 1
            || !Number.isInteger(destinationIndex) || destinationIndex < 1) {
            throw new Error('Topics Sheet 행 이동 범위를 확인해 주세요.');
        }

        const accessToken = await this.getGoogleAccessToken();
        const sheetName = CONFIG.GOOGLE_TOPICS_SHEET || 'topics';
        const spreadsheetId = CONFIG.GOOGLE_SHEET_ID;
        const sheetId = await this.getSheetIdByName(spreadsheetId, sheetName);
        if (!Number.isInteger(Number(sheetId))) {
            throw new Error(`'${sheetName}' 시트를 찾지 못했습니다.`);
        }

        const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
        const request = buildTopicRowMoveRequest(Number(sheetId), {
            sourceStartIndex,
            sourceEndIndex,
            destinationIndex
        });
        await this.callWithRetry(() => axios.post(updateUrl, { requests: [request] }, {
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
        }));
        this.clearSheetCache('topics');
        return { success: true, sourceStartIndex, sourceEndIndex, destinationIndex };
    },


    updateGoogleSheetStatus: async function (rowIndex, status, logMessage, options = {}) {
        const safeRowIndex = Number(rowIndex);
        try {
            if (!Number.isInteger(safeRowIndex) || safeRowIndex < 0) {
                throw new RangeError('글감 행 번호는 0 이상의 정수여야 합니다.');
            }

            const accessToken = await this.getGoogleAccessToken();
            const sheetName = CONFIG.GOOGLE_TOPICS_SHEET || 'topics';
            const spreadsheetId = CONFIG.GOOGLE_SHEET_ID;
            const cacheKey = `${spreadsheetId}_${sheetName}_headers`;
            const now = Date.now();

            let map = null;
            // 🔗 1분 이내 캐시된 헤더 매핑이 있으면 사용
            if (this._headerCache[cacheKey] && (now - this._headerCache[cacheKey].timestamp < 60000)) {
                map = this._headerCache[cacheKey].map;
            }

            if (!map) {
                // 헤더 읽기 (캐시 없거나 만료됨)
                const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:1`;
                const headerRes = await this.callWithRetry(() => axios.get(readUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } }));

                const headers = headerRes.data.values[0];
                map = { status: -1, log: -1, time: -1 };

                headers.forEach((h, i) => {
                    const clean = h.toLowerCase().replace(/[\s\/_]/g, '');
                    if (clean.includes('상태') || clean.includes('status')) map.status = i;
                    else if (clean.includes('로그') || clean.includes('log')) map.log = i;
                    else if (clean.includes('발행') || clean.includes('time')) map.time = i;
                });

                // 캐시 업데이트
                this._headerCache[cacheKey] = { map, timestamp: now };
            }

            const targetRow = safeRowIndex + 2;
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
            if (map.status !== -1) dataToUpdate.push({ range: `${sheetName}!${toA1(map.status)}${targetRow}`, values: [[status]] });
            if (map.log !== -1) dataToUpdate.push({ range: `${sheetName}!${toA1(map.log)}${targetRow}`, values: [[logMessage]] });
            if (map.time !== -1) dataToUpdate.push({ range: `${sheetName}!${toA1(map.time)}${targetRow}`, values: [[new Date().toLocaleString()]] });

            if (options.throwOnError === true && map.status === -1) {
                throw new Error(`'${sheetName}' 시트에서 상태 컬럼을 찾지 못했습니다.`);
            }
            if (dataToUpdate.length === 0) {
                if (options.throwOnError === true) throw new Error('글감 상태를 업데이트할 수 있는 컬럼이 없습니다.');
                return;
            }

            const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;
            const updateResponse = await this.callWithRetry(() => axios.post(updateUrl, { valueInputOption: 'USER_ENTERED', data: dataToUpdate }, {
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
            }));
            if (options.throwOnError === true) {
                const updatedRows = Number(updateResponse?.data?.totalUpdatedRows);
                const updatedCells = Number(updateResponse?.data?.totalUpdatedCells);
                if (!((Number.isFinite(updatedRows) && updatedRows > 0) || (Number.isFinite(updatedCells) && updatedCells > 0))) {
                    throw new Error('Google Sheets가 글감 상태 변경을 확인하지 않았습니다.');
                }
            }

            // ⏳ API 호출 간 안전 대기 (헤더 읽기를 건너뛰므로 요청 간격이 좁아질 수 있음)
            await sleep(300);
            this.clearSheetCache('topics');
            return { success: true, rowIndex: safeRowIndex, status };

        } catch (e) {
            Logger.error(`❌ 구글 시트 업데이트 최종 실패 (Row ${safeRowIndex + 1}): ${e.message}`);
            if (options.throwOnError !== true) {
                const backupLog = `${new Date().toISOString()} | Row ${safeRowIndex + 1} | ${status} | ${logMessage}\n`;
                try {
                    fs.appendFileSync('failed_updates.log', backupLog);
                    Logger.warn(`   💾 백업 로그에 기록됨: failed_updates.log`);
                } catch (fileErr) {
                    Logger.error(`   ❌ 백업 로그 기록 실패: ${fileErr.message}`);
                }
            }
            if (options.throwOnError === true) throw e;
        }
    },

    /**
     * UI 편집용: topics 시트에서 수정 가능한 필드만 업데이트
     * - subject, keywords, 참고/지시사항, 참고 URL, 상태, 이미지 처리, 외부 참고 여부
     */
    updateGoogleSheetTopicEditableFields: async function (rowIndex, fields = {}) {
        const safeRowIndex = parseInt(rowIndex, 10);
        if (Number.isNaN(safeRowIndex) || safeRowIndex < 0) {
            throw new Error('rowIndex는 0 이상의 정수여야 합니다.');
        }

        const toYesNo = (value) => (value ? 'Yes' : 'No');
        const imageMode = parseSheetImageModeValue(fields.imageMode, {
            legacyGenerate: typeof fields.imageGeneration === 'boolean' ? fields.imageGeneration : undefined
        });
        const normalized = {
            title: String(fields.title || '').trim(),
            category: String(fields.category || '').trim(),
            postStatus: String(fields.postStatus || '').trim(),
            scheduleDate: String(fields.scheduleDate || '').trim(),
            subject: String(fields.subject || '').trim(),
            keywords: Array.isArray(fields.keywords)
                ? fields.keywords.map(v => String(v || '').trim()).filter(Boolean).join(', ')
                : String(fields.keywords || '').trim(),
            instruction: String(fields.instruction || '').trim(),
            referenceUrl: Array.isArray(fields.referenceUrl)
                ? fields.referenceUrl.map(v => String(v || '').trim()).filter(Boolean).join(', ')
                : String(fields.referenceUrl || '').trim(),
            status: String(fields.status || '').trim(),
            imageMode,
            imageGeneration: imageMode === 'generate',
            externalReference: toYesNo(Boolean(fields.externalReference)),
            writingStrategy: String(fields.writingStrategy || '').trim(),
            writingOverrides: fields.writingOverrides,
            platforms: Array.isArray(fields.platforms)
                ? fields.platforms.map(value => String(value || '').trim().toLowerCase()).filter(Boolean)
                : String(fields.platforms || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean)
        };

        if (!normalized.subject && !normalized.keywords && !normalized.instruction && !normalized.referenceUrl) {
            throw new Error('주제, 키워드, 지시사항 또는 참고 URL 중 하나가 필요합니다.');
        }

        const accessToken = await this.getGoogleAccessToken();
        const sheetName = CONFIG.GOOGLE_TOPICS_SHEET || 'topics';
        const spreadsheetId = CONFIG.GOOGLE_SHEET_ID;

        const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:1`;
        const headerRes = await this.callWithRetry(() => axios.get(readUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        }));
        const headers = (headerRes.data.values && headerRes.data.values[0]) ? headerRes.data.values[0] : [];

        const map = {};
        headers.forEach((h, i) => {
            const clean = String(h || '').toLowerCase().replace(/[\s\/_]/g, '');
            if (clean === 'category' || clean === '카테고리') map.category = i;
            else if (
                clean === 'poststatus'
                || clean === 'post_status'
                || clean === '발행옵션'
            ) map.postStatus = i;
            else if (clean === 'scheduledate' || clean === 'schedule_date' || clean === '예약일시') map.scheduleDate = i;
            else if (clean.includes('주제') || clean.includes('subject')) map.subject = i;
            else if (clean.includes('키워드') || clean.includes('keyword')) map.keyword = i;
            else if (clean.includes('참고지시사항') || clean.includes('instruction') || clean.includes('지시사항')) map.instruction = i;
            else if (clean.includes('참고url') || clean.includes('referenceurl') || clean === 'url') map.url = i;
            else if (clean.includes('상태') || clean.includes('status')) map.status = i;
            else if (clean.includes('이미지처리') || clean.includes('imagemode') || clean.includes('이미지생성') || clean.includes('imagegen') || clean.includes('imggen')) map.imgGen = i;
            else if (clean.includes('외부참고') || clean.includes('external') || clean.includes('extref')) map.extRef = i;
            else if (clean === 'options' || clean === '옵션') map.options = i;
        });

        if (map.subject === undefined) map.subject = 1;
        if (map.keyword === undefined) map.keyword = 2;

        const targetRow = safeRowIndex + 2;
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
        let existingOptionsRaw = '';
        if (map.options !== undefined) {
            const rowReadUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!${targetRow}:${targetRow}`;
            const rowRes = await this.callWithRetry(() => axios.get(rowReadUrl, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            }));
            const rowValues = Array.isArray(rowRes?.data?.values?.[0]) ? rowRes.data.values[0] : [];
            existingOptionsRaw = rowValues[map.options] !== undefined ? rowValues[map.options] : '';
        }
        if (map.category !== undefined) dataToUpdate.push({ range: `${sheetName}!${toA1(map.category)}${targetRow}`, values: [[normalized.category]] });
        if (map.postStatus !== undefined) dataToUpdate.push({ range: `${sheetName}!${toA1(map.postStatus)}${targetRow}`, values: [[normalized.postStatus]] });
        if (map.scheduleDate !== undefined) dataToUpdate.push({ range: `${sheetName}!${toA1(map.scheduleDate)}${targetRow}`, values: [[normalized.scheduleDate]] });
        if (map.subject !== undefined) dataToUpdate.push({ range: `${sheetName}!${toA1(map.subject)}${targetRow}`, values: [[normalized.subject]] });
        if (map.keyword !== undefined) dataToUpdate.push({ range: `${sheetName}!${toA1(map.keyword)}${targetRow}`, values: [[normalized.keywords]] });
        if (map.instruction !== undefined) dataToUpdate.push({ range: `${sheetName}!${toA1(map.instruction)}${targetRow}`, values: [[normalized.instruction]] });
        if (map.url !== undefined) dataToUpdate.push({ range: `${sheetName}!${toA1(map.url)}${targetRow}`, values: [[normalized.referenceUrl]] });
        if (map.status !== undefined) dataToUpdate.push({ range: `${sheetName}!${toA1(map.status)}${targetRow}`, values: [[normalized.status]] });
        if (map.imgGen !== undefined) dataToUpdate.push({ range: `${sheetName}!${toA1(map.imgGen)}${targetRow}`, values: [[formatSheetImageModeValue(normalized.imageMode)]] });
        if (map.extRef !== undefined) dataToUpdate.push({ range: `${sheetName}!${toA1(map.extRef)}${targetRow}`, values: [[normalized.externalReference]] });
        if (map.options !== undefined) {
            const syncedOptions = mergeTopicSheetOptions(existingOptionsRaw, {
                title: normalized.title,
                subject: normalized.subject,
                keywords: normalized.keywords,
                instruction: normalized.instruction,
                referenceUrls: normalized.referenceUrl,
                category: normalized.category,
                postStatus: normalized.postStatus,
                scheduleDate: normalized.scheduleDate,
                imageMode: normalized.imageMode,
                imageGeneration: normalized.imageGeneration,
                externalReference: normalized.externalReference === 'Yes',
                writingStrategy: normalized.writingStrategy,
                writingOverrides: normalized.writingOverrides,
                platforms: normalized.platforms,
                siteTarget: fields.siteTarget
            });
            dataToUpdate.push({
                range: `${sheetName}!${toA1(map.options)}${targetRow}`,
                values: [[stringifySheetOptionsValue(syncedOptions)]]
            });
        }

        if (dataToUpdate.length === 0) {
            throw new Error('수정 가능한 컬럼을 찾지 못했습니다.');
        }

        const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;
        await this.callWithRetry(() => axios.post(updateUrl, {
            valueInputOption: 'USER_ENTERED',
            data: dataToUpdate
        }, {
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
        }));
        await sleep(300);
        this.clearSheetCache('topics');
    },

    /**
     * 3. 엑셀 읽기 (기존 유지 + 필터 수정)
     */
    // 3. (Deleted) Excel Support Removed
    // readExcelTopics & updateExcelStatus functions were removed.
};
