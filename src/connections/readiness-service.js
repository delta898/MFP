const crypto = require('crypto');

function createConnectionReadinessService(deps = {}) {
    const {
        CONFIG = {},
        checkNaverSessionForUi,
        WordPressClient,
        getWordPressVerification = () => null,
        recordWordPressVerification = () => null,
        wordpressCheckTtlMs = 120000,
        now = () => Date.now()
    } = deps;

    let wordpressCheckInFlight = null;
    let wordpressCheckSignature = '';

    function getWordPressConfig() {
        return {
            url: String(CONFIG.WORDPRESS_URL || '').trim(),
            userId: String(CONFIG.WORDPRESS_USER_ID || '').trim(),
            appPassword: String(CONFIG.WORDPRESS_APP_PASSWORD || '').trim()
        };
    }

    function isWordPressConfigured(config = {}) {
        return Boolean(config.url && config.userId && config.appPassword);
    }

    function getWordPressRequestKey(config = {}) {
        const value = [config.url.replace(/\/+$/, '').toLowerCase(), config.userId.toLowerCase(), config.appPassword]
            .join('\u0000');
        return crypto.createHash('sha256').update(value).digest('hex');
    }

    function isFreshVerification(state = {}) {
        const checkedAtMs = new Date(state.checked_at || '').getTime();
        if (!Number.isFinite(checkedAtMs)) return false;
        return (now() - checkedAtMs) < wordpressCheckTtlMs;
    }

    async function checkWordPress({ force = false } = {}) {
        const config = getWordPressConfig();
        if (!isWordPressConfigured(config)) {
            return { status: 'not_configured', configured: false, connected: false };
        }

        const cached = getWordPressVerification(config);
        if (!force && cached && isFreshVerification(cached)) {
            return { ...cached, cached: true };
        }

        const requestKey = getWordPressRequestKey(config);
        if (wordpressCheckInFlight && wordpressCheckSignature === requestKey) {
            return wordpressCheckInFlight;
        }

        const client = new WordPressClient(config);
        wordpressCheckSignature = requestKey;
        wordpressCheckInFlight = (async () => {
            const result = await client.verifyAuth();
            return recordWordPressVerification(config, result) || {
                status: result?.success === true ? 'connected' : 'failed',
                connected: result?.connected === true,
                message: String(result?.message || '').trim(),
                checked_at: new Date(now()).toISOString()
            };
        })();

        try {
            return await wordpressCheckInFlight;
        } finally {
            if (wordpressCheckSignature === requestKey) {
                wordpressCheckInFlight = null;
                wordpressCheckSignature = '';
            }
        }
    }

    async function getReadiness({ force = false } = {}) {
        const [naverResult, wordpressResult] = await Promise.allSettled([
            typeof checkNaverSessionForUi === 'function'
                ? checkNaverSessionForUi({ forceRefresh: force })
                : Promise.resolve({ ok: false, reason: 'not_checked' }),
            checkWordPress({ force })
        ]);

        const naver = naverResult.status === 'fulfilled'
            ? naverResult.value
            : { ok: false, reason: 'check_failed', message: String(naverResult.reason?.message || naverResult.reason || '') };
        const wordpress = wordpressResult.status === 'fulfilled'
            ? wordpressResult.value
            : { status: 'failed', connected: false, message: String(wordpressResult.reason?.message || wordpressResult.reason || '') };

        return { naver, wordpress };
    }

    return {
        getReadiness,
        checkWordPress
    };
}

module.exports = {
    createConnectionReadinessService
};
