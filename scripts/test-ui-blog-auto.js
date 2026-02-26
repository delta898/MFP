#!/usr/bin/env node
const assert = require('assert');
const { createBlogAutoService } = require('../src/ui-api/services/blog-auto.service');
const { createBlogAutoController } = require('../src/ui-api/controllers/blog-auto.controller');
const { createBlogAutoRouteHandler } = require('../src/ui-api/routes/blog-auto.routes');
const UiValidators = require('../src/ui-api/middleware/validate');

function normalizeYmdToken(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';

    const compact = raw.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;

    const dashed = raw.match(/^(\d{4})[.\-/\s]+(\d{1,2})[.\-/\s]+(\d{1,2})$/);
    if (dashed) {
        const y = dashed[1];
        const m = String(parseInt(dashed[2], 10)).padStart(2, '0');
        const d = String(parseInt(dashed[3], 10)).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    return '';
}

function createHarness(overrides = {}) {
    const events = [];
    const Logger = {
        info: (...args) => events.push({ level: 'info', args }),
        warn: (...args) => events.push({ level: 'warn', args }),
        error: (...args) => events.push({ level: 'error', args })
    };

    const service = createBlogAutoService({
        Logger,
        getAutoStatusPayload: overrides.getAutoStatusPayload || (() => ({ enabled: true, status: 'waiting' })),
        ensureSheetsReadyForUi: overrides.ensureSheetsReadyForUi || (async () => ({ ok: true })),
        resolveNaverAutoCategoryCatalog: overrides.resolveNaverAutoCategoryCatalog || (async ({ force }) => ({
            categories: ['드라마', '영화'],
            force
        })),
        runAutoCycle: overrides.runAutoCycle || (async (_trigger, options) => ({
            success: true,
            data: {
                trendDate: options?.trendDate || '',
                summary: {
                    trendsCollected: 1,
                    trendsToTopics: 1,
                    blogAttempted: 1,
                    blogSuccess: 1,
                    skipped: []
                }
            }
        }))
    });

    let lastResponse = null;
    const sendSuccess = (_res, requestId, data) => {
        lastResponse = { ok: true, requestId, data };
        return true;
    };
    const sendError = (_res, requestId, status, code, message) => {
        lastResponse = { ok: false, requestId, status, code, message };
        return true;
    };

    const controller = createBlogAutoController({
        service,
        sendSuccess,
        sendError,
        Logger,
        validators: {
            parseForceQuery: UiValidators.parseForceQuery,
            validateBlogAutoManualRunPayload: (payload) => UiValidators.validateBlogAutoManualRunPayload(payload, normalizeYmdToken),
            isValidationError: UiValidators.isValidationError
        }
    });

    const routeHandler = createBlogAutoRouteHandler({ controller });

    async function call(pathname, method = 'GET', { search = '', body = {} } = {}) {
        lastResponse = null;
        const ctx = {
            requestId: 'req-test',
            pathname,
            method,
            searchParams: new URLSearchParams(search),
            requestBody: body,
            res: {}
        };
        const handled = await routeHandler(ctx);
        return { handled, response: lastResponse };
    }

    return { call, events };
}

async function run() {
    const h = createHarness();

    {
        const { handled, response } = await h.call('/api/v1/auto/status', 'GET');
        assert.strictEqual(handled, true);
        assert.strictEqual(response.ok, true);
        assert.strictEqual(response.data.enabled, true);
    }

    {
        const { handled, response } = await h.call('/api/v1/blog/auto/categories', 'GET', { search: 'force=true' });
        assert.strictEqual(handled, true);
        assert.strictEqual(response.ok, true);
        assert.deepStrictEqual(response.data.categories, ['드라마', '영화']);
        assert.strictEqual(response.data.force, true);
    }

    {
        const { handled, response } = await h.call('/api/v1/blog/auto/categories', 'GET', { search: 'force=abc' });
        assert.strictEqual(handled, true);
        assert.strictEqual(response.ok, false);
        assert.strictEqual(response.status, 400);
        assert.strictEqual(response.code, 'INVALID_BOOLEAN');
    }

    {
        const { handled, response } = await h.call('/api/v1/blog/auto/run-manual', 'POST', {
            body: { trendDate: 'not-a-date' }
        });
        assert.strictEqual(handled, true);
        assert.strictEqual(response.ok, false);
        assert.strictEqual(response.status, 400);
        assert.strictEqual(response.code, 'INVALID_TREND_DATE');
    }

    {
        const { handled, response } = await h.call('/api/v1/blog/auto/run-manual', 'POST', {
            body: {
                trendDate: '20260224',
                skipTrends: 'true',
                settingsOverrides: { NAVER_AUTO_MODE: true }
            }
        });
        assert.strictEqual(handled, true);
        assert.strictEqual(response.ok, true);
        assert.strictEqual(response.data.trendDate, '2026-02-24');
        assert.strictEqual(response.data.skipTrends, true);
    }

    {
        const { handled, response } = await h.call('/api/v1/auto/start', 'POST');
        assert.strictEqual(handled, true);
        assert.strictEqual(response.ok, false);
        assert.strictEqual(response.status, 409);
        assert.strictEqual(response.code, 'AUTO_POC_ONLY');
    }

    {
        const { handled } = await h.call('/api/v1/not-exists', 'GET');
        assert.strictEqual(handled, false);
    }

    console.log('✅ blog auto api smoke test passed');
}

run().catch((e) => {
    console.error('❌ blog auto api smoke test failed');
    console.error(e && e.stack ? e.stack : e);
    process.exit(1);
});
