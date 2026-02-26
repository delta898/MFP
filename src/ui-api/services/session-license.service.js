const { createApiError } = require('../errors');

function createSessionLicenseService(deps = {}) {
    const {
        License,
        parseBoolQuery,
        toFeatureMap,
        getFeatureInt,
        resolveMaxBlogPostsPerRun,
        resolveMaxShoppingPostsPerRun,
        checkNaverSessionForUi,
        getNaverLoginStatus,
        getNaverLoginState,
        setNaverLoginState,
        runNaverLoginFlowForUi
    } = deps;

    return {
        async getLicenseStatus({ quietRaw }) {
            const quiet = parseBoolQuery(quietRaw);
            const status = await License.checkLicenseStatus({ quiet });
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
            const features = toFeatureMap(status.features);
            const maxBlogPosts = getFeatureInt(features, 'max_blog_posts_per_run', resolveMaxBlogPostsPerRun());
            const maxShoppingPosts = getFeatureInt(features, 'max_shopping_posts_per_run', resolveMaxShoppingPostsPerRun());

            return {
                planCode: status.planCode || '',
                planName: status.planDisplayName || status.planCode || '',
                features,
                limits: {
                    max_blog_posts_per_run: maxBlogPosts,
                    max_shopping_posts_per_run: maxShoppingPosts
                }
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
        }
    };
}

module.exports = {
    createSessionLicenseService
};

