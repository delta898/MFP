'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createSiteHostingSiteRouteHandler } = require('./site-hosting-site.routes');

test('site routes expose the local template catalog and create/list sites for a project', async () => {
    const calls = [];
    const responses = [];
    const handler = createSiteHostingSiteRouteHandler({
        service: {
            listTemplates: () => [{ id: 'minimal-homepage' }],
            list: (projectId) => { calls.push(['list', projectId]); return []; },
            create: (projectId, payload) => { calls.push(['create', projectId, payload]); return { id: 'site-1', ...payload }; }
        },
        sendSuccess: async (_res, _id, data, status = 200) => responses.push({ data, status }),
        sendError: async (_res, _id, status, code) => responses.push({ status, code })
    });
    const base = { remoteAddress: '127.0.0.1', host: '127.0.0.1:43127', origin: 'http://127.0.0.1:43127' };
    assert.equal(await handler({ ...base, method: 'GET', pathname: '/api/v1/site-hosting/templates' }), true);
    assert.deepEqual(responses.pop(), { data: [{ id: 'minimal-homepage' }], status: 200 });
    assert.equal(await handler({ ...base, method: 'GET', pathname: '/api/v1/site-hosting/projects/project-1/sites' }), true);
    assert.equal(await handler({ ...base, method: 'POST', contentType: 'application/json', pathname: '/api/v1/site-hosting/projects/project-1/sites', requestBody: { name: '개인 블로그', template_id: 'minimal-homepage' } }), true);
    assert.deepEqual(calls, [
        ['list', 'project-1'],
        ['create', 'project-1', { name: '개인 블로그', template_id: 'minimal-homepage' }]
    ]);
    assert.equal(responses.pop().status, 201);
});

test('site routes build, preview, and deploy a site', async () => {
    const calls = [];
    const responses = [];
    const handler = createSiteHostingSiteRouteHandler({
        service: {
            build: async (projectId, siteId) => { calls.push(['build', projectId, siteId]); return { status: 'succeeded' }; },
            getBuildStatus: (projectId, siteId) => ({ project_id: projectId, site_id: siteId, status: 'succeeded' }),
            startPreview: async (projectId, siteId) => { calls.push(['startPreview', projectId, siteId]); return { url: 'http://127.0.0.1:43210/' }; },
            stopPreview: async (projectId, siteId) => { calls.push(['stopPreview', projectId, siteId]); return { stopped: true }; },
            deploy: async (projectId, siteId) => { calls.push(['deploy', projectId, siteId]); return { url: 'https://bg-site.workers.dev/' }; },
            openBuildFolder: async (projectId, siteId) => { calls.push(['openBuildFolder', projectId, siteId]); return { opened: true }; }
        },
        sendSuccess: async (_res, _id, data) => responses.push(data),
        sendError: async (_res, _id, status, code) => responses.push({ status, code })
    });
    const base = { remoteAddress: '127.0.0.1', host: '127.0.0.1:43127', origin: 'http://127.0.0.1:43127' };
    const path = '/api/v1/site-hosting/projects/project-1/sites/site-1';
    await handler({ ...base, method: 'POST', contentType: 'application/json', pathname: `${path}/build` });
    await handler({ ...base, method: 'GET', pathname: `${path}/build-status` });
    await handler({ ...base, method: 'POST', contentType: 'application/json', pathname: `${path}/preview` });
    await handler({ ...base, method: 'DELETE', pathname: `${path}/preview` });
    await handler({ ...base, method: 'POST', contentType: 'application/json', pathname: `${path}/deploy` });
    await handler({ ...base, method: 'POST', contentType: 'application/json', pathname: `${path}/open-folder` });
    assert.deepEqual(calls, [['build', 'project-1', 'site-1'], ['startPreview', 'project-1', 'site-1'], ['stopPreview', 'project-1', 'site-1'], ['deploy', 'project-1', 'site-1'], ['openBuildFolder', 'project-1', 'site-1']]);
    assert.deepEqual(responses.map((item) => item.status || item.stopped || item.opened || item.url), ['succeeded', 'succeeded', 'http://127.0.0.1:43210/', true, 'https://bg-site.workers.dev/', true]);
});

