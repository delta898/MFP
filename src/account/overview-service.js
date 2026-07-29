const os = require('os');
const { machineIdSync } = require('node-machine-id');

const FEATURE_LABELS = {
    cmd_batch: '일괄·자동 발행',
    cmd_trends: '트렌드 수집',
    cmd_shopping: '쇼핑커넥트',
    enable_related_posts_auto_link: '연관 글 자동 연결',
    enable_sns_distribution: 'SNS 자동 발행'
};

function maskHardwareId(machineId, visibleSuffixLength = 8) {
    const raw = String(machineId || '').trim();
    if (!raw) return '';
    const suffixLength = Math.max(1, Number.parseInt(visibleSuffixLength, 10) || 8);
    return `******${raw.slice(-suffixLength)}`;
}

function maskEmail(email) {
    const raw = String(email || '').trim().toLowerCase();
    if (!raw || !raw.includes('@')) return '';
    const [localPart, domainPart] = raw.split('@');
    if (!localPart || !domainPart) return '';
    const visibleLocal = localPart.length <= 2 ? localPart.slice(0, 1) : localPart.slice(0, 2);
    return `${visibleLocal}***@${domainPart}`;
}

function normalizeConnection(status, extra = {}) {
    return {
        status: String(status || 'unknown').trim() || 'unknown',
        ...extra
    };
}

function buildFeatureItems(features = {}) {
    const items = [];
    Object.entries(FEATURE_LABELS).forEach(([key, label]) => {
        if (!Object.prototype.hasOwnProperty.call(features, key)) return;
        const raw = features[key];
        items.push({
            id: key,
            label,
            enabled: raw === true || raw === 1 || String(raw).toLowerCase() === 'true',
            value: raw
        });
    });

    return items;
}

function normalizeUsageReadModel(licenseStatus = {}) {
    const rawLimit = Number(licenseStatus?.usageLimit);
    const rawUsed = Number(licenseStatus?.usageCount);
    const rawRemaining = Number(licenseStatus?.remaining);
    const rawCreditBalance = Number(
        licenseStatus?.creditBalance
        ?? licenseStatus?.credit_balance
        ?? licenseStatus?.creditUnits
        ?? licenseStatus?.credit_units
        ?? 0
    );
    const remaining = Number.isFinite(rawRemaining) ? rawRemaining : null;
    const unlimited = rawLimit === -1 || remaining === -1;
    const exhausted = !unlimited && remaining === 0 && licenseStatus?.success !== true;
    const creditBalance = Number.isFinite(rawCreditBalance) && rawCreditBalance > 0 ? rawCreditBalance : 0;

    if (unlimited) {
        return {
            mode: 'unlimited',
            limit: -1,
            used: Number.isFinite(rawUsed) ? rawUsed : null,
            remaining: -1,
            creditBalance,
            totalAvailable: -1,
            exhausted
        };
    }

    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : null;
    const used = Number.isFinite(rawUsed) && rawUsed >= 0 ? rawUsed : null;
    const monthlyRemaining = Number.isFinite(remaining) && remaining > 0 ? remaining : 0;

    return {
        mode: 'metered',
        limit,
        used,
        remaining,
        creditBalance,
        totalAvailable: monthlyRemaining + creditBalance,
        exhausted
    };
}

function normalizeQuotaCycle(licenseStatus = {}, planCode = '') {
    const raw = String(licenseStatus?.quotaCycle || '').trim().toLowerCase();
    if (raw) return raw;
    return planCode === 'free' ? 'monthly' : 'none';
}

function buildAccountActions({ planCode, usage, hasVerifiedEmail = false } = {}) {
    const actions = [
        {
            id: 'register_email',
            enabled: true,
            label: hasVerifiedEmail ? '이메일 변경' : '이메일 등록',
            reason: hasVerifiedEmail
                ? '새 이메일 인증 후 라이선스 복구 이메일을 변경합니다.'
                : '이메일 인증 후 라이선스 복구와 플랜 관리에 사용합니다.',
            mode: hasVerifiedEmail ? 'change' : 'register',
            requires_email: true
        },
        { id: 'upgrade', enabled: false, label: '유료 플랜 준비 중', reason: '외부 결제 연동 후 제공됩니다.' },
        { id: 'manage_subscription', enabled: false, label: '구독 관리', reason: '결제 관리 기능을 준비 중입니다.' },
        { id: 'change_plan', enabled: false, label: '구독 / 플랜 변경', reason: '구독 결제 기능을 준비 중입니다.' },
        { id: 'purchase_credits', enabled: false, label: '크레딧 충전', reason: '크레딧 결제 기능을 준비 중입니다.' }
    ];

    if (planCode === 'test' && usage?.exhausted) {
        actions.push({
            id: 'upgrade_free',
            enabled: true,
            label: 'Free Plan으로 전환',
            reason: 'Tester Plan 사용량을 모두 사용했습니다. 이메일 확인 후 Free Plan으로 전환할 수 있습니다.',
            target_plan: 'free',
            requires_email: true
        });
    }

    return actions;
}

