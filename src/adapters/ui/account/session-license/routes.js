function createSessionLicenseRouteHandler(deps = {}) {
    const { controller } = deps;

    return async function tryHandleSessionLicenseRoute(ctx = {}) {
        const { pathname } = ctx;

        if (pathname === '/api/v1/license/status') return controller.licenseStatus(ctx);
        if (pathname === '/api/v1/license/upgrade') return controller.licenseUpgrade(ctx);
        if (pathname === '/api/v1/license/registration/request') return controller.licenseRegistrationRequest(ctx);
        if (pathname === '/api/v1/license/registration/verify') return controller.licenseRegistrationVerify(ctx);
        if (pathname === '/api/v1/capabilities') return controller.capabilities(ctx);
        if (pathname === '/api/v1/session/naver') return controller.naverSession(ctx);
        if (pathname === '/api/v1/session/naver-login') return controller.naverLoginStatus(ctx);
        if (pathname === '/api/v1/session/naver-login/start') return controller.naverLoginStart(ctx);
        if (pathname === '/api/v1/session/naver-login/logout') return controller.naverLoginLogout(ctx);
        if (pathname === '/api/v1/session/wordpress-verify') return controller.wordpressVerify(ctx);

        return false;
    };
}

module.exports = {
    createSessionLicenseRouteHandler
};
