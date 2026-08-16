function parseExpiry(value) {
    const timestamp = Date.parse(String(value || ''));
    return Number.isFinite(timestamp) ? timestamp : 0;
}

function createAccessTokenCache(options = {}) {
    const issueToken = options.issueToken;
    const now = typeof options.now === 'function' ? options.now : () => Date.now();
    const refreshSkewMs = Math.max(0, Number(options.refreshSkewMs) || 60000);
    const defaultErrorCode = String(options.defaultErrorCode || 'TRENDS_TOKEN_ISSUE_FAILED');
    const defaultErrorMessage = String(options.defaultErrorMessage || '트렌드 접근 토큰을 발급하지 못했습니다.');
    if (typeof issueToken !== 'function') {
        throw new Error('issueToken is required');
    }

    let cached = null;
    let pending = null;

    function isUsable(entry) {
        return Boolean(
            entry?.accessToken
            && entry.expiresAtMs > 0
            && (now() + refreshSkewMs) < entry.expiresAtMs
        );
    }

    async function loadToken(forceRefresh = false) {
        if (!forceRefresh && isUsable(cached)) return cached.accessToken;
        if (pending) return pending;

        pending = (async () => {
            const result = await issueToken();
            const accessToken = String(result?.accessToken || '').trim();
            const expiresAtMs = parseExpiry(result?.expiresAt);
            if (!result?.success || !accessToken || expiresAtMs <= now()) {
                const error = new Error(result?.message || defaultErrorMessage);
                error.code = result?.code || defaultErrorCode;
                throw error;
            }
            cached = { accessToken, expiresAtMs };
            return accessToken;
        })();

        try {
            return await pending;
        } finally {
            pending = null;
        }
    }

    return {
        getToken() {
            return loadToken(false);
        },
        refreshToken() {
            cached = null;
            return loadToken(true);
        },
        clear() {
            cached = null;
        }
    };
}

module.exports = {
    createAccessTokenCache,
    parseExpiry
};
