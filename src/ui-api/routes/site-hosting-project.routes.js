'use strict';

function createSiteHostingProjectRouteHandler(deps = {}) {
    const { service, sendSuccess, sendError } = deps;

    function isLoopbackRequest(ctx = {}) {
        const remoteAddress = String(ctx.remoteAddress || '').toLowerCase();
        if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remoteAddress)) return false;
        try {
            const host = new URL(`http://${String(ctx.host || '').trim()}`);
            const hostname = host.hostname.toLowerCase();
            const validHost = ['127.0.0.1', 'localhost', '[::1]'].includes(hostname)
                && !host.username && !host.password && host.pathname === '/' && !host.search && !host.hash;
            if (!validHost) return false;
            if (!ctx.origin) return ctx.method === 'GET';
            const origin = new URL(String(ctx.origin));
            return origin.protocol === 'http:'
                && origin.origin === String(ctx.origin)
                && origin.host === host.host;
        } catch {
            return false;
        }
    }

    return async function tryHandleSiteHostingProjectRoute(ctx = {}) {
        const pathname = String(ctx.pathname || '');
        if (!pathname.startsWith('/api/v1/site-hosting/projects')) return false;
        const { method, requestId, res } = ctx;
        const contentType = String(ctx.contentType || '').split(';', 1)[0].trim().toLowerCase();
        if (!isLoopbackRequest(ctx) || (method === 'POST' && contentType !== 'application/json')) {
            await sendError(res, requestId, 403, 'LOCAL_PROJECT_MANAGEMENT_REQUIRED', '프로젝트 관리는 BlogGenius에서만 사용할 수 있습니다.');
            return true;
        }

        try {
            if (pathname === '/api/v1/site-hosting/projects' && method === 'GET') {
                await sendSuccess(res, requestId, service.list());
                return true;
            }
            if (pathname === '/api/v1/site-hosting/projects' && method === 'POST') {
                await sendSuccess(res, requestId, service.create(ctx.requestBody || {}), 201);
                return true;
            }
            const projectMatch = pathname.match(/^\/api\/v1\/site-hosting\/projects\/([^/]+)$/);
            if (projectMatch && method === 'GET') {
                let id = '';
                try { id = decodeURIComponent(projectMatch[1]); } catch (_error) { }
                await sendSuccess(res, requestId, service.get(id));
                return true;
            }
            return false;
        } catch (error) {
            await sendError(
                res,
                requestId,
                Number.isInteger(error?.status) ? error.status : 500,
                error?.code || 'SITE_HOSTING_PROJECT_REQUEST_FAILED',
                error?.message || '프로젝트 요청을 처리하지 못했습니다.'
            );
            return true;
        }
    };
}

module.exports = { createSiteHostingProjectRouteHandler };
