const test = require('node:test');
const assert = require('node:assert/strict');

const { createSettingsController } = require('../controllers/settings.controller');
const { createSettingsRouteHandler } = require('./settings.routes');

function createHarness() {
    const calls = [];
    const service = {
        async getWritingProfile() {
            calls.push(['get']);
            return { active_profile: 'default' };
        },
        async saveWritingProfile(body) {
            calls.push(['save', body]);
            return { active_profile: body.active_profile };
        },
        async useDefaultWritingProfile() {
            calls.push(['use-default']);
            return { active_profile: 'default' };
        }
    };
    const responses = [];
    const controller = createSettingsController({
        service,
        sendSuccess: (_res, requestId, data) => responses.push({ ok: true, requestId, data }),
        sendError: (_res, requestId, status, code, message) => responses.push({ ok: false, requestId, status, code, message })
    });
    return { calls, responses, handler: createSettingsRouteHandler({ controller }) };
}

test('writing profile route supports GET and PUT', async () => {
    const harness = createHarness();
    assert.equal(await harness.handler({ pathname: '/api/v1/settings/writing-profile', method: 'GET', requestId: 'get-1' }), true);
    assert.equal(await harness.handler({
        pathname: '/api/v1/settings/writing-profile',
        method: 'PUT',
        requestId: 'put-1',
        requestBody: { active_profile: 'custom' }
    }), true);
    assert.deepEqual(harness.calls, [['get'], ['save', { active_profile: 'custom' }]]);
    assert.equal(harness.responses[1].data.active_profile, 'custom');
});

test('use-default route supports POST and rejects other methods', async () => {
    const harness = createHarness();
    assert.equal(await harness.handler({
        pathname: '/api/v1/settings/writing-profile/use-default',
        method: 'POST',
        requestId: 'default-1'
    }), true);
    assert.equal(harness.responses[0].data.active_profile, 'default');

    await harness.handler({
        pathname: '/api/v1/settings/writing-profile/use-default',
        method: 'GET',
        requestId: 'bad-method'
    });
    assert.equal(harness.responses[1].status, 405);
    assert.equal(harness.responses[1].code, 'METHOD_NOT_ALLOWED');
});

test('unrelated settings path is not handled', async () => {
    const harness = createHarness();
    assert.equal(await harness.handler({ pathname: '/api/v1/settings/unknown', method: 'GET' }), false);
});
