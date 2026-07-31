const { createApiError } = require('../errors');

function createSessionLicenseService(deps = {}) {
    const {
        License,
        parseBoolQuery,
        toFeatureMap,
        checkNaverSessionForUi,
        logoutNaverSessionForUi,
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

        async upgradeLicense(requestBody = {}) {
            const targetPlan = String(requestBody?.targetPlan || 'free').trim().toLowerCase() || 'free';
            const email = String(requestBody?.email || '').trim();
            const result = await License.upgradeLicense(targetPlan, email);
            if (!result.success) {
                throw createApiError(400, 'LICENSE_UPGRADE_FAILED', result.message || '플랜 전환에 실패했습니다.');
            }
            return {
                planCode: result.planCode || targetPlan,
                planName: result.planDisplayName || result.planCode || targetPlan,
                remaining: result.remaining,
                features: toFeatureMap(result.features),
                message: result.message || '플랜 전환이 완료되었습니다.'
            };
        },

        async requestLicenseRegistration(requestBody = {}) {
            const email = String(requestBody?.email || '').trim();
            const result = await License.requestLicenseRegistration(email);
            if (!result.success) {
                throw createApiError(400, 'LICENSE_REGISTRATION_REQUEST_FAILED', result.message || '인증 코드 요청에 실패했습니다.');
            }
            return {
                email: result.email || email,
                ttlSeconds: result.ttlSeconds,
                expiresAt: result.expiresAt || '',
                message: result.message || '인증 코드가 발송되었습니다.'
            };
        },

        async verifyLicenseRegistration(requestBody = {}) {
            const email = String(requestBody?.email || '').trim();
            const code = String(requestBody?.code || '').trim();
            const result = await License.verifyLicenseRegistration(email, code);
            if (!result.success) {
                throw createApiError(400, 'LICENSE_REGISTRATION_VERIFY_FAILED', result.message || '이메일 인증에 실패했습니다.');
            }
            return {
                planCode: result.planCode || '',
                planName: result.planDisplayName || result.planCode || '',
                remaining: result.remaining,
                features: toFeatureMap(result.features),
                message: result.message || '이메일 인증이 완료되었습니다.'
            };
        },

        async getNaverSession({ forceRaw } = {}) {
            const session = await checkNaverSessionForUi({
                forceRefresh: parseBoolQuery(forceRaw)
            });
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

        async logoutNaverSession() {
            const result = await logoutNaverSessionForUi();
            return {
                loggedOut: true,
                removed: Boolean(result?.removed),
                message: 'BlogGenius에 저장된 네이버 로그인 정보를 삭제했습니다.'
            };
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
