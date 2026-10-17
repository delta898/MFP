'use strict';

function createWidgetPluginsRouteHandler(deps = {}) {
    const { catalog, fs, sendSuccess, sendError, getContentType } = deps;
    if (typeof catalog?.list !== 'function' || typeof catalog?.resolveAsset !== 'function'
        || typeof fs?.readFileSync !== 'function' || typeof getContentType !== 'function') {
        throw new TypeError('Widget Plugin routes require a catalog and static asset reader.');
    }

    async function tryHandleWidgetPluginsRoute(ctx = {}) {
        const { pathname, method, requestId, searchParams, res } = ctx;
        if (pathname !== '/api/v1/widget-plugins') return false;
        if (method !== 'GET') {
            await sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 요청입니다.');
            return true;
        }
        await sendSuccess(res, requestId, { widgets: catalog.list(searchParams?.get('slot') || '') });
        return true;
    }

    function tryHandleWidgetPluginAsset(ctx = {}) {
        const { pathname, method, requestId, res } = ctx;
        if (!pathname.startsWith('/widget-plugins/')) return false;
        if (method !== 'GET') {
            sendError(res, requestId, 405, 'METHOD_NOT_ALLOWED', '지원하지 않는 요청입니다.');
            return true;
        }
        const parts = pathname.slice('/widget-plugins/'.length).split('/');
        if (parts.length < 3) {
            sendError(res, requestId, 404, 'WIDGET_ASSET_NOT_FOUND', '위젯 파일을 찾을 수 없습니다.');
            return true;
        }
        let pluginId;
        let widgetId;
        try {
            pluginId = decodeURIComponent(parts.shift());
            widgetId = decodeURIComponent(parts.shift());
        } catch (_) {
            sendError(res, requestId, 404, 'WIDGET_ASSET_NOT_FOUND', '위젯 파일을 찾을 수 없습니다.');
            return true;
        }
        const relativePath = parts.map((part) => {
            try { return decodeURIComponent(part); } catch (_) { return '\u0000'; }
        }).join('/');
        const assetPath = catalog.resolveAsset(pluginId, widgetId, relativePath);
        if (!assetPath) {
            sendError(res, requestId, 404, 'WIDGET_ASSET_NOT_FOUND', '위젯 파일을 찾을 수 없습니다.');
            return true;
        }
        const body = fs.readFileSync(assetPath);
        res.writeHead(200, {
            'Content-Type': getContentType(assetPath),
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
            'Referrer-Policy': 'no-referrer',
            // Focus Clock renders clock faces and timer progress with inline style attributes.
            // The sandbox still denies same-origin access, network requests, forms, and plugins.
            'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; media-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'"
        });
        res.end(body);
        return true;
    }

    return Object.freeze({ tryHandleRoute: tryHandleWidgetPluginsRoute, tryHandleAsset: tryHandleWidgetPluginAsset });
}

module.exports = { createWidgetPluginsRouteHandler };
