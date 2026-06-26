const test = require('node:test');
const assert = require('node:assert/strict');

const {
    maskHardwareId,
    maskEmail,
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
                        cmd_batch: true,
                        cmd_trends: false,
                        cmd_shopping: false,
                        enable_related_posts_auto_link: false
                    }
                };
            }
        },
        CONFIG: {
            GOOGLE_SHEET_URL: 'https://docs.google.com/spreadsheets/d/example',
            WORDPRESS_URL: ''
        },
        APP_VERSION: '0.1.13',
        toFeatureMap: (value) => ({ ...value }),
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

test('maskEmail exposes only a small local-part prefix', () => {
    assert.equal(maskEmail('Delta898@Gmail.com'), 'de***@gmail.com');
    assert.equal(maskEmail('a@example.com'), 'a***@example.com');
    assert.equal(maskEmail('invalid'), '');
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
        current_period_start_at: '',
        cycle: 'monthly'
    });
    assert.equal(overview.device.hw_id, '******not-leak');
    assert.equal(JSON.stringify(overview).includes('raw-machine-id-must-not-leak'), false);
    assert.equal(overview.connections.naver.status, 'connected');
    assert.equal(overview.connections.google_sheets.status, 'configured');
    assert.equal(overview.connections.wordpress.status, 'not_configured');
    assert.deepEqual(overview.capabilities.items.map((item) => item.id), [
        'cmd_batch',
        'cmd_trends',
        'cmd_shopping',
        'enable_related_posts_auto_link'
    ]);
    assert.equal(overview.actions.find((item) => item.id === 'upgrade').enabled, false);
    assert.equal(overview.actions.find((item) => item.id === 'register_email').label, '이메일 등록');
    assert.equal(overview.actions.find((item) => item.id === 'register_email').enabled, true);
});

test('account overview exposes a verified email contact when license has email', async () => {
    const service = createService({
        License: {
            async checkLicenseStatus() {
                return {
                    success: true,
                    message: 'ok',
                    planCode: 'free',
                    planDisplayName: 'Free',
                    email: 'delta898@gmail.com',
                    quotaCycle: 'monthly',
                    currentPeriodStartAt: '2026-06-01T00:00:00Z',
                    nextResetAt: '2026-07-01T00:00:00Z',
                    usageLimit: 20,
                    usageCount: 0,
                    remaining: 20,
                    features: {
                        cmd_batch: true,
                        cmd_trends: false,
                        cmd_shopping: false,
                        enable_related_posts_auto_link: false
                    }
                };
            }
        }
    });

    const overview = await service.getOverview();
    assert.equal(overview.identity.label, '이메일 연결됨');
    assert.equal(overview.identity.email, 'delta898@gmail.com');
    assert.equal(overview.identity.email_masked, 'de***@gmail.com');
    assert.equal(overview.identity.email_verified, true);
    assert.equal(overview.usage.cycle, 'monthly');
    assert.equal(overview.usage.current_period_start_at, '2026-06-01T00:00:00Z');
    assert.equal(overview.usage.resets_at, '2026-07-01T00:00:00Z');
    assert.equal(overview.actions.find((item) => item.id === 'register_email').label, '이메일 변경');
    assert.equal(overview.actions.find((item) => item.id === 'register_email').mode, 'change');
});

test('account overview forwards force refresh to license status', async () => {
    const calls = [];
    const service = createService({
        License: {
            async checkLicenseStatus(options) {
                calls.push(options);
                return {
                    success: true,
                    message: 'ok',
                    planCode: 'free',
                    planDisplayName: 'Free',
                    usageLimit: 20,
                    usageCount: 0,
                    remaining: 20,
                    features: {
                        cmd_batch: true,
                        cmd_trends: false,
                        cmd_shopping: false,
                        enable_related_posts_auto_link: false
                    }
                };
            }
        }
    });

    await service.getOverview({ quiet: true, force: true });
    assert.equal(calls[0].force, true);
    assert.equal(calls[0].quiet, true);
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
    assert.equal(overview.actions.find((item) => item.id === 'upgrade_free')?.enabled, true);
});

test('account overview does not render a zero usage limit as a real quota', async () => {
    const service = createService({
        License: {
            async checkLicenseStatus() {
                return {
                    success: false,
                    message: 'test 플랜 1회 사용이 종료되었습니다.',
                    planCode: 'test',
                    planDisplayName: 'Tester',
                    usageLimit: 0,
                    usageCount: 0,
                    remaining: 0,
                    features: {}
                };
            }
        }
    });

    const overview = await service.getOverview();
    assert.equal(overview.subscription.status, 'quota_exhausted');
    assert.equal(overview.usage.limit, null);
    assert.equal(overview.usage.used, 0);
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

test('account overview rejects invalid feature policy even with plan context', async () => {
    const service = createService({
        License: {
            async checkLicenseStatus() {
                return {
                    success: false,
                    code: 'LICENSE_FEATURE_POLICY_INVALID',
                    message: '라이선스 기능 정책이 올바르지 않습니다.',
                    planCode: 'free',
                    remaining: 10
                };
            }
        }
    });

    await assert.rejects(() => service.getOverview(), /기능 정책이 올바르지 않습니다/);
});
