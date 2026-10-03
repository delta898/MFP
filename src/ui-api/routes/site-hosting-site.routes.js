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
    if (value === undefined || value === null || value === '') return '';
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
        if (!isLoopbackRequest(ctx) || (['POST', 'PUT'].includes(method) && contentType !== 'application/json')) {
            await sendError(res, requestId, 403, 'LOCAL_SITE_MANAGEMENT_REQUIRED', '사이트 관리는 BlogGenius에서만 사용할 수 있습니다.');
            return true;
        }

        try {
            if (pathname === '/api/v1/site-hosting/templates' && method === 'GET') {
                await sendSuccess(res, requestId, await service.listTemplates());
                return true;
            }
            const templatePreviewMatch = pathname.match(/^\/api\/v1\/site-hosting\/templates\/([^/]+)\/preview$/);
            if (templatePreviewMatch && method === 'GET') {
                const preview = service.getTemplatePreview?.(decodePathPart(templatePreviewMatch[1]));
                if (!preview) {
                    await sendError(res, requestId, 404, 'SITE_HOSTING_TEMPLATE_PREVIEW_NOT_FOUND', '템플릿 미리보기를 찾을 수 없습니다.');
                    return true;
                }
                res.writeHead(200, {
                    'Content-Type': preview.contentType,
                    'Content-Length': preview.buffer.length,
                    'Cache-Control': 'no-store',
                    'X-Content-Type-Options': 'nosniff'
                });
                res.end(preview.buffer);
                return true;
            }
            const draftPreviewMatch = pathname.match(/^\/api\/v1\/site-hosting\/projects\/([^/]+)\/preview-drafts(?:\/([^/]+))?$/);
            if (draftPreviewMatch) {
                const projectId = decodePathPart(draftPreviewMatch[1]);
                const draftId = decodePathPart(draftPreviewMatch[2]);
                if (!draftId && method === 'POST') {
                    await sendSuccess(res, requestId, await service.previewDraft(projectId, ctx.requestBody || {}));
                    return true;
                }
                if (draftId && method === 'DELETE') {
                    await sendSuccess(res, requestId, await service.stopDraftPreview(projectId, draftId));
                    return true;
                }
                return false;
            }
            const siteActionMatch = pathname.match(/^\/api\/v1\/site-hosting\/projects\/([^/]+)\/sites\/([^/]+)\/(build|build-status|preview|deploy|open-folder|zones|custom-domain)$/);
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
                    await sendSuccess(res, requestId, await service.deploy(projectId, siteId, { requestId }));
                    return true;
                }
                if (action === 'open-folder' && method === 'POST') {
                    await sendSuccess(res, requestId, await service.openBuildFolder(projectId, siteId));
                    return true;
                }
                if (action === 'zones' && method === 'GET') {
                    await sendSuccess(res, requestId, await service.listCloudflareZones(projectId, siteId));
                    return true;
                }
                if (action === 'custom-domain' && method === 'POST') {
                    await sendSuccess(res, requestId, await service.connectCustomDomain(projectId, siteId, ctx.requestBody || {}));
                    return true;
                }
                return false;
            }
            const screenshotMatch = pathname.match(/^\/api\/v1\/site-hosting\/projects\/([^/]+)\/sites\/([^/]+)\/screenshot$/);
            if (screenshotMatch && method === 'GET') {
                const screenshot = service.getScreenshot(decodePathPart(screenshotMatch[1]), decodePathPart(screenshotMatch[2]));
                res.writeHead(200, {
                    'Content-Type': screenshot.contentType,
                    'Content-Length': screenshot.buffer.length,
                    'Cache-Control': 'no-store',
                    'X-Content-Type-Options': 'nosniff'
                });
                res.end(screenshot.buffer);
                return true;
            }
            const siteMatch = pathname.match(/^\/api\/v1\/site-hosting\/projects\/([^/]+)\/sites\/([^/]+)$/);
            if (siteMatch && method === 'PUT') {
                await sendSuccess(res, requestId, service.update(decodePathPart(siteMatch[1]), decodePathPart(siteMatch[2]), ctx.requestBody || {}));
                return true;
            }
            const sitesMatch = pathname.match(/^\/api\/v1\/site-hosting\/projects\/([^/]+)\/sites$/);
            if (!sitesMatch) return false;
            const projectId = decodePathPart(sitesMatch[1]);
            if (method === 'GET') {
                await sendSuccess(res, requestId, await service.list(projectId));
                return true;
            }
            if (method === 'POST') {
                await sendSuccess(res, requestId, await service.create(projectId, ctx.requestBody || {}), 201);
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

module.exports = { createSiteHostingSiteRouteHandler, isLoopbackRequest };
