function createAutomationPolicyRuntime(deps = {}) {
    const {
        CONFIG,
        Logger,
        toBoolLike,
        normalizeIntegerOrBlank,
        normalizeNonNegativeInt,
        normalizePositiveInt,
        collectTrendsDefaults,
        publishAutoDefaults,
        shoppingAutoDefaults
    } = deps;

    function normalizeTimeHHmm(input, fallback = '07:30') {
        const raw = String(input || '').trim();
        const match = raw.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
        if (!match) return fallback;
        return `${match[1]}:${match[2]}`;
    }

    function parseTimeToMinutes(input) {
        const normalized = normalizeTimeHHmm(input, '');
        if (!normalized) return null;
        const [hour, minute] = normalized.split(':').map((value) => parseInt(value, 10));
        if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
        return (hour * 60) + minute;
    }

    function isWithinRuntimeTimeWindow(start, end, referenceDate = new Date()) {
        const startMin = parseTimeToMinutes(start);
        const endMin = parseTimeToMinutes(end);
        if (startMin === null || endMin === null) return true;

        const date = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
        if (!Number.isFinite(date.getTime())) return true;

        const currentMin = (date.getHours() * 60) + date.getMinutes();
        if (startMin <= endMin) {
            return currentMin >= startMin && currentMin <= endMin;
        }
        return currentMin >= startMin || currentMin <= endMin;
    }

    function getNextTimeWindowStart(referenceDate, start, end) {
        const startMin = parseTimeToMinutes(start);
        const endMin = parseTimeToMinutes(end);
        const date = referenceDate instanceof Date ? new Date(referenceDate.getTime()) : new Date(referenceDate);
        if (!Number.isFinite(date.getTime()) || startMin === null || endMin === null) return date;
        if (isWithinRuntimeTimeWindow(start, end, date)) return date;

        const next = new Date(date);
        next.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);

        if (startMin <= endMin) {
            const currentMin = (date.getHours() * 60) + date.getMinutes();
            if (currentMin > endMin) next.setDate(next.getDate() + 1);
        }

        return next;
    }

    function computeNextWindowedRunAt({
        delayMs,
        intervalMs,
        startTime,
        endTime,
        baseTimeMs = Date.now(),
        preferWindowStartIfBaseOutside = false
    }) {
        const baseDelayMs = Number.isFinite(delayMs)
            ? Math.max(500, Number(delayMs))
            : Math.max(500, Number(intervalMs) || 500);
        const baseDate = new Date(baseTimeMs);
        const candidateAt = new Date(baseTimeMs + baseDelayMs);
        const baseOutsideWindow = !isWithinRuntimeTimeWindow(startTime, endTime, baseDate);
        const runAt = preferWindowStartIfBaseOutside && baseOutsideWindow
            ? getNextTimeWindowStart(baseDate, startTime, endTime)
            : getNextTimeWindowStart(candidateAt, startTime, endTime);
        return {
            runAt,
            candidateAt,
            adjustedByWindow: runAt.getTime() !== candidateAt.getTime()
        };
    }

    function parseVariationMeta(raw) {
        const text = String(raw || '').trim();
        const lower = text.toLowerCase();
        if (!text || text === '-') return { kind: 'dash', number: null, raw: text };
        if (lower === 'new') return { kind: 'new', number: null, raw: text };
        const cleaned = text.replace(/[^\d-]/g, '');
        if (/\d/.test(cleaned)) {
            const parsed = parseInt(cleaned, 10);
            if (Number.isInteger(parsed)) return { kind: 'number', number: parsed, raw: text };
        }
        return { kind: 'other', number: null, raw: text };
    }

    function matchesVariationFilter(rawVariation, settings = {}) {
        const includeNew = toBoolLike(settings.COLLECT_TRENDS_FILTER_INCLUDE_NEW, false);
        const includeDash = toBoolLike(settings.COLLECT_TRENDS_FILTER_INCLUDE_DASH, false);
        const includeNumber = toBoolLike(settings.COLLECT_TRENDS_FILTER_INCLUDE_NUMBER, true);
        const threshold = normalizeIntegerOrBlank(settings.COLLECT_TRENDS_FILTER_MIN_INCR, '');
        const useNumber = includeNumber && Number.isInteger(threshold);
        const hasFilter = includeNew || includeDash || useNumber;
        if (!hasFilter) return true;

        const meta = parseVariationMeta(rawVariation);
        if (includeNew && meta.kind === 'new') return true;
        if (includeDash && meta.kind === 'dash') return true;
        if (useNumber && meta.kind === 'number' && Number(meta.number) >= Number(threshold)) return true;
        return false;
    }

    function normalizeYmdToken(value) {
        const raw = String(value || '').trim();
        if (!raw) return '';

        const compact = raw.match(/(\d{4})(\d{2})(\d{2})/);
        if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;

        const dashed = raw.match(/(\d{4})[.\-/\s]+(\d{1,2})[.\-/\s]+(\d{1,2})/);
        if (dashed) {
            const month = String(parseInt(dashed[2], 10)).padStart(2, '0');
            const day = String(parseInt(dashed[3], 10)).padStart(2, '0');
            return `${dashed[1]}-${month}-${day}`;
        }
        return '';
    }

    function ymdToUtcTimestamp(ymd) {
        const normalized = normalizeYmdToken(ymd);
        if (!normalized) return NaN;
        const [year, month, day] = normalized.split('-').map((value) => parseInt(value, 10));
        if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return NaN;
        return Date.UTC(year, month - 1, day);
    }

    function isYmdWithinRecentDays(historyYmd, baseYmd, gapDays) {
        const gap = normalizeNonNegativeInt(gapDays, 0);
        if (gap <= 0) return false;
        const historyTs = ymdToUtcTimestamp(historyYmd);
        const baseTs = ymdToUtcTimestamp(baseYmd);
        if (!Number.isFinite(historyTs) || !Number.isFinite(baseTs)) return false;
        const diffDays = Math.floor((baseTs - historyTs) / 86400000);
        return diffDays >= 0 && diffDays < gap;
    }

    function buildTopicReuseKey(subject, keywords) {
        const keywordText = Array.isArray(keywords) ? keywords.join(', ') : String(keywords || '');
        const firstKeyword = keywordText.split(',').map((value) => String(value || '').trim()).find(Boolean);
        const basis = firstKeyword || String(subject || '').trim();
        return String(basis || '').trim().toLowerCase();
    }

    function getRecentTopicKeys(existingTopics, gapDays, baseYmdInput = null) {
        const reuseKeySet = new Set();
        const topics = Array.isArray(existingTopics) ? existingTopics : [];
        const baseYmd = normalizeYmdToken(baseYmdInput) || getSeoulTodayYmd();
        Logger.info(`🔍 중복 체크 시작: 기준일(TrendDate)=${baseYmd}, 간격=${gapDays}일, 기존 토픽=${topics.length}건`);
        if (!gapDays || gapDays <= 0 || !baseYmd || topics.length === 0) return reuseKeySet;

        for (const item of topics) {
            const key = buildTopicReuseKey(item?.subject, item?.keywords);
            if (!key) continue;
            const historyYmd = normalizeYmdToken(item?.trend_date || item?.trendDate || item?.created_at || item?.addedAt || item?.published_at || item?.publishedAt);
            if (!historyYmd) continue;
            if (isYmdWithinRecentDays(historyYmd, baseYmd, gapDays)) {
                reuseKeySet.add(key);
                Logger.debug(`   ✅ 중복 금지 목록(Set) 추가: ${key} (${historyYmd})`);
            }
        }
        return reuseKeySet;
    }

    function getSeoulTodayYmd() {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Seoul',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).formatToParts(new Date());
        const year = parts.find((part) => part.type === 'year')?.value || '';
        const month = parts.find((part) => part.type === 'month')?.value || '';
        const day = parts.find((part) => part.type === 'day')?.value || '';
        return year && month && day ? `${year}-${month}-${day}` : '';
    }

    function matchesAnyToken(text, tokens = []) {
        const haystack = String(text || '').toLowerCase();
        if (!haystack || !Array.isArray(tokens) || tokens.length === 0) return false;
        return tokens.some((token) => haystack.includes(String(token || '').toLowerCase()));
    }

    function normalizeCollectTrendsSettings(input = {}) {
        const categories = String(
            input.COLLECT_TRENDS_CATEGORIES
            ?? input.BLOG_AUTO_CATEGORIES
            ?? CONFIG.COLLECT_TRENDS_CATEGORIES
            ?? CONFIG.BLOG_AUTO_CATEGORIES
            ?? collectTrendsDefaults.categories
        ).trim();
        const enabled = toBoolLike(
            input.COLLECT_TRENDS_ENABLED,
            toBoolLike(CONFIG.COLLECT_TRENDS_ENABLED, collectTrendsDefaults.enabled)
        );
        const time = normalizeTimeHHmm(
            input.COLLECT_TRENDS_TIME,
            normalizeTimeHHmm(CONFIG.COLLECT_TRENDS_TIME, collectTrendsDefaults.time)
        );
        const reuseGapDays = normalizeNonNegativeInt(
            input.COLLECT_TRENDS_REUSE_GAP_DAYS ?? CONFIG.COLLECT_TRENDS_REUSE_GAP_DAYS ?? collectTrendsDefaults.reuseGapDays,
            collectTrendsDefaults.reuseGapDays
        );
        const filterMinIncr = normalizeIntegerOrBlank(
            input.COLLECT_TRENDS_FILTER_MIN_INCR ?? CONFIG.COLLECT_TRENDS_FILTER_MIN_INCR ?? collectTrendsDefaults.filterMinIncr,
            collectTrendsDefaults.filterMinIncr
        );
        const filterIncludeNew = toBoolLike(
            input.COLLECT_TRENDS_FILTER_INCLUDE_NEW,
            toBoolLike(CONFIG.COLLECT_TRENDS_FILTER_INCLUDE_NEW, collectTrendsDefaults.filterIncludeNew)
        );
        const filterIncludeDash = toBoolLike(
            input.COLLECT_TRENDS_FILTER_INCLUDE_DASH,
            toBoolLike(CONFIG.COLLECT_TRENDS_FILTER_INCLUDE_DASH, collectTrendsDefaults.filterIncludeDash)
        );
        const filterIncludeNumber = toBoolLike(
            input.COLLECT_TRENDS_FILTER_INCLUDE_NUMBER,
            toBoolLike(CONFIG.COLLECT_TRENDS_FILTER_INCLUDE_NUMBER, collectTrendsDefaults.filterIncludeNumber)
        );
        const filterType = String(
            input.COLLECT_TRENDS_FILTER_TYPE ?? CONFIG.COLLECT_TRENDS_FILTER_TYPE ?? collectTrendsDefaults.filterType
        ).trim();
        const filterTopN = normalizeIntegerOrBlank(
            input.COLLECT_TRENDS_FILTER_TOP_N ?? CONFIG.COLLECT_TRENDS_FILTER_TOP_N ?? collectTrendsDefaults.filterTopN,
            collectTrendsDefaults.filterTopN
        );

        return {
            COLLECT_TRENDS_ENABLED: enabled,
            COLLECT_TRENDS_CATEGORIES: categories,
            BLOG_AUTO_CATEGORIES: categories,
            COLLECT_TRENDS_NAVER_CATEGORY: String(input.COLLECT_TRENDS_NAVER_CATEGORY || CONFIG.COLLECT_TRENDS_NAVER_CATEGORY || '').trim(),
            COLLECT_TRENDS_WP_CATEGORY: String(input.COLLECT_TRENDS_WP_CATEGORY || CONFIG.COLLECT_TRENDS_WP_CATEGORY || '').trim(),
            COLLECT_TRENDS_TIME: time,
            COLLECT_TRENDS_REUSE_GAP_DAYS: reuseGapDays,
            COLLECT_TRENDS_FILTER_MIN_INCR: filterMinIncr,
            COLLECT_TRENDS_FILTER_INCLUDE_NEW: filterIncludeNew,
            COLLECT_TRENDS_FILTER_INCLUDE_DASH: filterIncludeDash,
            COLLECT_TRENDS_FILTER_INCLUDE_NUMBER: filterIncludeNumber,
            COLLECT_TRENDS_FILTER_TYPE: filterType,
            COLLECT_TRENDS_FILTER_TOP_N: filterTopN
        };
    }

    function normalizePublishAutoSettings(input = {}) {
        const enabled = toBoolLike(
            input.PUBLISH_AUTO_ENABLED,
            toBoolLike(CONFIG.PUBLISH_AUTO_ENABLED, publishAutoDefaults.enabled)
        );
        const intervalMin = normalizeNonNegativeInt(
            input.PUBLISH_AUTO_INTERVAL_MIN ?? CONFIG.PUBLISH_AUTO_INTERVAL_MIN ?? publishAutoDefaults.intervalMin,
            publishAutoDefaults.intervalMin
        );
        const batchSize = normalizePositiveInt(
            input.PUBLISH_AUTO_BATCH_SIZE ?? CONFIG.PUBLISH_AUTO_BATCH_SIZE ?? publishAutoDefaults.batchSize,
            publishAutoDefaults.batchSize
        );
        const postStatus = String(
            input.PUBLISH_AUTO_POST_STATUS ?? CONFIG.PUBLISH_AUTO_POST_STATUS ?? publishAutoDefaults.postStatus
        ).trim().toLowerCase() === 'draft' ? 'draft' : 'publish';
        const notifyEnabled = toBoolLike(
            input.PUBLISH_AUTO_NOTIFY_ENABLED,
            toBoolLike(CONFIG.PUBLISH_AUTO_NOTIFY_ENABLED, publishAutoDefaults.notifyEnabled)
        );
        const targetChannels = input.PUBLISH_AUTO_TARGET_CHANNELS
            ?? CONFIG.PUBLISH_AUTO_TARGET_CHANNELS
            ?? publishAutoDefaults.targetChannels;
        const targetChannelsArray = Array.isArray(targetChannels)
            ? targetChannels
            : String(targetChannels).split(',').map((value) => value.trim()).filter(Boolean);
        const headless = toBoolLike(
            input.PUBLISH_AUTO_HEADLESS ?? CONFIG.PUBLISH_AUTO_HEADLESS,
            publishAutoDefaults.headless
        );
        const startTime = normalizeTimeHHmm(
            input.PUBLISH_AUTO_START_TIME ?? CONFIG.PUBLISH_AUTO_START_TIME,
            publishAutoDefaults.startTime
        );
        const endTime = normalizeTimeHHmm(
            input.PUBLISH_AUTO_END_TIME ?? CONFIG.PUBLISH_AUTO_END_TIME,
            publishAutoDefaults.endTime
        );

        return {
            PUBLISH_AUTO_ENABLED: enabled,
            PUBLISH_AUTO_INTERVAL_MIN: intervalMin,
            PUBLISH_AUTO_BATCH_SIZE: batchSize,
            PUBLISH_AUTO_POST_STATUS: postStatus,
            PUBLISH_AUTO_NOTIFY_ENABLED: notifyEnabled,
            PUBLISH_AUTO_TARGET_CHANNELS: targetChannelsArray,
            PUBLISH_AUTO_HEADLESS: headless,
            PUBLISH_AUTO_START_TIME: startTime,
            PUBLISH_AUTO_END_TIME: endTime
        };
    }

    function normalizeBlogAutoSettings(input = {}) {
        return {
            ...normalizeCollectTrendsSettings(input),
            ...normalizePublishAutoSettings(input)
        };
    }

    function normalizeShoppingAutoSettings(input = {}) {
        const enabled = toBoolLike(
            input.SHOPPING_PUBLISH_AUTO_ENABLED ?? input.SHOPPING_AUTO_MODE,
            toBoolLike(CONFIG.SHOPPING_PUBLISH_AUTO_ENABLED ?? CONFIG.SHOPPING_AUTO_MODE, shoppingAutoDefaults.mode)
        );
        const interval = normalizeNonNegativeInt(
            input.SHOPPING_PUBLISH_AUTO_INTERVAL_MIN ?? CONFIG.SHOPPING_PUBLISH_AUTO_INTERVAL_MIN,
            publishAutoDefaults.intervalMin
        );
        const batchSize = normalizePositiveInt(
            input.SHOPPING_PUBLISH_AUTO_BATCH_SIZE
            ?? input.SHOPPING_AUTO_DAILY_POSTS
            ?? CONFIG.SHOPPING_PUBLISH_AUTO_BATCH_SIZE
            ?? CONFIG.SHOPPING_AUTO_DAILY_POSTS,
            publishAutoDefaults.batchSize
        );
        const headless = toBoolLike(
            input.SHOPPING_PUBLISH_AUTO_HEADLESS ?? input.SHOPPING_AUTO_HEADLESS,
            toBoolLike(CONFIG.SHOPPING_PUBLISH_AUTO_HEADLESS ?? CONFIG.SHOPPING_AUTO_HEADLESS ?? CONFIG.HEADLESS, publishAutoDefaults.headless)
        );
        const targets = input.SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS
            ?? CONFIG.SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS
            ?? publishAutoDefaults.targetChannels;
        const targetsArray = Array.isArray(targets)
            ? targets
            : String(targets).split(',').map((value) => value.trim()).filter(Boolean);
        const notifyEnabled = toBoolLike(
            input.SHOPPING_PUBLISH_AUTO_NOTIFY_ENABLED ?? input.SHOPPING_AUTO_NOTIFY_ENABLED,
            toBoolLike(CONFIG.SHOPPING_PUBLISH_AUTO_NOTIFY_ENABLED ?? CONFIG.SHOPPING_AUTO_NOTIFY_ENABLED, shoppingAutoDefaults.notifyEnabled)
        );
        const startTime = normalizeTimeHHmm(
            input.SHOPPING_PUBLISH_AUTO_START_TIME ?? CONFIG.SHOPPING_PUBLISH_AUTO_START_TIME,
            publishAutoDefaults.startTime
        );
        const endTime = normalizeTimeHHmm(
            input.SHOPPING_PUBLISH_AUTO_END_TIME ?? CONFIG.SHOPPING_PUBLISH_AUTO_END_TIME,
            publishAutoDefaults.endTime
        );
        const legacyTime = normalizeTimeHHmm(
            input.SHOPPING_AUTO_TIME ?? CONFIG.SHOPPING_AUTO_TIME,
            shoppingAutoDefaults.time
        );

        return {
            SHOPPING_PUBLISH_AUTO_ENABLED: enabled,
            SHOPPING_PUBLISH_AUTO_INTERVAL_MIN: interval,
            SHOPPING_PUBLISH_AUTO_BATCH_SIZE: batchSize,
            SHOPPING_PUBLISH_AUTO_HEADLESS: headless,
            SHOPPING_PUBLISH_AUTO_TARGET_CHANNELS: targetsArray,
            SHOPPING_PUBLISH_AUTO_NOTIFY_ENABLED: notifyEnabled,
            SHOPPING_PUBLISH_AUTO_START_TIME: startTime,
            SHOPPING_PUBLISH_AUTO_END_TIME: endTime,
            SHOPPING_AUTO_MODE: enabled,
            SHOPPING_AUTO_DAILY_POSTS: batchSize,
            SHOPPING_AUTO_HEADLESS: headless,
            SHOPPING_AUTO_NOTIFY_ENABLED: notifyEnabled,
            SHOPPING_AUTO_TIME: legacyTime
        };
    }

    return {
        normalizeTimeHHmm,
        parseTimeToMinutes,
        isWithinRuntimeTimeWindow,
        getNextTimeWindowStart,
        computeNextWindowedRunAt,
        parseVariationMeta,
        matchesVariationFilter,
        normalizeYmdToken,
        ymdToUtcTimestamp,
        isYmdWithinRecentDays,
        buildTopicReuseKey,
        getRecentTopicKeys,
        getSeoulTodayYmd,
        matchesAnyToken,
        normalizeCollectTrendsSettings,
        normalizePublishAutoSettings,
        normalizeBlogAutoSettings,
        normalizeShoppingAutoSettings
    };
}

module.exports = {
    createAutomationPolicyRuntime
};
