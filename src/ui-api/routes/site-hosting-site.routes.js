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
            const setupInputMatch = pathname.match(/^\/api\/v1\/site-hosting\/templates\/([^/]+)\/setup-inputs\/([^/]+)\/select-directory$/);
            if (setupInputMatch && method === 'POST') {
                await sendSuccess(res, requestId, await service.selectSetupDirectory(
                    decodePathPart(setupInputMatch[1]), decodePathPart(setupInputMatch[2])
                ));
                return true;
            }
            const importArchiveSelectMatch = pathname.match(/^\/api\/v1\/site-hosting\/projects\/([^/]+)\/import-archive\/select$/);
            if (importArchiveSelectMatch && method === 'POST' && service.selectImportArchive) {
                await sendSuccess(res, requestId, await service.selectImportArchive(decodePathPart(importArchiveSelectMatch[1])));
                return true;
            }
            const importArchiveInspectMatch = pathname.match(/^\/api\/v1\/site-hosting\/projects\/([^/]+)\/import-archive\/inspect$/);
            if (importArchiveInspectMatch && method === 'POST' && service.inspectImportArchive) {
                await sendSuccess(res, requestId, await service.inspectImportArchive(decodePathPart(importArchiveInspectMatch[1]), ctx.requestBody || {}));
                return true;
            }
            const importArchiveMatch = pathname.match(/^\/api\/v1\/site-hosting\/projects\/([^/]+)\/sites\/import-archive$/);
            if (importArchiveMatch && method === 'POST' && service.importAstroArchive) {
                await sendSuccess(res, requestId, await service.importAstroArchive(decodePathPart(importArchiveMatch[1]), ctx.requestBody || {}), 201);
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
            const sitePostsMatch = pathname.match(/^\/api\/v1\/site-hosting\/projects\/([^/]+)\/sites\/([^/]+)\/posts$/);
            if (sitePostsMatch && method === 'POST') {
                const projectId = decodePathPart(sitePostsMatch[1]);
                const siteId = decodePathPart(sitePostsMatch[2]);
                await sendSuccess(res, requestId, await service.postMarkdown(projectId, siteId, ctx.requestBody || {}, { requestId }));
                return true;
            }
            const siteActionMatch = pathname.match(/^\/api\/v1\/site-hosting\/projects\/([^/]+)\/sites\/([^/]+)\/(build|build-status|preview|deploy|update-template|test-template-update|open-folder|open-vault|vault-folders|vault-folder|open-address|open-post|zones|custom-domain|custom-domain-disconnect|worker-disconnect|delete-plan|delete)$/);
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
                    await sendSuccess(res, requestId, await service.deploy(projectId, siteId, { ...(ctx.requestBody || {}), requestId }));
                    return true;
                }
                if (action === 'update-template' && method === 'POST') {
                    await sendSuccess(res, requestId, await service.updateTemplate(projectId, siteId));
                    return true;
                }
                if (action === 'test-template-update' && method === 'POST') {
                    await sendSuccess(res, requestId, service.prepareTemplateUpdateTest(projectId, siteId));
                    return true;
                }
                if (action === 'open-folder' && method === 'POST') {
                    await sendSuccess(res, requestId, await service.openBuildFolder(projectId, siteId));
                    return true;
                }
                if (action === 'open-vault' && method === 'POST') {
                    await sendSuccess(res, requestId, await service.openKnowledgeCollectionFolder(projectId, siteId));
                    return true;
                }
                if (action === 'vault-folders' && method === 'GET') {
                    await sendSuccess(res, requestId, service.listKnowledgeCollectionFolders(projectId, siteId));
                    return true;
                }
                if (action === 'vault-folder' && method === 'POST') {
                    await sendSuccess(res, requestId, await service.selectKnowledgeCollectionFolder(projectId, siteId, ctx.requestBody || {}));
                    return true;
                }
                if (action === 'open-address' && method === 'POST') {
                    const addressType = String(ctx.requestBody?.type || '');
                    if (!['worker', 'domain'].includes(addressType)) {
                        await sendError(res, requestId, 400, 'SITE_HOSTING_ADDRESS_TYPE_INVALID', '열 주소 종류가 올바르지 않습니다.');
                        return true;
                    }
                    await sendSuccess(res, requestId, await service.openSiteAddress(projectId, siteId, addressType));
                    return true;
                }
                if (action === 'open-post' && method === 'POST') {
                    await sendSuccess(res, requestId, await service.openSitePost(projectId, siteId, ctx.requestBody?.post_id));
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
                if (action === 'custom-domain-disconnect' && method === 'POST') {
                    await sendSuccess(res, requestId, await service.disconnectCustomDomain(projectId, siteId, ctx.requestBody || {}));
                    return true;
                }
                if (action === 'worker-disconnect' && method === 'POST') {
                    await sendSuccess(res, requestId, await service.disconnectWorker(projectId, siteId, ctx.requestBody || {}));
                    return true;
                }
                if (action === 'delete-plan' && method === 'POST') {
                    await sendSuccess(res, requestId, await service.prepareSiteDeletion(projectId, siteId));
                    return true;
                }
                if (action === 'delete' && method === 'POST') {
                    await sendSuccess(res, requestId, await service.deleteSite(projectId, siteId, ctx.requestBody || {}));
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
            if (siteMatch && method === 'GET' && service.getSettings) {
                await sendSuccess(res, requestId, service.getSettings(decodePathPart(siteMatch[1]), decodePathPart(siteMatch[2])));
                return true;
            }
            if (siteMatch && method === 'PUT' && service.applySettings) {
                await sendSuccess(res, requestId, await service.applySettings(decodePathPart(siteMatch[1]), decodePathPart(siteMatch[2]), ctx.requestBody || {}));
                return true;
            }
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
                const createSite = service.createAndBuild || service.create;
                await sendSuccess(res, requestId, await createSite(projectId, ctx.requestBody || {}), 201);
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
