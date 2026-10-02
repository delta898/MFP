'use strict';

function createCloudflareConnectionRouteHandler(deps = {}) {
    const { service, sendSuccess, sendError } = deps;
    return async function tryHandleCloudflareConnectionRoute(ctx = {}) {
        const { method, requestId, res, remoteAddress } = ctx;
        const pathname = String(ctx.pathname || '');
        if (!pathname.startsWith('/api/v1/site-hosting/cloudflare/')) return false;
        const address = String(remoteAddress || '').toLowerCase();
        const isLoopback = address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
        if (!isLoopback) {
            await sendError(res, requestId, 403, 'LOCAL_CONNECTION_REQUIRED', 'Cloudflare 연결 관리는 이 기기의 BlogGenius에서만 사용할 수 있습니다.');
            return true;
        }
        try {
            if (pathname === '/api/v1/site-hosting/cloudflare/status' && method === 'GET') {
                await sendSuccess(res, requestId, await service.getStatus());
                return true;
            }
            if (pathname === '/api/v1/site-hosting/cloudflare/connect' && method === 'POST') {
                await sendSuccess(res, requestId, await service.start());
                return true;
            }
            if (pathname === '/api/v1/site-hosting/cloudflare/disconnect' && method === 'POST') {
                await sendSuccess(res, requestId, await service.disconnect());
                return true;
            }
            const flowMatch = pathname.match(/^\/api\/v1\/site-hosting\/cloudflare\/flows\/([^/]+)(\/cancel)?$/);
            if (flowMatch) {
                const flowId = decodeURIComponent(flowMatch[1]);
                if (flowMatch[2] && method === 'POST') {
                    await sendSuccess(res, requestId, service.cancel(flowId));
                    return true;
                }
                if (!flowMatch[2] && method === 'GET') {
                    await sendSuccess(res, requestId, service.getFlow(flowId));
                    return true;
                }
            }
            return false;
        } catch (error) {
            await sendError(
                res,
                requestId,
                Number.isInteger(error?.status) ? error.status : 400,
                error?.apiCode || 'CLOUDFLARE_CONNECTION_FAILED',
                error?.message || 'Cloudflare 연결을 처리하지 못했습니다.'
            );
            return true;
        }
    };
}

module.exports = { createCloudflareConnectionRouteHandler };
