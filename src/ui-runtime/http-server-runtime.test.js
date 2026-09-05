const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createUiHttpUtils } = require('./http-utils');
const { createUiHttpServerRuntime } = require('./http-server-runtime');

function createWindowsServerHarness() {
    const uiRoot = 'C:\\Program Files\\BlogGenius\\resources\\app.asar\\ui';
    let requestHandler = null;
    const fs = {
        existsSync() { return true; },
        statSync() { return { isFile: () => true, isDirectory: () => true }; },
        readFileSync(filePath) { return `raw:${filePath}`; }
    };
    const Logger = { debug() {}, info() {}, error() {} };
    const httpUtils = createUiHttpUtils({
        fs,
        path: path.win32,
        Logger,
        currentDir: path.win32.join(uiRoot, '..', 'src'),
        appRoot: path.win32.join(uiRoot, '..', '..')
    });
    const http = {
        createServer(handler) {
            requestHandler = handler;
            return {
                once() { return this; },
                listen(_port, _host, callback) { callback(); },
                close(callback) { callback(); }
            };
        }
    };
    const lifecycle = { cardNewsStarts: 0, cardNewsStops: 0 };
    const runtime = createUiHttpServerRuntime({
        http,
        fs,
        path: path.win32,
        Logger,
        CONFIG: { LISTEN_HOST: '127.0.0.1', LISTEN_PORT: 4577 },
        defaultHost: '127.0.0.1',
        defaultPort: 4577,
        resolveUiRoot: () => uiRoot,
        composeUiShell: () => '<html>composed</html>',
        composeUiStyles: () => 'body { color: green; }',
        composeUiScript: () => 'globalThis.composed = true;',
        normalizeListenHost: (value, fallback) => value || fallback,
        normalizeListenPort: (value, fallback) => Number(value) || fallback,
        createRequestId: () => 'request-test',
        readJsonBody: async () => ({}),
        handleApi: async () => false,
        sanitizePathname: httpUtils.sanitizePathname,
        shouldServeUiShell: httpUtils.shouldServeUiShell,
        sendError: () => false,
        getContentType: httpUtils.getContentType,
        syncAutoRunnerWithConfig() {},
        triggerSnsStartupDiscovery: null,
        startCardNewsRssIntake() { lifecycle.cardNewsStarts += 1; },
        stopCardNewsRssIntake() { lifecycle.cardNewsStops += 1; },
        startRecommendationDelivery: null,
        stopRecommendationDelivery() {},
        syncShoppingAutoRunnerWithConfig() {},
        recordUiActivity() {},
        handleGoogleOAuthCallback: async () => false,
        initTelegramBotService: async () => {},
        stopTelegramBotService: async () => {}
    });

    return {
        lifecycle,
        async start() {
            await runtime.startUiServer();
        },
        async reload() {
            await runtime.reloadUiServer('127.0.0.1', 4577);
        },
        async request(url) {
            const response = { statusCode: 0, headers: {}, body: null };
            await requestHandler(
                { method: 'GET', url },
                {
                    headersSent: false,
                    writableEnded: false,
                    writeHead(statusCode, headers) {
                        response.statusCode = statusCode;
                        response.headers = headers;
                    },
                    end(body) {
                        response.body = body;
                    }
                }
            );
            return response;
        }
    };
}

test('Windows UI server returns composed CSS and JavaScript assets', async () => {
    const harness = createWindowsServerHarness();
    await harness.start();
    assert.equal(harness.lifecycle.cardNewsStarts, 1);

    const styles = await harness.request('/styles.css?v=3');
    assert.equal(styles.statusCode, 200);
    assert.equal(styles.headers['Content-Type'], 'text/css; charset=utf-8');
    assert.equal(styles.body, 'body { color: green; }');

    const script = await harness.request('/app.js?v=4');
    assert.equal(script.statusCode, 200);
    assert.equal(script.headers['Content-Type'], 'application/javascript; charset=utf-8');
    assert.equal(script.body, 'globalThis.composed = true;');
});

test('UI server restart replaces the Card News RSS scheduler instead of duplicating it', async () => {
    const harness = createWindowsServerHarness();
    await harness.start();
    await harness.reload();

    assert.equal(harness.lifecycle.cardNewsStops, 1);
    assert.equal(harness.lifecycle.cardNewsStarts, 2);
});
