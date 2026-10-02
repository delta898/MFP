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
            deploy: async (projectId, siteId) => { calls.push(['deploy', projectId, siteId]); return { url: 'https://bg-site.workers.dev/' }; }
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
    assert.deepEqual(calls, [['build', 'project-1', 'site-1'], ['startPreview', 'project-1', 'site-1'], ['stopPreview', 'project-1', 'site-1'], ['deploy', 'project-1', 'site-1']]);
    assert.deepEqual(responses.map((item) => item.status || item.stopped || item.url), ['succeeded', 'succeeded', 'http://127.0.0.1:43210/', true, 'https://bg-site.workers.dev/']);
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
