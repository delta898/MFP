'use strict';

function createCorePluginsRouteHandler(deps = {}) {
    const { corePluginRuntime, sendSuccess, sendError } = deps;
    if (typeof corePluginRuntime?.listPlugins !== 'function' || typeof corePluginRuntime?.getPlugin !== 'function') {
        throw new TypeError('Core Plugin routes require the shared Core Plugin runtime.');
    }

    return async function tryHandleCorePluginsRoute(ctx = {}) {
        const { pathname, method, requestId, res } = ctx;
        if (pathname === '/api/v1/plugins/core') {
            if (method !== 'GET') {
                await sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', 'GET 요청만 지원합니다.');
                return true;
            }
            await sendSuccess(res, requestId, { plugins: corePluginRuntime.listPlugins() });
            return true;
        }

        const match = /^\/api\/v1\/plugins\/core\/([^/]+)$/.exec(String(pathname || ''));
        if (!match) return false;
        if (method !== 'GET') {
            await sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', 'GET 요청만 지원합니다.');
            return true;
        }

        let pluginId;
        try { pluginId = decodeURIComponent(match[1]); }
        catch (_) {
            await sendError(res, requestId, 400, 'INVALID_PLUGIN_ID', '플러그인 ID가 올바르지 않습니다.');
            return true;
        }
        const plugin = corePluginRuntime.getPlugin(pluginId);
        if (!plugin) {
            await sendError(res, requestId, 404, 'PLUGIN_NOT_FOUND', '등록된 Core 플러그인을 찾을 수 없습니다.');
            return true;
        }
        await sendSuccess(res, requestId, { plugin });
        return true;
    };
}

module.exports = { createCorePluginsRouteHandler };
