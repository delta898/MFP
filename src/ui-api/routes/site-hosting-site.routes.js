'use strict';

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

function decodePathPart(value) {
    try { return decodeURIComponent(value); } catch (_error) { return ''; }
}

function createSiteHostingSiteRouteHandler(deps = {}) {
    const { service, sendSuccess, sendError } = deps;

    return async function tryHandleSiteHostingSiteRoute(ctx = {}) {
        const pathname = String(ctx.pathname || '');
        if (!pathname.startsWith('/api/v1/site-hosting/templates')
            && !pathname.startsWith('/api/v1/site-hosting/projects/')) return false;
        const { method, requestId, res } = ctx;
        const contentType = String(ctx.contentType || '').split(';', 1)[0].trim().toLowerCase();
        if (!isLoopbackRequest(ctx) || (method === 'POST' && contentType !== 'application/json')) {
            await sendError(res, requestId, 403, 'LOCAL_SITE_MANAGEMENT_REQUIRED', '사이트 관리는 BlogGenius에서만 사용할 수 있습니다.');
            return true;
        }

        try {
            if (pathname === '/api/v1/site-hosting/templates' && method === 'GET') {
                await sendSuccess(res, requestId, service.listTemplates());
                return true;
            }
            const siteActionMatch = pathname.match(/^\/api\/v1\/site-hosting\/projects\/([^/]+)\/sites\/([^/]+)\/(build|build-status|preview|deploy)$/);
            if (siteActionMatch) {
                const projectId = decodePathPart(siteActionMatch[1]);
                const siteId = decodePathPart(siteActionMatch[2]);
                const action = siteActionMatch[3];
                if (action === 'build' && method === 'POST') {
                    await sendSuccess(res, requestId, await service.build(projectId, siteId));
                    return true;
                }
                if (action === 'build-status' && method === 'GET') {
                    await sendSuccess(res, requestId, service.getBuildStatus(projectId, siteId));
                    return true;
                }
                if (action === 'preview' && method === 'POST') {
                    await sendSuccess(res, requestId, await service.startPreview(projectId, siteId));
                    return true;
                }
                if (action === 'preview' && method === 'DELETE') {
                    await sendSuccess(res, requestId, await service.stopPreview(projectId, siteId));
                    return true;
                }
                if (action === 'deploy' && method === 'POST') {
                    await sendSuccess(res, requestId, await service.deploy(projectId, siteId));
                    return true;
                }
                return false;
            }
            const sitesMatch = pathname.match(/^\/api\/v1\/site-hosting\/projects\/([^/]+)\/sites$/);
            if (!sitesMatch) return false;
            const projectId = decodePathPart(sitesMatch[1]);
            if (method === 'GET') {
                await sendSuccess(res, requestId, service.list(projectId));
                return true;
            }
            if (method === 'POST') {
                await sendSuccess(res, requestId, service.create(projectId, ctx.requestBody || {}), 201);
                return true;
            }
            return false;
        } catch (error) {
            await sendError(
                res,
                requestId,
                Number.isInteger(error?.status) ? error.status : 500,
                error?.code || error?.apiCode || 'SITE_HOSTING_SITE_REQUEST_FAILED',
                error?.message || '사이트 요청을 처리하지 못했습니다.'
            );
            return true;
        }
    };
}

module.exports = { createSiteHostingSiteRouteHandler };
