'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createPlugin } = require('./index');

function createAxios(responses = []) {
    const calls = [];
    return {
        calls,
        async post(url, body, config) {
            calls.push({ url, body, config });
            const next = responses.shift();
            if (next instanceof Error) throw next;
            return next;
        }
    };
}

test('Social Publisher operation implementations match the manifest', () => {
    const plugin = createPlugin({ getCredentials: async () => ({ apiKey: 'secret-key' }) });
    assert.deepEqual(
        Object.keys(plugin.operations).sort(),
        Object.keys(plugin.manifest.operations).sort()
    );
    assert.ok(plugin.operations['publications.publish']);
    assert.equal(plugin.operations['publications.publish-many'], undefined);
});

test('Social Publisher owns provider auth and uses Host credentials for regular operations', async () => {
    const axios = createAxios([{ data: { data: { account: { organizations: [{ id: 'org-1', name: 'Team' }] } } } }]);
    const plugin = createPlugin({ axios, getCredentials: async () => ({ apiKey: 'host-secret' }) });
    const result = await plugin.operations['connection.inspect'].execute({ workspaceId: '' });

    assert.deepEqual(result.organizations, [{ id: 'org-1', name: 'Team' }]);
    assert.equal(axios.calls[0].config.headers.Authorization, 'Bearer host-secret');
});

test('connection inspection accepts a transient key without changing Host credentials', async () => {
    const axios = createAxios([{ data: { data: { account: { organizations: [{ id: 'org-1', name: 'Team' }] } } } }]);
    const plugin = createPlugin({ axios, getCredentials: async () => ({ apiKey: 'saved-secret' }) });
    await plugin.operations['connection.inspect'].execute({ apiKey: 'candidate-secret' });

    assert.equal(axios.calls[0].config.headers.Authorization, 'Bearer candidate-secret');
});

test('Social Publisher requires Host credentials when no transient key is provided', async () => {
    const plugin = createPlugin({ axios: createAxios(), getCredentials: async () => ({}) });
    await assert.rejects(
        () => plugin.operations['publications.get-by-ids'].execute({ postIds: [] }),
        (error) => error.code === 'BUFFER_API_KEY_REQUIRED'
    );
});
