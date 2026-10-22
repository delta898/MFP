const test = require('node:test');
const assert = require('node:assert/strict');
const { createLicenseService } = require('./license-service');

test('license service gets device and key through injected host ports', async () => {
    const service = createLicenseService({
        Logger: { warn() {}, info() {}, debug() {}, error() {} },
        licenseApi: {},
        getHardwareId: () => 'device-1',
        getInitialLicenseKey: () => '  license-1  '
    });

    assert.deepEqual(await service.resolveAuthenticatedServerContext(), {
        success: true,
        licenseKey: 'license-1',
        hwid: 'device-1'
    });
});

test('license service bootstraps and persists a test key through injected ports', async () => {
    const persisted = [];
    const service = createLicenseService({
        Logger: { warn() {}, info() {}, debug() {}, error() {} },
        licenseApi: {
            issueTestLicense: async (hwid) => ({
                data: { success: true, license_key: `test-${hwid}` },
                error: null
            })
        },
        getHardwareId: () => 'device-2',
        persistLicenseKey: (licenseKey) => persisted.push(licenseKey),
        licenseKeyFilePath: '/user/config/license.key'
    });

    assert.deepEqual(await service.resolveAuthenticatedServerContext(), {
        success: true,
        licenseKey: 'test-device-2',
        hwid: 'device-2'
    });
    assert.deepEqual(persisted, ['test-device-2']);
});

test('license diagnostics record initialization and status failure without logging secrets', async () => {
    const entries = [];
    const secretKey = 'secret-license-key-value';
    const service = createLicenseService({
        Logger: {
            warn(message) { entries.push(['warn', message]); },
            info(message) { entries.push(['info', message]); },
            debug(message) { entries.push(['debug', message]); },
            error(message) { entries.push(['error', message]); }
        },
        licenseApi: {
            issueTestLicense: async () => ({
                data: { success: false, code: 'TEST_LICENSE_ALREADY_ISSUED', message: 'license secret-license-key-value unavailable' },
                error: null
            }),
            checkStatus: async () => ({ data: null, error: null })
        },
        getHardwareId: () => 'private-hardware-id',
        getInitialLicenseKey: () => '',
        licenseKeyDiagnostics: { source: 'missing', localFilePresent: false }
    });

    const result = await service.checkLicenseStatus({ quiet: true, force: true });

    assert.equal(result.success, false);
    assert.ok(entries.some(([, message]) => message.includes('source=missing') && message.includes('local_file_present=false')));
    assert.ok(entries.some(([, message]) => message.includes('TEST_LICENSE_ALREADY_ISSUED')));
    assert.ok(entries.some(([, message]) => message.includes('status check failed') && message.includes('TEST_LICENSE_ALREADY_ISSUED')));
    const allLogs = entries.map(([, message]) => message).join('\n');
    assert.equal(allLogs.includes(secretKey), false);
    assert.equal(allLogs.includes('private-hardware-id'), false);
});

test('license status logs server rejection code and message while redacting the license key', async () => {
    const entries = [];
    const secretKey = 'license-key-that-must-not-leak';
    const service = createLicenseService({
        Logger: {
            warn(message) { entries.push(message); },
            info(message) { entries.push(message); },
            debug(message) { entries.push(message); },
            error(message) { entries.push(message); }
        },
        licenseApi: {
            checkStatus: async () => ({
                data: { success: false, code: 'LICENSE_NOT_ACTIVE', message: `Key ${secretKey} is inactive.` },
                error: null
            })
        },
        getHardwareId: () => 'private-hardware-id',
        getInitialLicenseKey: () => secretKey,
        licenseKeyDiagnostics: { source: 'local_file', localFilePresent: true }
    });

    const result = await service.checkLicenseStatus({ quiet: true, force: true });

    assert.equal(result.success, false);
    assert.ok(entries.some((message) => message.includes('LICENSE_NOT_ACTIVE') && message.includes('[redacted]')));
    assert.equal(entries.join('\n').includes(secretKey), false);
    assert.equal(entries.join('\n').includes('private-hardware-id'), false);
});

test('license initialization exceptions are logged with a safe diagnostic code', async () => {
    const entries = [];
    const service = createLicenseService({
        Logger: {
            warn(message) { entries.push(message); },
            info(message) { entries.push(message); },
            debug(message) { entries.push(message); },
            error(message) { entries.push(message); }
        },
        licenseApi: {
            issueTestLicense: async () => {
                const error = new Error('temporary license service outage');
                error.code = 'NETWORK_DOWN';
                throw error;
            }
        },
        getHardwareId: () => 'private-hardware-id',
        getInitialLicenseKey: () => ''
    });

    const result = await service.checkLicenseStatus({ quiet: true, force: true });

    assert.equal(result.success, false);
    assert.ok(entries.some((message) => message.includes('initialization exception') && message.includes('NETWORK_DOWN')));
    assert.equal(entries.join('\n').includes('private-hardware-id'), false);
});
