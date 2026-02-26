class ApiValidationError extends Error {
    constructor(code, message, statusCode = 400) {
        super(message);
        this.name = 'ApiValidationError';
        this.code = code || 'VALIDATION_ERROR';
        this.statusCode = Number.isInteger(statusCode) ? statusCode : 400;
    }
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseBooleanLikeStrict(value, { fallback = false, allowEmpty = true } = {}) {
    if (value === undefined || value === null) return fallback;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') {
        if (value === 1) return true;
        if (value === 0) return false;
        throw new ApiValidationError('INVALID_BOOLEAN', '불리언 값은 true/false(또는 1/0)만 허용됩니다.');
    }
    const text = String(value).trim().toLowerCase();
    if (!text && allowEmpty) return fallback;
    if (['true', '1', 'yes', 'y', 'on'].includes(text)) return true;
    if (['false', '0', 'no', 'n', 'off'].includes(text)) return false;
    throw new ApiValidationError('INVALID_BOOLEAN', '불리언 값은 true/false(또는 yes/no, 1/0)만 허용됩니다.');
}

function validateBlogAutoManualRunPayload(payload, normalizeYmdToken) {
    if (!isPlainObject(payload)) {
        throw new ApiValidationError('INVALID_REQUEST_BODY', '요청 본문은 JSON 객체여야 합니다.');
    }

    const rawDate = payload?.trendDate ?? payload?.date ?? '';
    const rawDateText = String(rawDate || '').trim();
    const trendDate = normalizeYmdToken(rawDateText);
    if (rawDateText && !trendDate) {
        throw new ApiValidationError(
            'INVALID_TREND_DATE',
            '트렌드 일자 형식이 올바르지 않습니다. (허용: YYYY-MM-DD, YYYY.MM.DD, YYYYMMDD)'
        );
    }

    const skipTrends = parseBooleanLikeStrict(payload?.skipTrends, { fallback: false });
    const settingsOverridesRaw = payload?.settingsOverrides;
    const settingsOverrides = settingsOverridesRaw === undefined
        ? {}
        : (isPlainObject(settingsOverridesRaw) ? settingsOverridesRaw : null);
    if (settingsOverrides === null) {
        throw new ApiValidationError('INVALID_SETTINGS_OVERRIDES', 'settingsOverrides는 JSON 객체여야 합니다.');
    }

    return {
        trendDate,
        skipTrends,
        settingsOverrides
    };
}

function parseForceQuery(value) {
    return parseBooleanLikeStrict(value, { fallback: false, allowEmpty: true });
}

function isValidationError(err) {
    return err instanceof ApiValidationError;
}

module.exports = {
    ApiValidationError,
    isPlainObject,
    parseBooleanLikeStrict,
    parseForceQuery,
    validateBlogAutoManualRunPayload,
    isValidationError
};
