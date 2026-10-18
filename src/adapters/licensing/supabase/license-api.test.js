const test = require('node:test');
const assert = require('node:assert/strict');
const { createSupabaseLicenseApi } = require('./license-api');

function createFakeClient() {
    const calls = [];
    return {
        calls,
        rpc(name, args) {
            calls.push({ type: 'rpc', name, args });
            return Promise.resolve({ data: { success: true }, error: null });
        },
        functions: {
            invoke(name, options) {
                calls.push({ type: 'function', name, options });
                return Promise.resolve({ data: { success: true }, error: null });
            }
        }
    };
}

test('licensing adapter translates registration and quota operations to Supabase protocol', async () => {
    const client = createFakeClient();
    const api = createSupabaseLicenseApi({ client });

    await api.requestRegistrationCode('person@example.com');
    await api.publishQuota('reserve_publish_quota', { p_operation_id: 'op-1' });

    assert.deepEqual(client.calls, [
        {
            type: 'rpc',
            name: 'request_license_registration',
            args: { p_email: 'person@example.com' }
        },
        {
            type: 'rpc',
            name: 'reserve_publish_quota',
            args: { p_operation_id: 'op-1' }
        }
    ]);
});

test('licensing adapter rejects unknown quota operations before provider calls', async () => {
    const client = createFakeClient();
    const api = createSupabaseLicenseApi({ client });

    assert.throws(() => api.publishQuota('delete_license', {}), /Unsupported publish quota operation/);
    assert.equal(client.calls.length, 0);
});

test('licensing adapter sends Edge Function calls through the provider functions client', async () => {
    const client = createFakeClient();
    const api = createSupabaseLicenseApi({ client });
    const payload = { email: 'person@example.com', code: '123456' };

    await api.sendRegistrationCode(payload);

    assert.deepEqual(client.calls, [{
        type: 'function',
        name: 'send-license-code',
        options: { body: payload }
    }]);
});
