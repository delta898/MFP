const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createUiHttpUtils } = require('./http-utils');
const { createUiHttpServerRuntime } = require('./http-server-runtime');

function createWindowsServerHarness(overrides = {}) {
    const uiRoot = 'C:\\Program Files\\BlogGenius\\resources\\app.asar\\ui';
    let requestHandler = null;
    const fs = {
        existsSync() { return true; },
        statSync() { return { isFile: () => true, isDirectory: () => true }; },
        readFileSync(filePath) { return `raw:${filePath}`; }
    };
    const Logger = { debug() {}, info() {}, warn() {}, error() {} };
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
                address() { return { port: 4577 }; },
                close(callback) { callback(); }
            };
        }
    };
    const lifecycle = { autoSyncs: 0, telegramStarts: 0, snsStarts: 0, cardNewsStarts: 0, cardNewsStops: 0 };
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
        syncAutoRunnerWithConfig() {
            lifecycle.autoSyncs += 1;
            if (overrides.autoRunnerError) throw overrides.autoRunnerError;
        },
        triggerSnsStartupDiscovery: overrides.snsPromise
            ? () => {
                lifecycle.snsStarts += 1;
                return overrides.snsPromise;
            }
            : null,
        startCardNewsRssIntake() { lifecycle.cardNewsStarts += 1; },
        stopCardNewsRssIntake() { lifecycle.cardNewsStops += 1; },
        startRecommendationDelivery: null,
        stopRecommendationDelivery() {},
        recordUiActivity() {},
        handleGoogleOAuthCallback: async () => false,
        initTelegramBotService: async () => { lifecycle.telegramStarts += 1; },
        stopTelegramBotService: async () => {}
    });

    return {
        lifecycle,
        async start(options = {}) {
            return runtime.startUiServer(options);
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

test('safe mode serves the local UI without starting optional background services', async () => {
    const harness = createWindowsServerHarness();
    await harness.start({ safeMode: true });

    assert.equal(harness.lifecycle.autoSyncs, 0);
    assert.equal(harness.lifecycle.telegramStarts, 0);
    assert.equal(harness.lifecycle.cardNewsStarts, 0);

    const shell = await harness.request('/');
    assert.equal(shell.statusCode, 200);
    assert.equal(shell.body, '<html>composed</html>');
});

test('GUI may serve its first screen before optional background services start', async () => {
    const harness = createWindowsServerHarness();
    const started = await harness.start({ deferOptionalStartup: true });

    assert.equal(harness.lifecycle.autoSyncs, 0);
    assert.equal(harness.lifecycle.telegramStarts, 0);
    assert.equal(harness.lifecycle.cardNewsStarts, 0);

    const shell = await harness.request('/');
    assert.equal(shell.statusCode, 200);
    await started.startOptionalServices();

    assert.equal(harness.lifecycle.autoSyncs, 1);
    assert.equal(harness.lifecycle.telegramStarts, 1);
    assert.equal(harness.lifecycle.cardNewsStarts, 1);
});

test('one optional startup failure cannot block the remaining services or first screen', async () => {
    const harness = createWindowsServerHarness({ autoRunnerError: new Error('forced auto-runner failure') });
    const started = await harness.start({ deferOptionalStartup: true });

    assert.equal((await harness.request('/')).statusCode, 200);
    const results = await started.startOptionalServices();

    assert.deepEqual(results.map((entry) => entry.ok), [false, true, true]);
    assert.equal(harness.lifecycle.telegramStarts, 1);
    assert.equal(harness.lifecycle.cardNewsStarts, 1);
});

test('deferred startup waits for tracked SNS discovery instead of abandoning it at shutdown', async () => {
    let finishSns;
    const snsPromise = new Promise((resolve) => { finishSns = resolve; });
    const harness = createWindowsServerHarness({ snsPromise });
    const started = await harness.start({ deferOptionalStartup: true });
    let settled = false;
    const optional = started.startOptionalServices().then(() => { settled = true; });

    await Promise.resolve();
    assert.equal(harness.lifecycle.snsStarts, 1);
    assert.equal(settled, false);

    finishSns();
    await optional;
    assert.equal(settled, true);
});

test('an Electron caller may explicitly request an ephemeral loopback port', async () => {
    const harness = createWindowsServerHarness();
    const started = await harness.start({ port: 0, allowEphemeralPort: true, deferOptionalStartup: true });
    assert.equal(started.port, 4577);
    assert.equal((await harness.request('/')).statusCode, 200);
});
