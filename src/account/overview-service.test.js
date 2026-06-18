const test = require('node:test');
const assert = require('node:assert/strict');

const {
    maskHardwareId,
    createAccountOverviewService
} = require('./overview-service');

function createService(overrides = {}) {
    return createAccountOverviewService({
        License: {
            async checkLicenseStatus() {
                return {
                    success: true,
                    message: 'ok',
                    planCode: 'free',
                    planDisplayName: 'Free',
                    createdAt: '2026-06-01T00:00:00Z',
                    usageLimit: 15,
                    usageCount: 3,
                    remaining: 12,
                    features: {
                        cmd_pub: true,
                        cmd_shopping: false,
                        max_blog_posts_per_run: 3
                    }
                };
            }
        },
        CONFIG: {
            GOOGLE_SHEET_URL: 'https://docs.google.com/spreadsheets/d/example',
            WORDPRESS_URL: ''
        },
        APP_VERSION: '0.1.13-dev1',
        toFeatureMap: (value) => ({ ...value }),
        getFeatureInt: (features, key, fallback) => Number(features[key] ?? fallback),
        resolveMaxBlogPostsPerRun: () => 1,
        resolveMaxShoppingPostsPerRun: () => 1,
        checkNaverSessionForUi: async () => ({ ok: true, reason: '', message: 'valid' }),
        resolveMachineId: () => 'raw-machine-id-must-not-leak',
        runtimeVersions: { node: '24.16.0', electron: '40.6.1' },
        platform: 'darwin',
        architecture: 'arm64',
        osRelease: () => '25.0.0',
        ...overrides
    });
}

test('maskHardwareId exposes only the original hardware ID suffix', () => {
    const hardwareId = maskHardwareId('0123456789abcdef');
    assert.equal(hardwareId, '******89abcdef');
    assert.equal(hardwareId.includes('01234567'), false);
});

test('account overview exposes subscription, usage, device, and connection read models', async () => {
    const overview = await createService().getOverview();

    assert.equal(overview.identity.type, 'device_license');
    assert.equal(overview.subscription.plan_code, 'free');
    assert.equal(overview.subscription.status, 'active');
    assert.deepEqual(overview.usage, {
        mode: 'metered',
        limit: 15,
        used: 3,
        remaining: 12,
        resets_at: '',
        cycle: 'monthly'
    });
    assert.equal(overview.device.hw_id, '******not-leak');
    assert.equal(JSON.stringify(overview).includes('raw-machine-id-must-not-leak'), false);
    assert.equal(overview.connections.naver.status, 'connected');
    assert.equal(overview.connections.google_sheets.status, 'configured');
    assert.equal(overview.connections.wordpress.status, 'not_configured');
    assert.equal(overview.actions.find((item) => item.id === 'upgrade').enabled, false);
});

test('account overview keeps exhausted license context available to the UI', async () => {
    const service = createService({
        License: {
            async checkLicenseStatus() {
                return {
                    success: false,
                    message: '라이선스 사용 횟수를 모두 사용했습니다.',
                    planCode: 'test',
                    planDisplayName: 'Tester',
                    usageLimit: 20,
                    usageCount: 20,
                    remaining: 0,
                    features: {}
                };
            }
        }
    });

    const overview = await service.getOverview();
    assert.equal(overview.subscription.status, 'quota_exhausted');
    assert.equal(overview.usage.remaining, 0);
});

test('account overview rejects failures with no usable license context', async () => {
    const service = createService({
        License: {
            async checkLicenseStatus() {
                return { success: false, message: '서버 연결 실패' };
            }
        }
    });

    await assert.rejects(() => service.getOverview(), /서버 연결 실패/);
});
