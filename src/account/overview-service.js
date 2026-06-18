const os = require('os');
const { machineIdSync } = require('node-machine-id');

const FEATURE_LABELS = {
    cmd_pub: '블로그 발행',
    cmd_batch: '일괄·자동 발행',
    cmd_trends: '트렌드 수집',
    cmd_shopping: '쇼핑커넥트',
    image_generation: 'AI 이미지 생성',
    enable_related_posts_auto_link: '연관 글 자동 연결',
    enable_trends_date_override: '트렌드 날짜 지정'
};

function maskHardwareId(machineId, visibleSuffixLength = 8) {
    const raw = String(machineId || '').trim();
    if (!raw) return '';
    const suffixLength = Math.max(1, Number.parseInt(visibleSuffixLength, 10) || 8);
    return `******${raw.slice(-suffixLength)}`;
}

function normalizeConnection(status, extra = {}) {
    return {
        status: String(status || 'unknown').trim() || 'unknown',
        ...extra
    };
}

function buildFeatureItems(features = {}, limits = {}) {
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

    if (Number.isFinite(Number(limits.max_blog_posts_per_run))) {
        items.push({
            id: 'max_blog_posts_per_run',
            label: '블로그 회당 발행',
            enabled: Number(limits.max_blog_posts_per_run) > 0,
            value: Number(limits.max_blog_posts_per_run),
            unit: '건'
        });
    }
    if (Number.isFinite(Number(limits.max_shopping_posts_per_run))) {
        items.push({
            id: 'max_shopping_posts_per_run',
            label: '쇼핑 회당 발행',
            enabled: Number(limits.max_shopping_posts_per_run) > 0,
            value: Number(limits.max_shopping_posts_per_run),
            unit: '건'
        });
    }
    return items;
}

function createAccountOverviewService(deps = {}) {
    const {
        License,
        CONFIG = {},
        APP_VERSION = '',
        toFeatureMap = (value) => value || {},
        getFeatureInt = (_features, _key, fallback) => fallback,
        resolveMaxBlogPostsPerRun = () => 1,
        resolveMaxShoppingPostsPerRun = () => 1,
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

    async function getOverview({ quiet = true } = {}) {
        const [licenseStatus, naverSession] = await Promise.all([
            License.checkLicenseStatus({ quiet }),
            Promise.resolve()
                .then(() => checkNaverSessionForUi())
                .catch((error) => ({ ok: false, reason: 'check_failed', message: error.message }))
        ]);

        const hasLicenseContext = Boolean(
            licenseStatus?.planCode
            || licenseStatus?.planDisplayName
            || Number.isFinite(Number(licenseStatus?.remaining))
        );
        if (!licenseStatus?.success && !hasLicenseContext) {
            throw new Error(licenseStatus?.message || '라이선스 상태를 확인하지 못했습니다.');
        }

        const features = toFeatureMap(licenseStatus?.features || {});
        const limits = {
            max_blog_posts_per_run: getFeatureInt(features, 'max_blog_posts_per_run', resolveMaxBlogPostsPerRun()),
            max_shopping_posts_per_run: getFeatureInt(features, 'max_shopping_posts_per_run', resolveMaxShoppingPostsPerRun())
        };
        const usageLimit = Number.isFinite(Number(licenseStatus?.usageLimit)) ? Number(licenseStatus.usageLimit) : null;
        const usageCount = Number.isFinite(Number(licenseStatus?.usageCount)) ? Number(licenseStatus.usageCount) : null;
        const remaining = Number.isFinite(Number(licenseStatus?.remaining)) ? Number(licenseStatus.remaining) : null;
        const unlimited = usageLimit === -1 || remaining === -1;
        const quotaExhausted = !unlimited && remaining === 0 && licenseStatus?.success !== true;
        const planCode = String(licenseStatus?.planCode || '').trim().toLowerCase();

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
                email: null,
                email_verified: false,
                label: '기기 라이선스로 사용 중'
            },
            subscription: {
                plan_code: planCode,
                plan_name: String(licenseStatus?.planDisplayName || licenseStatus?.planCode || '').trim(),
                status: quotaExhausted ? 'quota_exhausted' : (licenseStatus?.success ? 'active' : 'unavailable'),
                billing_managed: false,
                created_at: String(licenseStatus?.createdAt || '').trim(),
                current_period_end: '',
                cancel_at_period_end: false,
                message: String(licenseStatus?.message || '').trim()
            },
            usage: {
                mode: unlimited ? 'unlimited' : 'metered',
                limit: usageLimit,
                used: usageCount,
                remaining,
                resets_at: '',
                cycle: planCode === 'free' ? 'monthly' : 'none'
            },
            capabilities: {
                features,
                limits,
                items: buildFeatureItems(features, limits)
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
            actions: [
                { id: 'register_email', enabled: false, label: '이메일 등록', reason: '계정 연결 기능을 준비 중입니다.' },
                { id: 'upgrade', enabled: false, label: '유료 플랜 준비 중', reason: '외부 결제 연동 후 제공됩니다.' },
                { id: 'manage_subscription', enabled: false, label: '구독 관리', reason: '결제 관리 기능을 준비 중입니다.' }
            ],
            generated_at: new Date().toISOString()
        };
    }

    return { getOverview };
}

module.exports = {
    FEATURE_LABELS,
    maskHardwareId,
    buildFeatureItems,
    createAccountOverviewService
};
