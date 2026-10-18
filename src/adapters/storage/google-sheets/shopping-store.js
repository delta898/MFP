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
    appendGoogleSheetShopping: async function (newItems, options = {}) {
        if (!Array.isArray(newItems) || newItems.length === 0) {
            return { success: true, addedCount: 0, rowNumbers: [], rowIndices: [] };
        }

        try {
            await this.ensureAllSheetsExist();

            const accessToken = await this.getGoogleAccessToken();
            const sheetName = CONFIG.GOOGLE_SHOPPING_SHEET || 'shopping';
            const spreadsheetId = CONFIG.GOOGLE_SHEET_ID;
            const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:1`;

            const headerRes = await this.callWithRetry(() => axios.get(readUrl, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            }));
            const headers = Array.isArray(headerRes?.data?.values?.[0]) ? headerRes.data.values[0] : [];
            if (headers.length === 0) {
                throw new Error('shopping 시트 헤더를 찾지 못했습니다.');
            }

            const map = {};
            headers.forEach((h, i) => {
                const clean = String(h || '').toLowerCase().replace(/[\s\/_]/g, '');
                if ((clean.includes('category') || clean.includes('카테고리')) && map.category === undefined) map.category = i;
                if ((clean.includes('poststatus') || clean.includes('발행옵션') || clean.includes('발행상태')) && map.postStatus === undefined) map.postStatus = i;
                if ((clean.includes('scheduledate') || clean.includes('예약')) && map.scheduleDate === undefined) map.scheduleDate = i;
                if ((clean.includes('url') || clean.includes('링크')) && map.shortUrl === undefined) map.shortUrl = i;
                if ((clean.includes('상품') || clean.includes('product')) && map.product === undefined) map.product = i;
                if ((clean.includes('참고지시사항') || clean.includes('instruction') || clean.includes('지시사항')) && map.instruction === undefined) map.instruction = i;
                if ((clean.includes('상태') && !clean.includes('발행상태') && !clean.includes('poststatus') || clean.includes('status') && !clean.includes('poststatus')) && map.status === undefined) map.status = i;
                if ((clean.includes('발행') || clean.includes('time') || clean.includes('date') || clean.includes('시간') || clean.includes('작업시간')) && !clean.includes('예약') && map.publishedAt === undefined) map.publishedAt = i;
                if ((clean.includes('로그') || clean.includes('log')) && map.log === undefined) map.log = i;
                if ((clean === 'options' || clean === '옵션') && map.options === undefined) map.options = i;
            });

            // Fallbacks for the default structure if not found
            if (map.category === undefined) map.category = 0;
            if (map.postStatus === undefined) map.postStatus = 1;
            if (map.scheduleDate === undefined) map.scheduleDate = 2;
            if (map.shortUrl === undefined) map.shortUrl = 3;
            if (map.product === undefined) map.product = 4;
            if (map.status === undefined) map.status = 5;
            if (map.publishedAt === undefined) map.publishedAt = 6;
            if (map.log === undefined) map.log = 7;

            const maxCol = Math.max(
                map.category,
                map.postStatus,
                map.scheduleDate,
                map.shortUrl,
                map.product,
                map.instruction ?? 0,
                map.status,
                map.publishedAt,
                map.log,
                map.options ?? 0
            );
            const defaultStatus = String(options.defaultStatus || '준비').trim() || '준비';

            const rowsToAdd = newItems.map((item) => {
                const row = new Array(maxCol + 1).fill('');

                const category = String(item?.category || item?.wp_category || '').trim();
                const postStatus = String(item?.postStatus || item?.post_status || 'publish').trim();
                const scheduleDate = String(item?.scheduleDate || item?.schedule_date || '').trim();
                const shortUrl = String(item?.shortUrl || item?.url || '').trim();
                const product = String(item?.product || '').trim();
                const instruction = String(item?.instruction || item?.options?.instruction || '').trim();
                const rowStatus = String(item?.status || defaultStatus).trim() || defaultStatus;
                const syncedOptions = mergeShoppingSheetOptions(item?.options, {
                    instruction,
                    category,
                    postStatus,
                    scheduleDate,
                    writingStrategy: item?.writingStrategy || item?.writing_strategy,
                    contentFocus: item?.contentFocus || item?.content_focus,
                    targets: item?.targets || item?.platforms
                });

                row[map.category] = category;
                row[map.postStatus] = postStatus;
                row[map.scheduleDate] = scheduleDate;
                row[map.shortUrl] = shortUrl;
                row[map.product] = product;
                if (map.instruction !== undefined) row[map.instruction] = instruction;
                row[map.status] = rowStatus;
                if (map.publishedAt !== undefined) row[map.publishedAt] = '';
                if (map.log !== undefined) row[map.log] = '';
                if (map.options !== undefined) row[map.options] = stringifySheetOptionsValue(syncedOptions);

                return row;
            });

            const appendUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}:append?valueInputOption=USER_ENTERED`;
            const appendRes = await this.callWithRetry(() => axios.post(appendUrl, {
                range: sheetName,
                majorDimension: 'ROWS',
                values: rowsToAdd
            }, {
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
            }));

            const updatedRange = appendRes?.data?.updates?.updatedRange || '';
            let rowNumbers = [];
            if (updatedRange) {
                const right = String(updatedRange).split('!')[1] || '';
                const m = right.match(/[A-Z]+(\d+):[A-Z]+(\d+)/i) || right.match(/[A-Z]+(\d+)/i);
                if (m) {
                    const startRow = parseInt(m[1], 10);
                    const endRow = m[2] ? parseInt(m[2], 10) : startRow;
                    if (!Number.isNaN(startRow) && !Number.isNaN(endRow)) {
                        for (let r = startRow; r <= endRow; r++) rowNumbers.push(r);
                    }
                }
            }
            const rowIndices = rowNumbers.map((rowNum) => rowNum - 2).filter((idx) => idx >= 0);

            await this.sleep(200);
            this.clearSheetCache('topics_all');
            // 목록 화면은 상태·정렬·검색 조건마다 별도 캐시 키를 사용한다.
            // 새 글감이 즉시 어느 탭에도 보이도록 shopping 전체를 무효화한다.
            this.clearSheetCache('shopping');

            // [Universal Memory] 쇼핑 아이템 기록
            for (const item of newItems) {
                try {
                    const memoryData = {
                        name: item.product || item.name || '',
                        price: item.price || '',
                        mall: item.mall || '',
                        source: item.source || options.source || 'manual'
                    };
                    await getAgentEventStore().recordShoppingItem(
                        item.chatId || options.chatId || null,
                        memoryData,
                        item.memory_provenance || options.memoryProvenance || {}
                    );
                } catch (memoryError) {
                    Logger.error(`⚠️ [Utils] 쇼핑 메모리 기록 실패: ${memoryError.message}`);
                }
            }

            return {
                success: true,
                addedCount: rowsToAdd.length,
                rowNumbers,
                rowIndices
            };
        } catch (e) {
            Logger.error(`❌ 쇼핑 시트 append 실패: ${e.message}`);
            return {
                success: false,
                message: e.message
            };
        }
    },

    /**
     * Shopping 시트 읽기 ('발행 준비 완료' 상태만)
     */
    readGoogleSheetShopping: async function (options = {}) {
        try {
            if (!options.silent) Logger.info("🌐 구글 쇼핑 시트 읽기 (Target: 발행 준비 완료)");
            const accessToken = await this.getGoogleAccessToken();

            const sheetName = CONFIG.GOOGLE_SHOPPING_SHEET || 'shopping';
            const spreadsheetId = CONFIG.GOOGLE_SHEET_ID;
            const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}`;

            const res = await this.callWithRetry(() => axios.get(url, {
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
            }));

            const rows = res.data.values;
            if (!rows || rows.length === 0) return [];

            const headers = rows[0].map(h => h.toLowerCase().replace(/[\s\/_]/g, '').trim());
            let urlIdx = -1;
            let statusIdx = -1;

            headers.forEach((h, i) => {
                if (h.includes('url') || h.includes('링크')) urlIdx = i;
                if (
                    (h.includes('상태') && !h.includes('발행상태') && !h.includes('poststatus'))
                    || (h.includes('status') && !h.includes('poststatus'))
                ) statusIdx = i;
            });

            if (urlIdx === -1 || statusIdx === -1) {
                Logger.error("❌ 쇼핑 시트 헤더를 찾을 수 없습니다. (URL, 상태 필수)");
                return [];
            }

            const jobs = [];
            rows.slice(1).forEach((row, index) => {
                const shortUrl = row[urlIdx] ? String(row[urlIdx]).trim() : "";
                const status = row[statusIdx] ? String(row[statusIdx]).trim() : "";
                if (shortUrl && status === '발행 준비 완료') {
                    const headers = rows[0].map(h => h.toLowerCase().replace(/[\s\/_]/g, '').trim());
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

                    jobs.push({
                        rowIndex: index,
                        shortUrl,
                        status,
                        ...(() => {
                            const resolvedState = resolveShoppingSheetState({
                                instruction: getVal(['참고지시사항', '참고/지시사항', 'instruction', '지시사항']),
                                category: getVal(['category', '카테고리']),
                                postStatus: getVal(['poststatus', 'post_status', '발행옵션', '발행상태']),
                                scheduleDate: getVal(['scheduledate', 'schedule_date', '예약일시']),
                                options: getVal(['options', '옵션', 'extra_options'])
                            });
                            return {
                                instruction: resolvedState.instruction || '',
                                category: resolvedState.category || '',
                                postStatus: resolvedState.postStatus || 'publish',
                                scheduleDate: resolvedState.scheduleDate || '',
                                writingStrategy: resolvedState.writingStrategy || '',
                                contentFocus: resolvedState.contentFocus || 'auto',
                                targets: resolvedState.targets || [],
                                options: resolvedState.options
                            };
                        })(),
                        log: getVal(['log', '로그'])
                    });
                }
            });

            return jobs;
        } catch (e) {
            if (CONFIG.CONFIG_IS_ESSENTIAL_SET) {
                Logger.info(`쇼핑 시트 읽기 실패: ${e.message} (미사용 시 무시 가능)`);
            }
            return [];
        }
    },

    /**
     * UI/운영용: shopping 시트 전체 조회 (상태/검색/페이징/정렬 지원)
     */
    readGoogleSheetShoppingAll: async function (options = {}) {
        const cacheKey = `shopping_${options.status || 'all'}_${options.q || ''}_${options.limit || 'max'}_${options.offset || 0}_${options.sortBy || 'none'}_${options.sortDir || 'none'}`;
        return this.withSimpleCache(cacheKey, async () => {
            try {
                const accessToken = await this.getGoogleAccessToken();
                const sheetName = CONFIG.GOOGLE_SHOPPING_SHEET || 'shopping';
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

                    const shortUrl = getVal(['url', '링크']);
                    const status = getVal(['상태', 'status']);
                    const publishedAt = getVal(['발행시간', '발행시간', 'publish_time', 'time', '작업시간', '작업시간']);
                    const product = getVal(['상품', 'product']);
                    const logStr = getVal(['로그', 'log']);
                    const resolvedState = resolveShoppingSheetState({
                        instruction: getVal(['참고지시사항', '참고/지시사항', 'instruction', '지시사항']),
                        category: getVal(['category', '카테고리']),
                        postStatus: getVal(['poststatus', 'post_status', '발행옵션', '발행상태']),
                        scheduleDate: getVal(['scheduledate', 'schedule_date', '예약일시']),
                        options: getVal(['options', '옵션', 'extra_options'])
                    });

                    return {
                        rowIndex: index,
                        rowNumber: index + 2,
                        shortUrl: shortUrl || '',
                        status: status || '',
                        publishedAt: publishedAt || '',
                        product: product || '',
                        log: logStr || '',
                        instruction: resolvedState.instruction || '',
                        category: resolvedState.category || '',
                        postStatus: resolvedState.postStatus || 'publish',
                        scheduleDate: resolvedState.scheduleDate || '',
                        writingStrategy: resolvedState.writingStrategy || '',
                        contentFocus: resolvedState.contentFocus || 'auto',
                        targets: resolvedState.targets || [],
                        options: resolvedState.options
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
                            item.product,
                            item.shortUrl,
                            item.status,
                            item.publishedAt,
                            item.log,
                            item.instruction
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
                    if (sortBy === 'product') return String(item.product || '');
                    if (sortBy === 'shortUrl') return String(item.shortUrl || '');
                    if (sortBy === 'runtimeLog') return String(item.log || '');
                    if (sortBy === 'status') return String(item.status || '');
                    if (sortBy === 'publishedAt') return String(item.publishedAt || '');
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
                Logger.error(`❌ readGoogleSheetShoppingAll 오류: ${e.message}`);
                throw e;
            }
        });
    },

    /**
     * Shopping 시트 상태 업데이트 (개별 row)
     */
    updateGoogleSheetShoppingStatus: async function (rowIndex, status, updateTime = true, logMessage = null) {
        try {
            const accessToken = await this.getGoogleAccessToken();
            const sheetName = CONFIG.GOOGLE_SHOPPING_SHEET || 'shopping';
            const spreadsheetId = CONFIG.GOOGLE_SHEET_ID;

            const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:1`;
            const headerRes = await this.callWithRetry(() => axios.get(readUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } }));

            const headers = headerRes.data.values[0];
            let statusColIndex = -1;
            let timeColIndex = -1;
            let logColIndex = -1;

            headers.forEach((h, i) => {
                const clean = h.toLowerCase().replace(/[\s\/_]/g, '');
                if (clean.includes('상태') || clean.includes('status')) statusColIndex = i;
                else if (clean.includes('발행') || clean.includes('time') || clean.includes('date') || clean.includes('시간')) timeColIndex = i;
                else if (clean.includes('로그') || clean.includes('log')) logColIndex = i;
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

            const dataToUpdate = [];
            dataToUpdate.push({ range: `${sheetName}!${toA1(statusColIndex)}${targetRow}`, values: [[status]] });
            if (updateTime && timeColIndex !== -1) {
                dataToUpdate.push({ range: `${sheetName}!${toA1(timeColIndex)}${targetRow}`, values: [[new Date().toLocaleString()]] });
            }
            if (logMessage !== null && logColIndex !== -1) {
                dataToUpdate.push({ range: `${sheetName}!${toA1(logColIndex)}${targetRow}`, values: [[String(logMessage)]] });
            }

            const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;
            await this.callWithRetry(() => axios.post(updateUrl, { valueInputOption: 'USER_ENTERED', data: dataToUpdate }, {
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
            }));

            this.clearSheetCache('shopping');
            await this.sleep(500);
        } catch (e) {
            Logger.error(`❌ 쇼핑 상태 업데이트 실패 (Row ${rowIndex}): ${e.message}`);
        }
    },

    /**
     * shopping 시트 편집 가능 필드 업데이트 (상품/URL/상태)
     */
    updateGoogleSheetShoppingEditableFields: async function (rowIndex, fields = {}) {
        try {
            const accessToken = await this.getGoogleAccessToken();
            const sheetName = CONFIG.GOOGLE_SHOPPING_SHEET || 'shopping';
            const spreadsheetId = CONFIG.GOOGLE_SHEET_ID;

            const readUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!1:1`;
            const headerRes = await this.callWithRetry(() => axios.get(readUrl, { headers: { 'Authorization': `Bearer ${accessToken}` } }));

            const headers = headerRes.data.values[0];
            let urlColIndex = -1;
            let statusColIndex = -1;
            let productColIndex = -1;
            let instructionColIndex = -1;
            let categoryColIndex = -1;
            let postStatusColIndex = -1;
            let scheduleDateColIndex = -1;
            let optionsColIndex = -1;

            headers.forEach((h, i) => {
                const clean = String(h || '').toLowerCase().replace(/[\s\/_]/g, '');
                if ((clean.includes('category') || clean.includes('카테고리')) && categoryColIndex === -1) categoryColIndex = i;
                if ((clean.includes('poststatus') || clean.includes('발행옵션') || clean.includes('발행상태')) && postStatusColIndex === -1) postStatusColIndex = i;
                if ((clean.includes('scheduledate') || clean.includes('예약')) && scheduleDateColIndex === -1) scheduleDateColIndex = i;
                if ((clean.includes('url') || clean.includes('링크')) && urlColIndex === -1) urlColIndex = i;
                if ((clean.includes('상태') && !clean.includes('발행상태') && !clean.includes('poststatus') || clean.includes('status') && !clean.includes('poststatus')) && statusColIndex === -1) statusColIndex = i;
                if ((clean.includes('상품') || clean.includes('product')) && productColIndex === -1) productColIndex = i;
                if ((clean.includes('참고지시사항') || clean.includes('instruction') || clean.includes('지시사항')) && instructionColIndex === -1) instructionColIndex = i;
                if ((clean === 'options' || clean === '옵션') && optionsColIndex === -1) optionsColIndex = i;
            });

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

            const dataToUpdate = [];
            let existingOptionsRaw = '';
            if (optionsColIndex !== -1) {
                const rowReadUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetName)}!${targetRow}:${targetRow}`;
                const rowRes = await this.callWithRetry(() => axios.get(rowReadUrl, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                }));
                const rowValues = Array.isArray(rowRes?.data?.values?.[0]) ? rowRes.data.values[0] : [];
                existingOptionsRaw = rowValues[optionsColIndex] !== undefined ? rowValues[optionsColIndex] : '';
            }
            if (fields.category !== undefined && categoryColIndex !== -1) {
                dataToUpdate.push({
                    range: `${sheetName}!${toA1(categoryColIndex)}${targetRow}`,
                    values: [[String(fields.category || '').trim()]]
                });
            }
            if (fields.postStatus !== undefined && postStatusColIndex !== -1) {
                dataToUpdate.push({
                    range: `${sheetName}!${toA1(postStatusColIndex)}${targetRow}`,
                    values: [[String(fields.postStatus || '').trim()]]
                });
            }
            if (fields.scheduleDate !== undefined && scheduleDateColIndex !== -1) {
                dataToUpdate.push({
                    range: `${sheetName}!${toA1(scheduleDateColIndex)}${targetRow}`,
                    values: [[String(fields.scheduleDate || '').trim()]]
                });
            }
            if (fields.product !== undefined && productColIndex !== -1) {
                dataToUpdate.push({
                    range: `${sheetName}!${toA1(productColIndex)}${targetRow}`,
                    values: [[String(fields.product || '').trim()]]
                });
            }
            if (fields.instruction !== undefined && instructionColIndex !== -1) {
                dataToUpdate.push({
                    range: `${sheetName}!${toA1(instructionColIndex)}${targetRow}`,
                    values: [[String(fields.instruction || '').trim()]]
                });
            }
            if (fields.shortUrl !== undefined && urlColIndex !== -1) {
                dataToUpdate.push({
                    range: `${sheetName}!${toA1(urlColIndex)}${targetRow}`,
                    values: [[String(fields.shortUrl || '').trim()]]
                });
            }
            if (fields.status !== undefined && statusColIndex !== -1) {
                dataToUpdate.push({
                    range: `${sheetName}!${toA1(statusColIndex)}${targetRow}`,
                    values: [[String(fields.status || '').trim()]]
                });
            }
            if (optionsColIndex !== -1) {
                const syncedOptions = mergeShoppingSheetOptions(existingOptionsRaw, {
                    instruction: fields.instruction,
                    category: fields.category,
                    postStatus: fields.postStatus,
                    scheduleDate: fields.scheduleDate,
                    writingStrategy: fields.writingStrategy,
                    contentFocus: fields.contentFocus,
                    targets: fields.targets
                });
                dataToUpdate.push({
                    range: `${sheetName}!${toA1(optionsColIndex)}${targetRow}`,
                    values: [[stringifySheetOptionsValue(syncedOptions)]]
                });
            }

            if (dataToUpdate.length === 0) {
                throw new Error('shopping 시트 편집 가능한 컬럼을 찾지 못했습니다.');
            }

            const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;
            await this.callWithRetry(() => axios.post(updateUrl, {
                valueInputOption: 'USER_ENTERED',
                data: dataToUpdate
            }, {
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
            }));

            this.clearSheetCache('shopping');
            await this.sleep(300);
        } catch (e) {
            Logger.error(`❌ 쇼핑 editable 필드 업데이트 실패 (Row ${rowIndex}): ${e.message}`);
            throw e;
        }
    },

    /**
     * 1-1. 키워드 시트 읽기 ('연관검색어 조사' 상태만)
     */
};
