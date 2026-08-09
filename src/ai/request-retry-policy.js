const RATE_LIMIT_FALLBACK_MS = 15000;
const MAX_RETRY_DELAY_MS = 60000;

function getHttpStatus(error) {
    const status = Number(error?.response?.status || error?.status || 0);
    return Number.isFinite(status) ? status : 0;
}

function parseRetryAfterMs(error, nowMs = Date.now()) {
    const raw = error?.response?.headers?.['retry-after'];
    if (raw !== undefined && raw !== null && raw !== '') {
        const seconds = Number(raw);
        if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
        const retryAt = Date.parse(String(raw));
        if (Number.isFinite(retryAt)) return Math.max(0, retryAt - nowMs);
    }

    const responseData = error?.response?.data;
    const retryInfo = Array.isArray(responseData?.error?.details)
        ? responseData.error.details.find((detail) => detail?.retryDelay)
        : null;
    const retryDelayText = String(retryInfo?.retryDelay || '').trim();
    const retryDelayMatch = retryDelayText.match(/^([\d.]+)s$/i);
    if (retryDelayMatch) {
        const seconds = Number(retryDelayMatch[1]);
        if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000) + 1000;
    }

    const message = typeof responseData === 'string'
        ? responseData
        : JSON.stringify(responseData || {});
    const messageMatch = message.match(/(?:please\s+)?retry\s+(?:in|after)\s+([\d.]+)\s*(?:s|sec|secs|second|seconds)\b/i);
    if (!messageMatch) return 0;
    const seconds = Number(messageMatch[1]);
    return Number.isFinite(seconds) && seconds >= 0
        ? Math.ceil(seconds * 1000) + 1000
        : 0;
}

function resolveAiRetryDecision(error, attempt = 1) {
    const status = getHttpStatus(error);
    const isRateLimited = status === 429;
    const retryable = status === 0
        || status === 408
        || status === 425
        || isRateLimited
        || status >= 500;
    if (!retryable) return { retryable: false, isRateLimited, delayMs: 0, status };

    const retryAfterMs = isRateLimited ? parseRetryAfterMs(error) : 0;
    const fallbackMs = isRateLimited
        ? RATE_LIMIT_FALLBACK_MS * Math.pow(2, Math.max(0, attempt - 1))
        : 1000 * Math.pow(2, Math.max(0, attempt - 1));
    return {
        retryable: true,
        isRateLimited,
        delayMs: Math.min(MAX_RETRY_DELAY_MS, Math.max(retryAfterMs, fallbackMs)),
        status
    };
}

module.exports = {
    MAX_RETRY_DELAY_MS,
    RATE_LIMIT_FALLBACK_MS,
    getHttpStatus,
    parseRetryAfterMs,
    resolveAiRetryDecision
};