test('site routes create and clean up a temporary site preview draft', async () => {
    const calls = [];
    const responses = [];
    const handler = createSiteHostingSiteRouteHandler({
        service: {
            previewDraft: async (projectId, payload) => { calls.push(['previewDraft', projectId, payload]); return { id: 'draft-1', url: 'http://127.0.0.1:43210/' }; },
            stopDraftPreview: async (projectId, draftId) => { calls.push(['stopDraftPreview', projectId, draftId]); return { stopped: true }; }
        },
        sendSuccess: async (_res, _id, data) => responses.push(data),
        sendError: async (_res, _id, status, code) => responses.push({ status, code })
    });
    const base = { remoteAddress: '127.0.0.1', host: '127.0.0.1:43127', origin: 'http://127.0.0.1:43127' };
    await handler({ ...base, method: 'POST', contentType: 'application/json', pathname: '/api/v1/site-hosting/projects/project-1/preview-drafts', requestBody: { name: 'Draft', template_id: 'minimal-homepage' } });
    await handler({ ...base, method: 'DELETE', pathname: '/api/v1/site-hosting/projects/project-1/preview-drafts/draft-1' });
    assert.deepEqual(calls, [
        ['previewDraft', 'project-1', { name: 'Draft', template_id: 'minimal-homepage' }],
        ['stopDraftPreview', 'project-1', 'draft-1']
    ]);
    assert.deepEqual(responses, [{ id: 'draft-1', url: 'http://127.0.0.1:43210/' }, { stopped: true }]);
});

test('site settings routes read and apply settings without using the legacy metadata update', async () => {
    const calls = [];
    const responses = [];
    const handler = createSiteHostingSiteRouteHandler({
        service: {
            getSettings: (projectId, siteId) => { calls.push(['getSettings', projectId, siteId]); return { id: siteId, name: 'Site' }; },
            applySettings: async (projectId, siteId, payload) => { calls.push(['applySettings', projectId, siteId, payload]); return { id: siteId, screenshot: { build_id: 'build-1' } }; }
        },
        sendSuccess: async (_res, _id, data) => responses.push(data),
        sendError: async (_res, _id, status, code) => responses.push({ status, code })
    });
    const base = { remoteAddress: '127.0.0.1', host: '127.0.0.1:43127', origin: 'http://127.0.0.1:43127' };
    const pathname = '/api/v1/site-hosting/projects/project-1/sites/site-1';
    await handler({ ...base, method: 'GET', pathname });
    await handler({ ...base, method: 'PUT', contentType: 'application/json', pathname, requestBody: { name: 'Updated' } });
    assert.deepEqual(calls, [
        ['getSettings', 'project-1', 'site-1'],
        ['applySettings', 'project-1', 'site-1', { name: 'Updated' }]
    ]);
    assert.deepEqual(responses, [{ id: 'site-1', name: 'Site' }, { id: 'site-1', screenshot: { build_id: 'build-1' } }]);
});

test('site routes reject requests outside the local same-origin app', async () => {
    const responses = [];
    const handler = createSiteHostingSiteRouteHandler({
        service: { listTemplates: () => [] },
        sendSuccess: async () => assert.fail('unexpected success'),
        sendError: async (_res, _id, status, code) => responses.push({ status, code })
    });
    assert.equal(await handler({
        method: 'POST', pathname: '/api/v1/site-hosting/projects/project-1/sites',
        remoteAddress: '203.0.113.4', host: '127.0.0.1:43127', origin: 'http://127.0.0.1:43127', contentType: 'application/json'
    }), true);
    assert.deepEqual(responses, [{ status: 403, code: 'LOCAL_SITE_MANAGEMENT_REQUIRED' }]);
});

test('site screenshot route serves stored preview bytes from the local app', async () => {
    const response = { headers: null, body: null, writeHead(status, headers) { this.status = status; this.headers = headers; }, end(body) { this.body = body; } };
    const expected = Buffer.from('preview-image');
    const handler = createSiteHostingSiteRouteHandler({
        service: { getScreenshot: () => ({ buffer: expected, contentType: 'image/jpeg' }) },
        sendSuccess: async () => assert.fail('screenshot should be served as bytes'),
        sendError: async (_res, _id, status, code) => { response.status = status; response.body = code; }
    });
    const handled = await handler({
        method: 'GET',
        pathname: '/api/v1/site-hosting/projects/default/sites/home/screenshot',
        remoteAddress: '127.0.0.1', host: '127.0.0.1:43127', origin: 'http://127.0.0.1:43127',
        res: response
    });
    assert.equal(handled, true);
    assert.equal(response.status, 200);
    assert.equal(response.headers['Content-Type'], 'image/jpeg');
    assert.equal(response.headers['Cache-Control'], 'no-store');
    assert.equal(response.body, expected);
});
