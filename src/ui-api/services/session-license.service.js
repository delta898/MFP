const { createApiError } = require('../errors');

function createSessionLicenseService(deps = {}) {
    const {
        License,
        parseBoolQuery,
        toFeatureMap,
        checkNaverSessionForUi,
        getNaverLoginStatus,
        getNaverLoginState,
        setNaverLoginState,
        runNaverLoginFlowForUi,
        WordPressClient,
        CONFIG
    } = deps;

    return {
        async getLicenseStatus({ quietRaw }) {
            const quiet = parseBoolQuery(quietRaw);
            const status = await License.checkLicenseStatus({ quiet, force: true });
            if (!status.success) {
                throw createApiError(400, 'LICENSE_STATUS_FAILED', status.message);
            }
            return {
                planCode: status.planCode || '',
                planName: status.planDisplayName || status.planCode || '',
                createdAt: status.createdAt || '',
                usageLimit: status.usageLimit,
                usageCount: status.usageCount,
                remaining: status.remaining,
                features: toFeatureMap(status.features)
            };
        },

        async getCapabilities({ quietRaw }) {
            const quiet = parseBoolQuery(quietRaw);
            const status = await License.checkLicenseStatus({ quiet });
            if (!status.success) {
                throw createApiError(400, 'CAPABILITY_RESOLVE_FAILED', status.message);
            }
            return {
                planCode: status.planCode || '',
                planName: status.planDisplayName || status.planCode || '',
                features: toFeatureMap(status.features)
            };
        },

        async getNaverSession() {
            const session = await checkNaverSessionForUi();
            return {
                valid: Boolean(session.ok),
                reason: session.reason || '',
                message: session.message || '',
                checkedAt: new Date().toISOString()
            };
        },

        async getNaverLoginStatus() {
            return getNaverLoginStatus();
        },

        async startNaverLogin() {
            const state = getNaverLoginState();
            if (state.status === 'running') {
                throw createApiError(409, 'NAVER_LOGIN_ALREADY_RUNNING', '이미 로그인 진행 중입니다. 브라우저 창을 확인해 주세요.');
            }

            setNaverLoginState({
                status: 'running',
                message: '로그인 프로세스를 시작합니다...',
                startedAt: new Date().toISOString(),
                finishedAt: null,
                detectedBy: '',
                error: ''
            });

            runNaverLoginFlowForUi().catch((e) => {
                setNaverLoginState({
                    status: 'failed',
                    message: '로그인 실패',
                    finishedAt: new Date().toISOString(),
                    error: String(e?.message || 'unknown error')
                });
            });

            return getNaverLoginStatus();
        },

        async verifyWordPressAuth(requestBody = {}) {
            const url = String(requestBody.wordpressUrl || CONFIG.WORDPRESS_URL || '').trim();
            const userId = String(requestBody.wordpressUserId || CONFIG.WORDPRESS_USER_ID || '').trim();
            const appPassword = String(requestBody.wordpressAppPassword || CONFIG.WORDPRESS_APP_PASSWORD || '').trim();
            const wpClient = new WordPressClient({
                url,
                userId,
                appPassword
            });
            return await wpClient.verifyAuth();
        }
    };
}

module.exports = {
    createSessionLicenseService
};
