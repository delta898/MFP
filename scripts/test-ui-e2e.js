#!/usr/bin/env node
const assert = require('assert');
const { startUiServer } = require('../src/ui-server');

function parseJson(text) {
    try {
        return JSON.parse(text);
    } catch (_e) {
        return null;
    }
}

async function requestJson(baseUrl, path) {
    const res = await fetch(`${baseUrl}${path}`);
    const text = await res.text();
    const json = parseJson(text);
    return { status: res.status, text, json };
}

async function run() {
    const port = 4592;
    const host = '127.0.0.1';
    const started = await startUiServer({ host, port });
    const baseUrl = `http://${started.openHost}:${started.port}`;

    try {
        const shellResponse = await fetch(`${baseUrl}/`);
        const shellHtml = await shellResponse.text();
        assert.strictEqual(shellResponse.status, 200);
        assert.match(shellHtml, /id="view-dashboard"/);
        assert.match(shellHtml, /id="view-settings"/);
        assert.doesNotMatch(shellHtml, /<!--\s*@include\s+/);

        const stylesResponse = await fetch(`${baseUrl}/styles.css`);
        const stylesCss = await stylesResponse.text();
        assert.strictEqual(stylesResponse.status, 200);
        assert.match(stylesCss, /^@import url/);
        assert.match(stylesCss, /\.quick-discovery-modal-container\s*\{/);
        assert.doesNotMatch(stylesCss, /\/\*\s*@include\s+/);

        const health = await requestJson(baseUrl, '/api/v1/health');
        assert.strictEqual(health.status, 200);
        assert.ok(health.json?.success);
        assert.strictEqual(health.json?.data?.status, 'ok');

        // Regression guard: this endpoint used to trigger double-write in route hub split.
        const config1 = await requestJson(baseUrl, '/api/v1/config/status');
        const config2 = await requestJson(baseUrl, '/api/v1/config/status');
        assert.strictEqual(config1.status, 200);
        assert.strictEqual(config2.status, 200);
        assert.ok(config1.json?.success);
        assert.ok(config2.json?.success);

        const dashLogs = await requestJson(baseUrl, '/api/v1/dashboard/logs');
        assert.strictEqual(dashLogs.status, 200);
        assert.ok(dashLogs.json?.success);
        assert.ok(Array.isArray(dashLogs.json?.data?.logs));

        const naverLoginStatus = await requestJson(baseUrl, '/api/v1/session/naver-login');
        assert.strictEqual(naverLoginStatus.status, 200);
        assert.ok(naverLoginStatus.json?.success);
        assert.ok(typeof naverLoginStatus.json?.data?.status === 'string');

        const googleAuthStatus = await requestJson(baseUrl, '/api/v1/google-oauth/status');
        assert.strictEqual(googleAuthStatus.status, 200);
        assert.ok(googleAuthStatus.json?.success);
        assert.ok(Object.prototype.hasOwnProperty.call(googleAuthStatus.json?.data || {}, 'configured'));

        const notFound = await requestJson(baseUrl, '/api/v1/not-exists');
        assert.strictEqual(notFound.status, 404);
        assert.strictEqual(notFound.json?.success, false);
        assert.strictEqual(notFound.json?.error?.code, 'NOT_FOUND');

        console.log('✅ ui e2e smoke test passed');
    } finally {
        await new Promise((resolve) => started.server.close(resolve));
    }
}

run()
    .then(() => {
        process.exit(0);
    })
    .catch((e) => {
        console.error('❌ ui e2e smoke test failed');
        console.error(e && e.stack ? e.stack : e);
        process.exit(1);
    });
