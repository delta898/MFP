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
