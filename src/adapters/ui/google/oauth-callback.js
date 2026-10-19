'use strict';

function createGoogleOAuthCallbackHandler({ googleOAuth, clearGoogleAuthCache } = {}) {
    if (!googleOAuth || typeof googleOAuth.exchangeCode !== 'function' || typeof googleOAuth.renderCallbackHtml !== 'function') {
        throw new TypeError('Google OAuth callback requires an OAuth adapter.');
    }
    if (typeof clearGoogleAuthCache !== 'function') {
        throw new TypeError('Google OAuth callback requires an auth-cache invalidation operation.');
    }

    return async function handleGoogleOAuthCallback({ url, res } = {}) {
        const respond = (statusCode, body) => {
            res.writeHead(statusCode, {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'no-store'
            });
            res.end(body);
        };

        try {
            const code = String(url?.searchParams?.get('code') || '').trim();
            const state = String(url?.searchParams?.get('state') || '').trim();
            if (!code || !state) {
                respond(400, googleOAuth.renderCallbackHtml({ success: false, message: '인증 코드 또는 상태값이 없습니다.' }));
                return true;
            }

            const tokens = await googleOAuth.exchangeCode(code, state);
            clearGoogleAuthCache();
            respond(200, googleOAuth.renderCallbackHtml({ success: true, email: String(tokens.connected_email || '') }));
        } catch (error) {
            respond(400, googleOAuth.renderCallbackHtml({ success: false, message: error.message }));
        }
        return true;
    };
}

module.exports = { createGoogleOAuthCallbackHandler };
