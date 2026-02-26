const { ensureMethod, withError } = require('./route-common');

function createSessionLicenseRouteHandler(deps = {}) {
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
        runNaverLoginFlowForUi,
        sendSuccess,
        sendError,
        Logger
    } = deps;

    return async function tryHandleSessionLicenseRoute(ctx = {}) {
        const { requestId, method, pathname, searchParams, res } = ctx;

        if (pathname === '/api/v1/license/status') {
            if (!ensureMethod({ method, allowed: 'GET', sendError, res, requestId })) return true;
            return withError(
                { sendError, res, requestId, status: 400, code: 'LICENSE_STATUS_FAILED', defaultMessage: '라이선스 상태 조회에 실패했습니다.' },
                async () => {
                    const quiet = parseBoolQuery(searchParams.get('quiet'));
                    const status = await License.checkLicenseStatus({ quiet });
                    if (!status.success) {
                        return sendError(res, requestId, 400, 'LICENSE_STATUS_FAILED', status.message);
                    }
                    return sendSuccess(res, requestId, {
                        planCode: status.planCode || '',
                        planName: status.planDisplayName || status.planCode || '',
                        createdAt: status.createdAt || '',
                        usageLimit: status.usageLimit,
                        usageCount: status.usageCount,
                        remaining: status.remaining,
                        features: toFeatureMap(status.features)
                    });
                }
            );
        }

        if (pathname === '/api/v1/capabilities') {
            if (!ensureMethod({ method, allowed: 'GET', sendError, res, requestId })) return true;
            return withError(
                { sendError, res, requestId, status: 400, code: 'CAPABILITY_RESOLVE_FAILED', defaultMessage: '권한 정보 조회에 실패했습니다.' },
                async () => {
                    const quiet = parseBoolQuery(searchParams.get('quiet'));
                    const status = await License.checkLicenseStatus({ quiet });
                    if (!status.success) {
                        return sendError(res, requestId, 400, 'CAPABILITY_RESOLVE_FAILED', status.message);
                    }
                    const features = toFeatureMap(status.features);
                    const maxBlogPosts = getFeatureInt(features, 'max_blog_posts_per_run', resolveMaxBlogPostsPerRun());
                    const maxShoppingPosts = getFeatureInt(features, 'max_shopping_posts_per_run', resolveMaxShoppingPostsPerRun());

                    return sendSuccess(res, requestId, {
                        planCode: status.planCode || '',
                        planName: status.planDisplayName || status.planCode || '',
                        features,
                        limits: {
                            max_blog_posts_per_run: maxBlogPosts,
                            max_shopping_posts_per_run: maxShoppingPosts
                        }
                    });
                }
            );
        }

        if (pathname === '/api/v1/session/naver') {
            if (!ensureMethod({ method, allowed: 'GET', sendError, res, requestId })) return true;
            return withError(
                { sendError, res, requestId, status: 500, code: 'NAVER_SESSION_CHECK_FAILED', defaultMessage: '네이버 세션 확인에 실패했습니다.' },
                async () => {
                    const session = await checkNaverSessionForUi();
                    return sendSuccess(res, requestId, {
                        valid: Boolean(session.ok),
                        reason: session.reason || '',
                        message: session.message || '',
                        checkedAt: new Date().toISOString()
                    });
                }
            );
        }

        if (pathname === '/api/v1/session/naver-login') {
            if (!ensureMethod({ method, allowed: 'GET', sendError, res, requestId })) return true;
            return sendSuccess(res, requestId, getNaverLoginStatus());
        }

        if (pathname === '/api/v1/session/naver-login/start') {
            if (!ensureMethod({ method, allowed: 'POST', sendError, res, requestId })) return true;

            const naverLoginState = getNaverLoginState();
            if (naverLoginState.status === 'running') {
                return sendError(res, requestId, 409, 'NAVER_LOGIN_ALREADY_RUNNING', '이미 로그인 진행 중입니다. 브라우저 창을 확인해 주세요.');
            }

            Logger.info('🔐 [UI] 네이버 로그인 시작 요청 수신');
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

            return sendSuccess(res, requestId, getNaverLoginStatus(), 202);
        }

        return false;
    };
}

module.exports = {
    createSessionLicenseRouteHandler
};