function createAccountOverviewService(deps = {}) {
    const {
        License,
        CONFIG = {},
        APP_VERSION = '',
        toFeatureMap = (value) => value || {},
        checkNaverSessionForUi = async () => ({ ok: false, reason: 'unknown', message: '' }),
        resolveMachineId = () => machineIdSync({ original: true }),
        runtimeVersions = process.versions,
        platform = process.platform,
        architecture = process.arch,
        osRelease = () => os.release()
    } = deps;

    if (!License || typeof License.checkLicenseStatus !== 'function') {
        throw new Error('License.checkLicenseStatus is required');
    }

    async function getOverview({ quiet = true, force = false } = {}) {
        const [licenseStatus, naverSession] = await Promise.all([
            License.checkLicenseStatus({ quiet, force }),
            Promise.resolve()
                .then(() => checkNaverSessionForUi())
                .catch((error) => ({ ok: false, reason: 'check_failed', message: error.message }))
        ]);

        const hasLicenseContext = Boolean(
            licenseStatus?.planCode
            || licenseStatus?.planDisplayName
            || Number.isFinite(Number(licenseStatus?.remaining))
        );
        if (licenseStatus?.code === 'LICENSE_FEATURE_POLICY_INVALID') {
            throw new Error(licenseStatus.message || '라이선스 기능 정책이 올바르지 않습니다.');
        }
        if (!licenseStatus?.success && !hasLicenseContext) {
            throw new Error(licenseStatus?.message || '라이선스 상태를 확인하지 못했습니다.');
        }

        const features = toFeatureMap(licenseStatus?.features || {});
        const usage = normalizeUsageReadModel(licenseStatus);
        const planCode = String(licenseStatus?.planCode || '').trim().toLowerCase();
        const quotaCycle = normalizeQuotaCycle(licenseStatus, planCode);
        const email = String(licenseStatus?.email || '').trim().toLowerCase();
        const hasVerifiedEmail = Boolean(email);
        const actions = buildAccountActions({ planCode, usage, hasVerifiedEmail });

        let hardwareId = '';
        try {
            hardwareId = maskHardwareId(resolveMachineId());
        } catch (_ignore) { }

        const googleConfigured = Boolean(String(CONFIG.GOOGLE_SHEET_URL || CONFIG.GOOGLE_SHEET_ID || '').trim());
        const wordpressConfigured = Boolean(
            String(CONFIG.WORDPRESS_URL || '').trim()
            && String(CONFIG.WORDPRESS_USER_ID || '').trim()
            && String(CONFIG.WORDPRESS_APP_PASSWORD || '').trim()
        );

        return {
            identity: {
                type: 'device_license',
                account_id: null,
                email,
                email_masked: maskEmail(email),
                email_verified: hasVerifiedEmail,
                label: hasVerifiedEmail ? '이메일 연결됨' : '기기 라이선스로 사용 중',
                purpose: '라이선스 복구와 플랜 관리에 사용됩니다.'
            },
            subscription: {
                plan_code: planCode,
                plan_name: String(licenseStatus?.planDisplayName || licenseStatus?.planCode || '').trim(),
                status: usage.exhausted ? 'quota_exhausted' : (licenseStatus?.success ? 'active' : 'unavailable'),
                billing_managed: false,
                created_at: String(licenseStatus?.createdAt || '').trim(),
                current_period_end: '',
                cancel_at_period_end: false,
                message: String(licenseStatus?.message || '').trim()
            },
            usage: {
                mode: usage.mode,
                limit: usage.limit,
                used: usage.used,
                remaining: usage.remaining,
                monthly_limit: quotaCycle === 'monthly' ? usage.limit : null,
                monthly_used: quotaCycle === 'monthly' ? usage.used : null,
                monthly_remaining: quotaCycle === 'monthly' ? usage.remaining : null,
                credit_balance: usage.creditBalance,
                total_available: usage.totalAvailable,
                resets_at: String(licenseStatus?.nextResetAt || '').trim(),
                current_period_start_at: String(licenseStatus?.currentPeriodStartAt || '').trim(),
                cycle: quotaCycle
            },
            capabilities: {
                features,
                items: buildFeatureItems(features)
            },
            device: {
                hw_id: hardwareId,
                platform: String(platform || '').trim(),
                arch: String(architecture || '').trim(),
                os_release: String(osRelease() || '').trim(),
                app_version: String(APP_VERSION || '').trim(),
                node_version: String(runtimeVersions?.node || '').trim(),
                electron_version: String(runtimeVersions?.electron || '').trim()
            },
            connections: {
                naver: normalizeConnection(naverSession?.ok ? 'connected' : 'not_connected', {
                    reason: String(naverSession?.reason || '').trim(),
                    message: String(naverSession?.message || '').trim(),
                    checked_at: new Date().toISOString()
                }),
                google_sheets: normalizeConnection(googleConfigured ? 'configured' : 'not_configured'),
                wordpress: normalizeConnection(wordpressConfigured ? 'configured' : 'not_configured')
            },
            actions,
            generated_at: new Date().toISOString()
        };
    }

    return { getOverview };
}

module.exports = {
    FEATURE_LABELS,
    maskHardwareId,
    maskEmail,
    buildFeatureItems,
    normalizeUsageReadModel,
    normalizeQuotaCycle,
    buildAccountActions,
    createAccountOverviewService
};
