'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createSiteHostingProjectRouteHandler } = require('./site-hosting-project.routes');

function createRouteHarness() {
    const projects = new Map();
    const responses = [];
    const handler = createSiteHostingProjectRouteHandler({
        service: {
            list: () => [...projects.values()],
            create: (payload) => {
                const project = { id: 'project-1', name: payload.name };
                projects.set(project.id, project);
                return project;
            },
            get: (id) => projects.get(id) || null
        },
        sendSuccess: async (_res, _requestId, data, status = 200) => responses.push({ status, data }),
        sendError: async (_res, _requestId, status, code, message) => responses.push({ status, code, message })
    });
    return { handler, responses };
}

const localContext = (overrides = {}) => ({
    method: 'GET',
    pathname: '/api/v1/site-hosting/projects',
    remoteAddress: '127.0.0.1',
    host: '127.0.0.1:4577',
    origin: 'http://127.0.0.1:4577',
    contentType: 'application/json',
    requestBody: {},
    res: {},
    ...overrides
});

test('site hosting project routes list, create, and load a project on the local app origin', async () => {
    const { handler, responses } = createRouteHarness();
    assert.equal(await handler(localContext({ method: 'POST', requestBody: { name: 'My Project' } })), true);
    assert.equal(responses[0].status, 201);
    assert.equal(responses[0].data.name, 'My Project');
    await handler(localContext());
    assert.equal(responses[1].data.length, 1);
    await handler(localContext({ pathname: '/api/v1/site-hosting/projects/project-1' }));
    assert.equal(responses[2].data.id, 'project-1');
});

test('site hosting project routes reject non-local and cross-origin mutations', async () => {
    const { handler, responses } = createRouteHarness();
    await handler(localContext({ method: 'POST', origin: 'https://attacker.example', requestBody: { name: 'Nope' } }));
    assert.equal(responses[0].status, 403);
    await handler(localContext({ remoteAddress: '192.0.2.1' }));
    assert.equal(responses[1].status, 403);
});
