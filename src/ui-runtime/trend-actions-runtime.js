function createTrendActionsRuntime(deps = {}) {
    const {
        Logger,
        CONFIG,
        Utils,
        License,
        TrendManager,
        ensureSheetsReadyForUi,
        recordUiActivity,
        parseIntSafe,
        checkAuthSessionValid,
        toFeatureMap,
        isCommandEnabled,
        getFeatureBool,
        getBlogAutoSettingsSnapshot,
        normalizeYmdToken,
        toBoolLike,
        normalizeNonNegativeInt,
        normalizeIntegerOrBlank,
        collectTrendsDefaults,
        publishAutoDefaults,
        parseCsvTokens,
        matchesAnyToken,
        parseVariationMeta,
        matchesVariationFilter,
        getRecentTopicKeys,
        buildTopicReuseKey
    } = deps;

    function parseUniqueRowIndices(rawValue) {
        const rowValues = Array.isArray(rawValue) ? rawValue : [];
        return Array.from(new Set(
            rowValues
                .map((value) => parseIntSafe(value, null, 0))
                .filter((value) => value !== null)
        ));
    }

    function filterAutoTopicCandidates(items = [], settings = {}) {
        const includeCategories = parseCsvTokens(settings.BLOG_AUTO_CATEGORIES);
        const todayYmd = (() => {
            const formatter = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'Asia/Seoul',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });
            return formatter.format(new Date());
        })();

        return items.filter((item) => {
            const status = String(item?.status || '').trim();
            if (status !== '발행 준비 완료') return false;

            const source = String(item?.source || '').trim().toLowerCase();
            if (source !== 'auto-trends') return false;

            const addedAtYmd = normalizeYmdToken(item?.addedAt);
            const trendDateYmd = normalizeYmdToken(item?.trendDate);
            const candidateDateYmd = addedAtYmd || trendDateYmd;
            if (!candidateDateYmd || !todayYmd || candidateDateYmd !== todayYmd) return false;

            const subject = String(item?.subject || '').trim();
            const keywordText = Array.isArray(item?.keywords) ? item.keywords.join(', ') : String(item?.keywords || '');
            const text = `${subject} ${keywordText}`.toLowerCase();
            if (includeCategories.length > 0 && !matchesAnyToken(text, includeCategories)) return false;
            return true;
        });
    }

    async function processAndAppendTrendsToTopics(trends, settings = {}) {
        if (!Array.isArray(trends) || trends.length === 0) {
            return { appendedCount: 0, candidates: 0, rowIndices: [], filteredCount: 0, duplicateCount: 0, reuseBlockedCount: 0 };
        }

        const targetTrendDateYmd = normalizeYmdToken(settings.BLOG_AUTO_TARGET_TREND_DATE || '');
        const variationType = String(settings.COLLECT_TRENDS_FILTER_TYPE ?? 'min').trim() || 'min';
        const variationIncludeNew = toBoolLike(settings.COLLECT_TRENDS_FILTER_INCLUDE_NEW, false);
        const variationIncludeDash = toBoolLike(settings.COLLECT_TRENDS_FILTER_INCLUDE_DASH, false);
        const variationIncludeNumber = toBoolLike(settings.COLLECT_TRENDS_FILTER_INCLUDE_NUMBER, true);
        const variationNumber = normalizeIntegerOrBlank(settings.COLLECT_TRENDS_FILTER_MIN_INCR, '');
        const variationTopN = normalizeIntegerOrBlank(settings.COLLECT_TRENDS_FILTER_TOP_N, 5);
        const keywordReuseGapDays = normalizeNonNegativeInt(settings.COLLECT_TRENDS_REUSE_GAP_DAYS, collectTrendsDefaults.reuseGapDays);
        const naverCategory = String(settings.COLLECT_TRENDS_NAVER_CATEGORY || '').trim();
        const wordpressCategory = String(settings.COLLECT_TRENDS_WP_CATEGORY || '').trim();
        const finalCategory = (naverCategory || wordpressCategory) ? `N:${naverCategory}, W:${wordpressCategory}` : '';
        const autoImageGeneration = toBoolLike(settings.PUBLISH_AUTO_IMAGE_GENERATION, publishAutoDefaults.imageGeneration);

        const candidateLogLimit = 120;
        const dateCategoryMatchedRows = [];
        let dateCategoryMatchedCount = 0;
        let variationRejectedCount = 0;
        let emptyKeywordRejectedCount = 0;

        const includeCategories = parseCsvTokens(settings.COLLECT_TRENDS_CATEGORIES || '');

        Logger.debug(`ℹ️ [AUTO][DEBUG] processAndAppendTrendsToTopics settings: ${JSON.stringify(settings)}`);
        Logger.info(
            `ℹ️ [AUTO] Direct trends→topics 필터: `
            + `trendDate=${targetTrendDateYmd || '(미지정)'}, `
            + `categories=${includeCategories.length > 0 ? includeCategories.join(',') : '(전체)'}, `
            + `variationType=${variationType}, `
            + `variation=new:${variationIncludeNew ? 'Y' : 'N'},dash:${variationIncludeDash ? 'Y' : 'N'},num:${variationIncludeNumber ? 'Y' : 'N'}${variationIncludeNumber && (variationType === 'top' ? Number.isInteger(variationTopN) : variationNumber !== '') ? `(${variationType === 'top' ? `top:${variationTopN}` : `val:${variationNumber}`})` : ''}, `
            + `reuseGapDays=${keywordReuseGapDays}`
        );

        const baseCandidates = trends.filter((item, index) => {
            item.rowNumber = index + 1;

            if (targetTrendDateYmd) {
                const itemDateYmd = normalizeYmdToken(item?.date);
                if (!itemDateYmd || itemDateYmd !== targetTrendDateYmd) return false;
            }

            const category = String(item?.category || '').trim();
            if (includeCategories.length > 0 && !matchesAnyToken(category, includeCategories)) return false;

            dateCategoryMatchedCount += 1;
            const keyword = String(item?.keyword || '').trim();
            if (!keyword) {
                emptyKeywordRejectedCount += 1;
                return false;
            }
            return true;
        });

        let filtered = [];

        if (variationType === 'top' && variationIncludeNumber && Number.isInteger(variationTopN) && variationTopN > 0) {
            const categoryGroups = {};

            for (const item of baseCandidates) {
                const category = String(item.category || '').trim();
                if (!categoryGroups[category]) {
                    categoryGroups[category] = { rankedPool: [], absoluteAllowed: [] };
                }

                const meta = parseVariationMeta(item?.variation);
                if (variationIncludeNew && meta.kind === 'new') {
                    categoryGroups[category].absoluteAllowed.push(item);
                } else if (variationIncludeDash && meta.kind === 'dash') {
                    categoryGroups[category].absoluteAllowed.push(item);
                } else if (meta.kind === 'number') {
                    categoryGroups[category].rankedPool.push({ item, score: Number(meta.number) });
                } else {
                    variationRejectedCount += 1;
                }
            }

            const allSelected = [];
            for (const category in categoryGroups) {
                const group = categoryGroups[category];
                group.rankedPool.sort((a, b) => b.score - a.score);
                const topSelected = group.rankedPool.slice(0, variationTopN).map((entry) => entry.item);
                variationRejectedCount += Math.max(0, group.rankedPool.length - topSelected.length);
                allSelected.push(...group.absoluteAllowed, ...topSelected);
            }

            filtered = allSelected;
            for (const item of baseCandidates) {
                if (dateCategoryMatchedRows.length >= candidateLogLimit) break;
                const isSelected = filtered.some((selected) => selected.rowNumber === item.rowNumber);
                dateCategoryMatchedRows.push({
                    rowNumber: Number(item?.rowNumber || 0),
                    date: String(item?.date || '').trim(),
                    category: String(item?.category || '').trim(),
                    keyword: String(item?.keyword || '').trim(),
                    variation: String(item?.variation || '-').trim() || '-',
                    selected: isSelected,
                    rejectReason: isSelected ? '' : '순위 밖 탈락(Top N)'
                });
            }
        } else {
            filtered = baseCandidates.filter((item) => {
                const isMatched = matchesVariationFilter(item?.variation, settings);
                if (!isMatched) {
                    variationRejectedCount += 1;
                }
                if (dateCategoryMatchedRows.length < candidateLogLimit) {
                    dateCategoryMatchedRows.push({
                        rowNumber: Number(item?.rowNumber || 0),
                        date: String(item?.date || '').trim(),
                        category: String(item?.category || '').trim(),
                        keyword: String(item?.keyword || '').trim(),
                        variation: String(item?.variation || '-').trim() || '-',
                        selected: isMatched,
                        rejectReason: isMatched ? '' : '수치 미달(Min)'
                    });
                }
                return isMatched;
            });
        }

        Logger.info(
            `ℹ️ [AUTO] direct trendDate 카테고리 후보: ${dateCategoryMatchedCount}건 `
            + `(증감 탈락 ${variationRejectedCount}, 빈키워드 탈락 ${emptyKeywordRejectedCount})`
        );

        if (dateCategoryMatchedRows.length > 0) {
            Logger.debug(`ℹ️ [AUTO] 트렌드 후보 필터링 상세 (상한 ${candidateLogLimit}건):`);
            for (const row of dateCategoryMatchedRows) {
                const decision = row.selected ? '선정' : `제외(${row.rejectReason})`;
                Logger.debug(
                    `   • [AUTO][후보] Row ${row.rowNumber || '-'} | ${row.date || '-'} | `
                    + `${row.category || '-'} | ${row.keyword || '-'} | 증감:${row.variation} | ${decision}`
                );
            }
            if (dateCategoryMatchedCount > dateCategoryMatchedRows.length) {
                Logger.debug(
                    `   • [AUTO][후보] ... 생략 ${dateCategoryMatchedCount - dateCategoryMatchedRows.length}건 `
                    + `(로그 상한 ${candidateLogLimit}건)`
                );
            }
        }

        if (filtered.length === 0) {
            return { appendedCount: 0, candidates: 0, rowIndices: [], filteredCount: 0, duplicateCount: 0, reuseBlockedCount: 0 };
        }

        const existingTopicsRes = await Utils.readGoogleSheetTopicsAll({ q: '', limit: 100000, offset: 0, sortBy: 'rowNumber', sortDir: 'desc' });
        const existingTopics = Array.isArray(existingTopicsRes.items) ? existingTopicsRes.items : [];
        const recentReuseKeySet = getRecentTopicKeys(existingTopics, keywordReuseGapDays, targetTrendDateYmd);
        const inBatchKeySet = new Set();

        const topicsToAppend = [];
        let duplicateCount = 0;
        let reuseBlockedCount = 0;

        for (const item of filtered) {
            const subject = String(item.category || item.keyword || '').trim();
            const keyword = String(item.keyword || '').trim();
            if (!subject || !keyword) continue;

            const reuseKey = buildTopicReuseKey(subject, [keyword]);
            Logger.debug(`   - 중복 체크 대상: ${subject} / ${keyword} (key: ${reuseKey})`);

            if (keywordReuseGapDays > 0 && reuseKey && recentReuseKeySet.has(reuseKey)) {
                Logger.info(`🚫 자동수집 중복 금지(Reuse Gap): ${subject} / ${keyword}`);
                reuseBlockedCount += 1;
                continue;
            }
            if (reuseKey && inBatchKeySet.has(reuseKey)) {
                duplicateCount += 1;
                continue;
            }
            if (reuseKey) inBatchKeySet.add(reuseKey);

            topicsToAppend.push({
                subject,
                keywords: [keyword],
                content_guide: {
                    additional_instructions: '',
                    reference_urls: []
                },
                use_external_ref: true,
                category: finalCategory,
                image_options: { generate: autoImageGeneration, count: 4 },
                source: 'auto-trends',
                trendDate: String(item.date || '').trim(),
                status: '발행 준비 완료'
            });
        }

        let appendedRowIndices = [];
        if (topicsToAppend.length > 0) {
            const appendResult = await Utils.appendGoogleSheetTopics(topicsToAppend, { defaultStatus: '발행 준비 완료' });
            if (!appendResult?.success) {
                throw new Error(appendResult?.message || 'AUTO direct trends→topics append 실패');
            }
            appendedRowIndices = Array.isArray(appendResult?.rowIndices)
                ? appendResult.rowIndices.filter((value) => Number.isInteger(value) && value >= 0)
                : [];
        }

        return {
            appendedCount: topicsToAppend.length,
            candidates: filtered.length,
            rowIndices: appendedRowIndices,
            filteredCount: filtered.length,
            duplicateCount,
            reuseBlockedCount
        };
    }

    async function executeTrendCollectAction(requestBody = {}) {
        recordUiActivity({
            category: 'collection',
            type: 'trends_collect_started',
            title: '트렌드 수집 시작',
            detail: String(requestBody?.date || requestBody?.trendDate || '').trim() || '최근 데이터 기준'
        });
        try {
            await ensureSheetsReadyForUi();
        } catch (error) {
            Logger.error(`❌ [AUTO][Producer] 필수 시트 준비 실패: ${error.message}`);
            return { success: false, code: 'SHEETS_NOT_READY', message: `필수 시트 준비 실패: ${error.message}` };
        }

        const precheck = await License.checkLicenseStatus();
        if (!precheck.success) {
            Logger.error(`❌ [AUTO][Producer] 라이선스 상태 확인 실패: ${precheck.message}`);
            return { success: false, code: 'LICENSE_STATUS_FAILED', message: precheck.message };
        }
        const features = toFeatureMap(precheck.features);
        if (!isCommandEnabled(features, 'trends')) {
            return { success: false, code: 'FEATURE_DISABLED', message: '현재 플랜에서 trends 기능이 비활성화되어 있습니다. (cmd_trends=false)' };
        }

        const dateInput = String(requestBody?.date || requestBody?.trendDate || '').trim();
        if (dateInput && !getFeatureBool(features, 'enable_trends_date_override', false)) {
            return {
                success: false,
                code: 'FEATURE_DISABLED',
                message: '현재 플랜에서 날짜 지정 트렌드 기능이 비활성화되어 있습니다. (enable_trends_date_override=false)'
            };
        }

        const session = await checkAuthSessionValid();
        if (!session.ok) {
            Logger.error(`❌ [AUTO][Producer] 네이버 인증 세션 유효하지 않음 (${session.reason}): ${session.message || '인증 정보가 없거나 만료되었습니다.'}`);
            return { success: false, code: 'NAVER_SESSION_INVALID', message: '네이버 로그인 세션이 유효하지 않습니다. 먼저 로그인해 주세요.' };
        }

        const headless = typeof requestBody?.headless === 'boolean'
            ? requestBody.headless
            : Boolean(CONFIG.HEADLESS);

        const trendResult = await TrendManager.fetchTrends({
            date: dateInput || undefined,
            headless
        });
        const trendKeywords = Array.isArray(trendResult?.keywords) ? trendResult.keywords : [];
        if (trendKeywords.length === 0) {
            return {
                success: true,
                data: {
                    collectedCount: 0,
                    rawCollectedCount: 0,
                    date: trendResult?.date || null,
                    appendedCount: 0,
                    message: '수집된 트렌드가 없습니다.'
                }
            };
        }

        const verify = await License.verifyLicense();
        if (!verify.success) {
            Logger.error(`❌ [AUTO][Producer] 라이선스 검증 실패: ${verify.message}`);
            return { success: false, code: 'LICENSE_VERIFY_FAILED', message: verify.message };
        }

        const trendsWithDate = trendKeywords.map((item, index) => ({
            ...item,
            date: trendResult?.date || null,
            rowIndex: index
        }));

        try {
            const snapshot = getBlogAutoSettingsSnapshot();
            const settingsToUse = { ...snapshot, ...(requestBody?.settings || {}) };
            const mapResult = await processAndAppendTrendsToTopics(trendsWithDate, settingsToUse);

            const dupCount = Number(mapResult?.duplicateCount || 0);
            const reuseCount = Number(mapResult?.reuseBlockedCount || 0);
            const addedCount = Number(mapResult?.appendedCount || 0);
            recordUiActivity({
                category: 'collection',
                type: 'trends_collect_completed',
                title: '트렌드 수집 완료',
                detail: `수집 ${trendKeywords.length}건 · 토픽 추가 ${addedCount}건`
            });

            return {
                success: true,
                data: {
                    collectedCount: mapResult?.candidates || 0,
                    rawCollectedCount: trendKeywords.length,
                    appendedCount: addedCount,
                    duplicateCount: dupCount,
                    reuseBlockedCount: reuseCount,
                    date: trendResult?.date || null,
                    message: '트렌드 수집 및 토픽 직접 추가 완료'
                }
            };
        } catch (error) {
            Logger.error(`❌ [AUTO][Producer] trends->topics 직접 이관 실패: ${error.message}`);
            recordUiActivity({
                category: 'collection',
                type: 'trends_collect_failed',
                level: 'error',
                title: '트렌드 수집 실패',
                detail: error.message || '알 수 없는 오류'
            });
            return { success: false, code: 'TRENDS_DIRECT_APPEND_FAILED', message: `topics 직접 추가에 실패했습니다: ${error.message}` };
        }
    }

    async function executeTrendsToTopicsAction(requestBody = {}) {
        try {
            await ensureSheetsReadyForUi();
        } catch (error) {
            return { success: false, code: 'SHEETS_NOT_READY', message: `필수 시트 준비 실패: ${error.message}` };
        }

        const rowIndices = parseUniqueRowIndices(requestBody.rowIndices);
        if (rowIndices.length === 0) {
            return { success: false, code: 'INVALID_ROW_INDICES', message: '선택된 trends 행이 없습니다.' };
        }

        const trendsResult = await Utils.readGoogleSheetTrendsAll({ limit: 100000, offset: 0 });
        const allItems = Array.isArray(trendsResult.items) ? trendsResult.items : [];
        const byRowIndex = new Map(allItems.map((item) => [item.rowIndex, item]));
        const selected = rowIndices.map((index) => byRowIndex.get(index)).filter(Boolean);
        if (selected.length === 0) {
            return { success: false, code: 'TRENDS_NOT_FOUND', message: '선택된 trends 행을 찾지 못했습니다.' };
        }

        const autoSettings = getBlogAutoSettingsSnapshot();
        const autoImageGeneration = toBoolLike(
            autoSettings.PUBLISH_AUTO_IMAGE_GENERATION,
            publishAutoDefaults.imageGeneration
        );
        const keywordReuseGapDays = normalizeNonNegativeInt(
            autoSettings.BLOG_AUTO_KEYWORD_REUSE_GAP_DAYS,
            collectTrendsDefaults.reuseGapDays
        );

        const selectedBaseYmd = normalizeYmdToken(requestBody?.trendDate || requestBody?.date || '')
            || normalizeYmdToken(selected[0]?.date || '');
        const existingTopicsRes = await Utils.readGoogleSheetTopicsAll({ q: '', limit: 100000, offset: 0, sortBy: 'rowNumber', sortDir: 'desc' });
        const existingTopics = Array.isArray(existingTopicsRes.items) ? existingTopicsRes.items : [];
        const recentReuseKeySet = getRecentTopicKeys(existingTopics, keywordReuseGapDays, selectedBaseYmd);
        const inBatchKeySet = new Set();

        const topics = [];
        let reuseBlockedCount = 0;
        let duplicateCount = 0;

        for (const item of selected) {
            const subject = String(item.category || item.keyword || '').trim();
            const keyword = String(item.keyword || '').trim();
            if (!subject || !keyword) continue;

            const reuseKey = buildTopicReuseKey(subject, [keyword]);
            Logger.debug(`Checking Trend: ${subject} / ${keyword} -> key: ${reuseKey}`);

            if (keywordReuseGapDays > 0 && reuseKey && recentReuseKeySet.has(reuseKey)) {
                Logger.info(`🚫 중복 금지(Reuse Gap): ${subject} / ${keyword}`);
                reuseBlockedCount += 1;
                continue;
            }
            if (reuseKey && inBatchKeySet.has(reuseKey)) {
                Logger.info(`🚫 중복 금지(Batch): ${subject} / ${keyword}`);
                duplicateCount += 1;
                continue;
            }
            if (reuseKey) inBatchKeySet.add(reuseKey);

            topics.push({
                subject,
                keywords: [keyword],
                content_guide: {
                    additional_instructions: '',
                    reference_urls: []
                },
                use_external_ref: true,
                image_options: { generate: autoImageGeneration, count: 4 },
                source: 'auto-trends',
                trendDate: String(item.date || '').trim(),
                status: '대기'
            });
        }

        if (topics.length === 0) {
            return {
                success: false,
                code: 'EMPTY_TOPICS',
                message: reuseBlockedCount > 0 || duplicateCount > 0
                    ? '선택된 행이 모두 중복 또는 재사용 간격 정책으로 제외되었습니다.'
                    : '선택된 행에서 토픽 생성이 가능한 데이터가 없습니다.'
            };
        }

        const appendResult = await Utils.appendGoogleSheetTopics(topics, { defaultStatus: '대기' });
        if (!appendResult?.success) {
            return { success: false, code: 'TOPICS_APPEND_FAILED', message: appendResult?.message || 'topics 추가에 실패했습니다.' };
        }

        for (const rowIndex of rowIndices) {
            await Utils.updateGoogleSheetTrendStatus(rowIndex, '키워드 목록 추가 완료');
        }

        return {
            success: true,
            data: {
                requestedCount: rowIndices.length,
                appendedCount: topics.length,
                duplicateCount,
                reuseBlockedCount,
                rowIndices,
                message: 'trends 선택 항목을 topics에 추가했습니다.'
            }
        };
    }

    async function executeKeywordsToTopicsAction(requestBody = {}) {
        try {
            await ensureSheetsReadyForUi();
        } catch (error) {
            return { success: false, code: 'SHEETS_NOT_READY', message: `필수 시트 준비 실패: ${error.message}` };
        }

        const rowIndices = parseUniqueRowIndices(requestBody.rowIndices);
        if (rowIndices.length === 0) {
            return { success: false, code: 'INVALID_ROW_INDICES', message: '선택된 keywords 행이 없습니다.' };
        }

        const keywordsResult = await Utils.readGoogleSheetKeywordsAll({ limit: 100000, offset: 0 });
        const allItems = Array.isArray(keywordsResult.items) ? keywordsResult.items : [];
        const byRowIndex = new Map(allItems.map((item) => [item.rowIndex, item]));
        const selected = rowIndices.map((index) => byRowIndex.get(index)).filter(Boolean);
        if (selected.length === 0) {
            return { success: false, code: 'KEYWORDS_NOT_FOUND', message: '선택된 keywords 행을 찾지 못했습니다.' };
        }

        const topics = selected
            .map((item) => {
                const keyword = String(item.keyword || '').trim();
                return {
                    subject: keyword,
                    keywords: keyword ? [keyword] : [],
                    content_guide: {
                        additional_instructions: '',
                        reference_urls: []
                    },
                    use_external_ref: true,
                    image_options: { generate: false, count: 4 },
                    source: 'manual',
                    trendDate: '',
                    status: '대기'
                };
            })
            .filter((item) => item.subject);

        if (topics.length === 0) {
            return { success: false, code: 'EMPTY_TOPICS', message: '선택된 행에서 토픽 생성이 가능한 데이터가 없습니다.' };
        }

        const appendResult = await Utils.appendGoogleSheetTopics(topics, { defaultStatus: '대기' });
        if (!appendResult?.success) {
            return { success: false, code: 'TOPICS_APPEND_FAILED', message: appendResult?.message || 'topics 추가에 실패했습니다.' };
        }

        for (const rowIndex of rowIndices) {
            await Utils.updateGoogleSheetKeywordStatus(rowIndex, '연관검색어 조사 완료');
        }

        return {
            success: true,
            data: {
                requestedCount: rowIndices.length,
                appendedCount: topics.length,
                rowIndices,
                message: 'keywords 선택 항목을 topics에 추가했습니다.'
            }
        };
    }

    function waitMs(delay) {
        const ms = Math.max(0, Number(delay) || 0);
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    async function executeTrendCollectWithRetry(options = {}) {
        const date = String(options?.date || '').trim();
        const categories = options?.categories;
        const headless = options?.headless;
        const maxRetries = normalizeNonNegativeInt(options?.maxRetries, collectTrendsDefaults.trendsMaxRetries || 3);
        const retryWaitMs = normalizeNonNegativeInt(options?.retryWaitMs, collectTrendsDefaults.trendsRetryWaitMs || 300000);
        const maxAttempts = maxRetries + 1;
        Logger.info(`   ⏳ [AUTO] 트렌드 수집 시도 시작 (최대 ${maxAttempts}회 시도)`);
        let lastError = 'unknown';

        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            try {
                const trendsResult = await executeTrendCollectAction({
                    ...(date ? { date } : {}),
                    ...(categories !== undefined ? { categories } : {}),
                    ...(typeof headless === 'boolean' ? { headless } : {}),
                    settings: options?.settings
                });
                if (trendsResult?.success) {
                    return {
                        success: true,
                        data: trendsResult.data,
                        collected: Number(trendsResult?.data?.appendedCount || trendsResult?.data?.collectedCount || 0),
                        attempt,
                        maxAttempts
                    };
                }
                lastError = String(trendsResult?.message || trendsResult?.code || 'unknown');
            } catch (error) {
                lastError = String(error?.message || error || 'unknown');
            }

            if (attempt < maxAttempts) {
                Logger.warn(`⚠️ [AUTO] 트렌드 수집 실패 (${attempt}/${maxAttempts}): ${lastError}`);
                const waitMin = Math.max(1, Math.round(retryWaitMs / 60000));
                Logger.info(`   ⏳ [AUTO] ${waitMin}분 후 트렌드 수집을 재시도합니다...`);
                await waitMs(retryWaitMs);
            }
        }

        return {
            success: false,
            message: lastError,
            maxRetries
        };
    }

    return {
        executeKeywordsToTopicsAction,
        executeTrendCollectAction,
        executeTrendCollectWithRetry,
        executeTrendsToTopicsAction,
        filterAutoTopicCandidates,
        processAndAppendTrendsToTopics
    };
}

module.exports = {
    createTrendActionsRuntime
};
