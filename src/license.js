const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { machineIdSync } = require('node-machine-id');
const CONFIG = require('./config-loader');
const Logger = require('./logger');
const { validateLicenseFeaturePolicy } = require('./license-feature-policy');

// Supabase 클라이언트 초기화 (설정 누락 시 null 처리하여 안전하게 기동)
let supabase = null;
if (CONFIG.LICENSE_CHK_URL && CONFIG.LICENSE_CHK_KEY) {
    supabase = createClient(CONFIG.LICENSE_CHK_URL, CONFIG.LICENSE_CHK_KEY);
} else {
    Logger.warn("⚠️ 라이선스 서버 설정이 누락되었습니다.");
}

function resolveLicenseKey(rawKey) {
    return String(rawKey || '').trim();
}

/**
 * Supabase 502 등 HTTP 오류 시 error.message에 HTML 본문이 그대로 담기는 것을 방어한다.
 * HTML 태그를 감지하면 간결한 메시지로 대체하고, 그 외 긴 메시지는 200자로 자른다.
 */
function sanitizeErrorMessage(msg) {
    const str = String(msg || '').trim();
    if (/<(!DOCTYPE|html|head|body|div|title)/i.test(str)) {
        return 'HTTP 오류 응답 수신 (라이선스 서버 일시 불가)';
    }
    return str.length > 200 ? str.slice(0, 200) + '…' : str;
}

function formatPlanLabel(planCode, planDisplayName) {
    const display = String(planDisplayName || '').trim();
    if (display) return display;
    const code = String(planCode || '').trim();
    return code || '';
}

function formatPlanRemaining(planCode, planDisplayName, remaining) {
    const planLabel = formatPlanLabel(planCode, planDisplayName) || 'Unknown plan';
    if (typeof remaining === 'number' && remaining < 0) {
        return `${planLabel} 잔여: 무제한`;
    }
    return `${planLabel} 잔여: ${remaining ?? 'N/A'}회`;
}

function buildMessageWithPlan(baseMessage, planCode, planDisplayName) {
    const message = String(baseMessage || '').trim();
    const planLabel = formatPlanLabel(planCode, planDisplayName);
    if (!planLabel) return message;
    if (message.includes('(플랜:')) return message;
    return `${message} (플랜: ${planLabel})`;
}

function sanitizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeOptionalEmail(email) {
    const normalized = sanitizeEmail(email);
    return isValidEmail(normalized) ? normalized : '';
}

async function sendLicenseRegistrationEmail(email, code, ttlSeconds, expiresAt = '') {
    if (!supabase) {
        return { success: false, message: '라이선스 서버 설정 오류' };
    }

    try {
        const { data, error } = await supabase.functions.invoke('send-license-code', {
            body: {
                email,
                code,
                ttlSeconds,
                expiresAt
            }
        });

        if (error) {
            let detail = '';
            let providerStatus = '';
            try {
                if (error.context) {
                    const cloned = error.context.clone ? error.context.clone() : error.context;
                    const parsed = await cloned.json();
                    if (parsed && typeof parsed === 'object') {
                        providerStatus = parsed.provider_status ? String(parsed.provider_status) : '';
                        const providerStatusLabel = providerStatus ? `status=${providerStatus}` : '';
                        const providerMessage = parsed.provider_response?.message || parsed.message || '';
                        detail = [providerStatusLabel, providerMessage].filter(Boolean).join(' ');
                    }
                }
            } catch (_e) {
                // ignore parse failure
            }

            const logMessage = detail
                ? `❌ 인증 메일 발송 호출 실패: ${error.message} (${detail})`
                : `❌ 인증 메일 발송 호출 실패: ${error.message}`;
            Logger.error(logMessage);
            return {
                success: false,
                message: detail
                    ? `인증 메일 전송에 실패했습니다. (${detail})`
                    : '인증 메일 전송에 실패했습니다. 잠시 후 다시 시도해 주세요.',
                sendError: detail || error.message || 'Edge Function returned an error',
                providerStatus
            };
        }

        if (!data || data.success !== true) {
            const providerStatus = data?.provider_status ? String(data.provider_status) : '';
            const providerStatusLabel = providerStatus ? `status=${providerStatus}` : '';
            const providerMessage = data?.provider_response?.message || data?.message || '';
            const detail = [providerStatusLabel, providerMessage].filter(Boolean).join(' ');
            return {
                success: false,
                message: detail
                    ? `인증 메일 전송에 실패했습니다. (${detail})`
                    : '인증 메일 전송에 실패했습니다. 잠시 후 다시 시도해 주세요.',
                sendError: detail || 'Edge Function returned an unsuccessful response',
                providerStatus
            };
        }

        return {
            success: true,
            providerStatus: data?.provider_status ? String(data.provider_status) : ''
        };
    } catch (e) {
        Logger.error(`❌ 인증 메일 발송 모듈 에러: ${e.message}`);
        return {
            success: false,
            message: '인증 메일 전송 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
            sendError: e.message || 'Mail send module error',
            providerStatus: ''
        };
    }
}

async function markEmailVerificationSendStatus(email, code, sendResult) {
    if (!supabase) return;

    const sendStatus = sendResult?.success ? 'sent' : 'failed';
    const sendError = sendStatus === 'failed'
        ? String(sendResult?.sendError || sendResult?.message || '').trim()
        : '';
    const providerStatus = String(sendResult?.providerStatus || '').trim();

    try {
        const { data, error } = await supabase.rpc('mark_license_registration_code_send_status', {
            p_email: email,
            p_code: code,
            p_send_status: sendStatus,
            p_error: sendError || null,
            p_provider_status: providerStatus || null
        });

        if (error) {
            Logger.warn(`⚠️ 인증 메일 발송 상태 기록 실패: ${sanitizeErrorMessage(error.message)}`);
            return;
        }

        if (!data?.success) {
            Logger.warn(`⚠️ 인증 메일 발송 상태 기록 실패: ${data?.message || 'unknown response'}`);
        }
    } catch (e) {
        Logger.warn(`⚠️ 인증 메일 발송 상태 기록 중 오류: ${e.message}`);
    }
}

async function requestEmailVerificationCode(
    email,
    logLabel = '라이선스 등록',
    rpcName = 'request_license_registration'
) {
    if (!supabase) {
        return { success: false, message: '라이선스 서버 설정 오류' };
    }

    Logger.info(`📨 ${logLabel} 인증 코드를 요청합니다...`);
    const { data, error } = await supabase
        .rpc(rpcName, { p_email: email });

    if (error) {
        Logger.error(`❌ 인증 코드 요청 실패: ${error.message}`);
        return { success: false, message: '인증 코드 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.' };
    }

    if (!data || !data.success) {
        return {
            success: false,
            message: data?.message || '인증 코드 요청에 실패했습니다.'
        };
    }

    const ttlSeconds = Number.isFinite(Number(data.ttl_seconds)) ? parseInt(data.ttl_seconds, 10) : 300;
    const verificationCode = String(data.verification_code || '').trim();
    if (!verificationCode) {
        return {
            success: false,
            message: '인증 코드 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.'
        };
    }

    const mailSent = await sendLicenseRegistrationEmail(email, verificationCode, ttlSeconds, data.expires_at || '');
    await markEmailVerificationSendStatus(email, verificationCode, mailSent);
    if (!mailSent.success) return mailSent;

    return {
        success: true,
        message: data.message || '인증 코드가 발송되었습니다.',
        email,
        verificationCode: process.env.DEBUG ? verificationCode : '',
        ttlSeconds,
        expiresAt: data.expires_at || ''
    };
}

let runtimeLicenseKey = '';
let ensureLicenseInitPromise = null;
let lastInitFailureAt = 0;
let lastInitFailureMessage = '';
const LICENSE_INIT_RETRY_COOLDOWN_MS = 30000;

/**
 * 라이선스 서버 부하 방지를 위한 메모리 캐시 (10분)
 */
let licenseStatusCache = {
    data: null,
    timestamp: 0,
    ttl: 10 * 60 * 1000 // 10분
};

function getResolvedLicenseKey() {
    return resolveLicenseKey(process.env.LICENSE_KEY || runtimeLicenseKey || CONFIG.LICENSE_KEY);
}

function persistLicenseKeyFile(licenseKey) {
    // 환경변수로 주입된 키는 파일에 덮어쓰지 않는다.
    if (process.env.LICENSE_KEY) return true;

    const targetPath = CONFIG.LICENSE_KEY_FILE_PATH
        || path.join(CONFIG.CONFIG_DIR || path.join(process.cwd(), 'config'), 'license.key');
    try {
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, `${licenseKey}\n`, { encoding: 'utf-8', mode: 0o600 });
        try { fs.chmodSync(targetPath, 0o600); } catch (e) { }
        return true;
    } catch (e) {
        Logger.warn('⚠️ 라이선스 정보를 로컬에 저장하지 못했습니다. 다음 실행에서 다시 인증이 필요할 수 있습니다.');
        return false;
    }
}

async function ensureLicenseKey(hwid) {
    const current = getResolvedLicenseKey();
    if (current) {
        runtimeLicenseKey = current;
        lastInitFailureAt = 0;
        lastInitFailureMessage = '';
        return { success: true, licenseKey: current };
    }

    if (!supabase) {
        return { success: false, message: '라이선스 서버 설정 오류' };
    }

    // UI 폴링 등으로 초기화 요청이 동시에 몰릴 때 중복 RPC/중복 로그를 방지한다.
    if (ensureLicenseInitPromise) {
        return ensureLicenseInitPromise;
    }

    const now = Date.now();
    if (
        lastInitFailureMessage &&
        lastInitFailureAt > 0 &&
        (now - lastInitFailureAt) < LICENSE_INIT_RETRY_COOLDOWN_MS
    ) {
        return { success: false, message: lastInitFailureMessage };
    }

    ensureLicenseInitPromise = (async () => {
        Logger.info('🔐 라이선스 초기화 중...');
        const { data, error } = await supabase.rpc('issue_test_license', { p_hwid: hwid });
        if (error) {
            const failMessage = '라이선스 인증 준비에 실패했습니다. 잠시 후 다시 시도해 주세요.';
            lastInitFailureAt = Date.now();
            lastInitFailureMessage = failMessage;
            Logger.error(`❌ 라이선스 초기화 실패: ${error.message}`);
            return { success: false, message: failMessage };
        }

        const issuedKey = String(data?.license_key || '').trim();
        if (!data?.success || !issuedKey) {
            const failMessage = data?.message || '라이선스 인증 준비에 실패했습니다. 잠시 후 다시 시도해 주세요.';
            lastInitFailureAt = Date.now();
            lastInitFailureMessage = failMessage;
            return { success: false, message: failMessage };
        }

        runtimeLicenseKey = issuedKey;
        lastInitFailureAt = 0;
        lastInitFailureMessage = '';
        if (persistLicenseKeyFile(issuedKey)) {
            Logger.info('✅ 라이선스 초기화 완료');
        } else {
            Logger.warn('⚠️ 라이선스 인증 정보 저장이 지연되었지만 이번 실행은 계속 진행합니다.');
        }

        return { success: true, licenseKey: issuedKey };
    })();

    try {
        return await ensureLicenseInitPromise;
    } finally {
        ensureLicenseInitPromise = null;
    }
}

async function callPublishQuotaRpc(rpcName, operationId, metadata = {}) {
    if (!supabase) {
        return { success: false, message: '라이선스 서버 설정 오류' };
    }

    const normalizedOperationId = String(operationId || '').trim();
    if (!normalizedOperationId) {
        return { success: false, code: 'INVALID_OPERATION_ID', message: '발행 작업 ID가 비어 있습니다.' };
    }

    try {
        const hwid = machineIdSync({ original: true });
        const keyReady = await ensureLicenseKey(hwid);
        if (!keyReady.success) return keyReady;

        const { data, error } = await supabase.rpc(rpcName, {
            p_license_key: keyReady.licenseKey,
            p_hwid: hwid,
            p_operation_id: normalizedOperationId,
            p_metadata: (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) ? metadata : {}
        });

        if (error) {
            Logger.error(`[LicenseQuota] ${rpcName} failed: ${sanitizeErrorMessage(error.message)}`);
            return { success: false, message: '사용량 서버 통신에 실패했습니다. 잠시 후 다시 시도해 주세요.' };
        }

        licenseStatusCache.timestamp = 0;
        return {
            ...(data && typeof data === 'object' ? data : {}),
            success: data?.success === true,
            operationId: data?.operation_id || normalizedOperationId,
            remaining: data?.remaining
        };
    } catch (error) {
        Logger.error(`[LicenseQuota] ${rpcName} error: ${error.message}`);
        return { success: false, message: '사용량 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' };
    }
}

const License = {
    requestLicenseRegistration: async function (email) {
        try {
            const normalizedEmail = sanitizeEmail(email);
            if (!isValidEmail(normalizedEmail)) {
                return { success: false, message: '유효한 이메일 주소를 입력해 주세요.' };
            }
            return await requestEmailVerificationCode(normalizedEmail, '라이선스 등록');
        } catch (e) {
            Logger.error(`❌ 등록 코드 요청 모듈 에러: ${e.message}`);
            return { success: false, message: '인증 코드 요청 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' };
        }
    },

    requestLicenseRecovery: async function (email) {
        try {
            const normalizedEmail = sanitizeEmail(email);
            if (!isValidEmail(normalizedEmail)) {
                return { success: false, message: '유효한 이메일 주소를 입력해 주세요.' };
            }
            return await requestEmailVerificationCode(
                normalizedEmail,
                '라이선스 복구',
                'request_license_recovery'
            );
        } catch (e) {
            Logger.error(`❌ 복구 코드 요청 모듈 에러: ${e.message}`);
            return { success: false, message: '인증 코드 요청 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' };
        }
    },

    verifyLicenseRegistration: async function (email, code) {
        try {
            if (!supabase) {
                return { success: false, message: '라이선스 서버 설정 오류' };
            }

            const normalizedEmail = sanitizeEmail(email);
            const normalizedCode = String(code || '').trim();
            if (!isValidEmail(normalizedEmail)) {
                return { success: false, message: '유효한 이메일 주소를 입력해 주세요.' };
            }
            if (!normalizedCode) {
                return { success: false, message: '인증 코드를 입력해 주세요.' };
            }

            const hwid = machineIdSync({ original: true });
            const keyReady = await ensureLicenseKey(hwid);
            if (!keyReady.success) {
                return { success: false, message: keyReady.message };
            }
            const resolvedLicenseKey = keyReady.licenseKey;

            Logger.info('🔐 라이선스 등록을 확인합니다...');
            const { data, error } = await supabase.rpc('verify_license_registration', {
                p_email: normalizedEmail,
                p_code: normalizedCode,
                p_hwid: hwid,
                p_license_key: resolvedLicenseKey
            });

            if (error) {
                Logger.error(`❌ 라이선스 등록 확인 실패: ${error.message}`);
                return { success: false, message: '등록 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.' };
            }

            if (!data?.success || !data?.license_key) {
                return {
                    success: false,
                    message: buildMessageWithPlan(data?.message || '등록 확인에 실패했습니다.', data?.plan_code, data?.plan_display_name),
                    planCode: data?.plan_code,
                    planDisplayName: data?.plan_display_name
                };
            }

            runtimeLicenseKey = String(data.license_key).trim();
            licenseStatusCache.timestamp = 0; // 캐시 무효화
            const saved = persistLicenseKeyFile(runtimeLicenseKey);
            if (saved) {
                Logger.info('✅ 라이선스 등록 완료');
            } else {
                Logger.warn('⚠️ 라이선스 저장이 지연되었지만 이번 실행은 계속 진행합니다.');
            }

            return {
                success: true,
                message: data.message || '등록이 완료되었습니다.',
                planCode: data.plan_code,
                planDisplayName: data.plan_display_name,
                remaining: data.remaining,
                features: (data.features && typeof data.features === 'object') ? data.features : {},
                licenseKey: runtimeLicenseKey
            };
        } catch (e) {
            Logger.error(`❌ 라이선스 등록 모듈 에러: ${e.message}`);
            return { success: false, message: '등록 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' };
        }
    },

    verifyLicenseRecovery: async function (email, code) {
        try {
            if (!supabase) {
                return { success: false, message: '라이선스 서버 설정 오류' };
            }

            const normalizedEmail = sanitizeEmail(email);
            const normalizedCode = String(code || '').trim();
            if (!isValidEmail(normalizedEmail)) {
                return { success: false, message: '유효한 이메일 주소를 입력해 주세요.' };
            }
            if (!normalizedCode) {
                return { success: false, message: '인증 코드를 입력해 주세요.' };
            }

            const hwid = machineIdSync({ original: true });
            Logger.info('🔐 라이선스 복구를 확인합니다...');
            const { data, error } = await supabase.rpc('verify_license_recovery', {
                p_email: normalizedEmail,
                p_code: normalizedCode,
                p_hwid: hwid
            });

            if (error) {
                Logger.error(`❌ 라이선스 복구 확인 실패: ${error.message}`);
                return { success: false, message: '복구 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.' };
            }

            if (!data?.success || !data?.license_key) {
                return {
                    success: false,
                    message: buildMessageWithPlan(data?.message || '복구 확인에 실패했습니다.', data?.plan_code, data?.plan_display_name),
                    planCode: data?.plan_code,
                    planDisplayName: data?.plan_display_name
                };
            }

            runtimeLicenseKey = String(data.license_key).trim();
            licenseStatusCache.timestamp = 0; // 캐시 무효화
            const saved = persistLicenseKeyFile(runtimeLicenseKey);
            if (saved) {
                Logger.info('✅ 라이선스 복구 완료');
            } else {
                Logger.warn('⚠️ 라이선스 저장이 지연되었지만 이번 실행은 계속 진행합니다.');
            }

            return {
                success: true,
                message: data.message || '복구가 완료되었습니다.',
                planCode: data.plan_code,
                planDisplayName: data.plan_display_name,
                remaining: data.remaining,
                features: (data.features && typeof data.features === 'object') ? data.features : {},
                licenseKey: runtimeLicenseKey
            };
        } catch (e) {
            Logger.error(`❌ 라이선스 복구 모듈 에러: ${e.message}`);
            return { success: false, message: '복구 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' };
        }
    },

    upgradeLicense: async function (targetPlan = 'free', email = '') {
        try {
            if (!supabase) {
                return { success: false, message: '라이선스 서버 설정 오류' };
            }

            const normalizedPlan = String(targetPlan || 'free').trim().toLowerCase();
            const normalizedEmail = sanitizeEmail(email);
            if (normalizedEmail && !isValidEmail(normalizedEmail)) {
                return { success: false, message: '유효한 이메일 주소를 입력해 주세요.' };
            }

            const hwid = machineIdSync({ original: true });
            const keyReady = await ensureLicenseKey(hwid);
            if (!keyReady.success) {
                return { success: false, message: keyReady.message };
            }
            const resolvedLicenseKey = keyReady.licenseKey;

            Logger.info(`📡 라이선스 업그레이드 요청 중... (target: ${normalizedPlan})`);
            const { data, error } = await supabase.rpc('upgrade_license_plan', {
                p_license_key: resolvedLicenseKey,
                p_hwid: hwid,
                p_target_plan: normalizedPlan,
                p_email: normalizedEmail || null
            });

            if (error) {
                Logger.error(`❌ 라이선스 업그레이드 실패: ${error.message}`);
                return { success: false, message: '업그레이드 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.' };
            }

            if (!data?.success || !data?.license_key) {
                return {
                    success: false,
                    message: buildMessageWithPlan(data?.message || '업그레이드에 실패했습니다.', data?.plan_code, data?.plan_display_name),
                    planCode: data?.plan_code,
                    planDisplayName: data?.plan_display_name
                };
            }

            runtimeLicenseKey = String(data.license_key).trim();
            licenseStatusCache.timestamp = 0; // 캐시 무효화
            const saved = persistLicenseKeyFile(runtimeLicenseKey);
            if (!saved) {
                Logger.warn('⚠️ 라이선스 저장이 지연되었지만 이번 실행은 계속 진행합니다.');
            }

            return {
                success: true,
                message: data.message || '업그레이드가 완료되었습니다.',
                planCode: data.plan_code,
                planDisplayName: data.plan_display_name,
                remaining: data.remaining,
                features: (data.features && typeof data.features === 'object') ? data.features : {},
                licenseKey: runtimeLicenseKey
            };
        } catch (e) {
            Logger.error(`❌ 라이선스 업그레이드 모듈 에러: ${e.message}`);
            return { success: false, message: '업그레이드 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' };
        }
    },

    /**
     * 라이선스 사전 검증 (무차감)
     * - 서버 RPC: check_license_status
     * @returns {Promise<{success: boolean, message: string, remaining?: number}>}
     */
    checkLicenseStatus: async function (options = {}) {
        const startTime = Date.now();
        const silent = options.quiet || options.silent;
        if (!silent) Logger.debug('[License] Checking license status...');

        try {
            const quiet = options && options.quiet === true;
            const force = options && options.force === true;

            // 🚀 캐시 체크
            if (!force && licenseStatusCache.data && (Date.now() - licenseStatusCache.timestamp) < licenseStatusCache.ttl) {
                if (!quiet) {
                    Logger.debug(`[License] Using cached status (${Date.now() - startTime}ms)`);
                }
                return licenseStatusCache.data;
            }

            const hwid = machineIdSync({ original: true });
            const keyReady = await ensureLicenseKey(hwid);
            if (!keyReady.success) {
                return { success: false, message: keyReady.message };
            }
            const resolvedLicenseKey = keyReady.licenseKey;
            if (!quiet) {
                Logger.debug(`[License] Real-time verification starting... (${Date.now() - startTime}ms)`);
            }

            const { data, error } = await supabase
                .rpc('check_license_status', {
                    p_license_key: resolvedLicenseKey,
                    p_hwid: hwid
                });

            const duration = Date.now() - startTime;

            if (error) {
                const msg = sanitizeErrorMessage(error.message);
                Logger.error(`❌ [License] 서버 통신 에러: ${msg} (${duration}ms)`);
                return { success: false, message: '라이선스 서버 통신에 실패했습니다. 잠시 후 다시 시도해 주세요.' };
            }

            if (data && data.success) {
                const featurePolicy = validateLicenseFeaturePolicy(data.features);
                if (!featurePolicy.success) {
                    Logger.error(`[License] ${featurePolicy.message}`);
                    return {
                        success: false,
                        code: featurePolicy.code,
                        message: featurePolicy.message,
                        remaining: data.remaining,
                        planCode: data.plan_code,
                        planDisplayName: data.plan_display_name,
                        email: normalizeOptionalEmail(data.email),
                        createdAt: data.created_at || '',
                        usageLimit: Number.isFinite(Number(data.usage_limit)) ? parseInt(data.usage_limit, 10) : null,
                        usageCount: Number.isFinite(Number(data.usage_count)) ? parseInt(data.usage_count, 10) : null,
                        features: featurePolicy.features
                    };
                }
                const remainingLabel = formatPlanRemaining(data.plan_code, data.plan_display_name, data.remaining);
                const result = {
                    success: true,
                    message: data.message,
                    remaining: data.remaining,
                    planCode: data.plan_code,
                    planDisplayName: data.plan_display_name,
                    email: normalizeOptionalEmail(data.email),
                    createdAt: data.created_at || '',
                    usageLimit: Number.isFinite(Number(data.usage_limit)) ? parseInt(data.usage_limit, 10) : null,
                    usageCount: Number.isFinite(Number(data.usage_count)) ? parseInt(data.usage_count, 10) : null,
                    features: featurePolicy.features
                };

                // 🚀 캐시 업데이트
                licenseStatusCache.data = result;
                licenseStatusCache.timestamp = Date.now();

                if (!quiet) {
                    Logger.debug(`✅ [License] 사전 검증 통과: ${remainingLabel} (${duration}ms)`);
                }
                return result;
            }

            Logger.debug(`[License] Pre-verification failed (${duration}ms)`);
            return {
                success: false,
                message: buildMessageWithPlan(data?.message || '라이선스 사전 검증 실패', data?.plan_code, data?.plan_display_name),
                remaining: data?.remaining,
                planCode: data?.plan_code,
                planDisplayName: data?.plan_display_name,
                email: normalizeOptionalEmail(data?.email),
                createdAt: data?.created_at || '',
                usageLimit: Number.isFinite(Number(data?.usage_limit)) ? parseInt(data.usage_limit, 10) : null,
                usageCount: Number.isFinite(Number(data?.usage_count)) ? parseInt(data.usage_count, 10) : null,
                features: (data?.features && typeof data.features === 'object') ? data.features : {}
            };
        } catch (e) {
            Logger.error(`❌ [License] 사전 검증 모듈 에러: ${e.message} (${Date.now() - startTime}ms)`);
            return { success: false, message: '라이선스 확인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' };
        }
    },

    reservePublishQuota: async function (operationId, metadata = {}) {
        const result = await callPublishQuotaRpc('reserve_publish_quota', operationId, metadata);
        if (!result.success) return result;

        const featurePolicy = validateLicenseFeaturePolicy(result.features);
        if (!featurePolicy.success) {
            return {
                ...result,
                success: false,
                code: featurePolicy.code,
                message: featurePolicy.message,
                features: featurePolicy.features
            };
        }
        return { ...result, features: featurePolicy.features };
    },

    commitPublishQuota: async function (operationId, metadata = {}) {
        return callPublishQuotaRpc('commit_publish_quota', operationId, metadata);
    },

    releasePublishQuota: async function (operationId, metadata = {}) {
        return callPublishQuotaRpc('release_publish_quota', operationId, metadata);
    },

    /**
     * 라이선스 검증 및 사용 처리 (RPC 호출)
     * @returns {Promise<{success: boolean, message: string, remaining?: number}>}
     */
    verifyLicense: async function () {
        try {
            // 1. 설정 검증
            if (!supabase) {
                return { success: false, message: '라이선스 서버 설정 오류' };
            }

            // 2. HWID 추출 (기기 고유 ID)
            const hwid = machineIdSync({ original: true });
            const keyReady = await ensureLicenseKey(hwid);
            if (!keyReady.success) {
                return { success: false, message: keyReady.message };
            }
            const resolvedLicenseKey = keyReady.licenseKey;

            // 3. 로그 출력
            Logger.info('📡 라이선스 검증 중...');

            // 4. Supabase RPC 호출 (check_and_use_license)
            // 주의: 이 함수가 호출되면 서버에서 카운트가 차감된다고 가정합니다.
            const { data, error } = await supabase
                .rpc('check_and_use_license', {
                    p_license_key: resolvedLicenseKey,
                    p_hwid: hwid
                });

            if (error) {
                // RPC 에러 (예: 함수 없음, 파라미터 오류, 502 응답 등)
                Logger.error(`❌ 서버 통신 에러: ${sanitizeErrorMessage(error.message)}`);
                return { success: false, message: '라이선스 서버 통신에 실패했습니다. 잠시 후 다시 시도해 주세요.' };
            }

            // data 구조: { success: true/false, message: '...', remaining: N }
            if (data && data.success) {
                const featurePolicy = validateLicenseFeaturePolicy(data.features);
                if (!featurePolicy.success) {
                    Logger.error(`[License] ${featurePolicy.message}`);
                    return {
                        success: false,
                        code: featurePolicy.code,
                        message: featurePolicy.message,
                        remaining: data.remaining,
                        planCode: data.plan_code,
                        planDisplayName: data.plan_display_name,
                        features: featurePolicy.features
                    };
                }
                const remainingLabel = formatPlanRemaining(data.plan_code, data.plan_display_name, data.remaining);
                Logger.info(`✅ 라이선스 승인 (${remainingLabel})`);
                return {
                    success: true,
                    message: data.message,
                    remaining: data.remaining,
                    planCode: data.plan_code,
                    planDisplayName: data.plan_display_name,
                    features: featurePolicy.features
                };
            } else {
                return {
                    success: false,
                    message: buildMessageWithPlan(data?.message || '라이선스 검증 실패', data?.plan_code, data?.plan_display_name),
                    remaining: data?.remaining,
                    planCode: data?.plan_code,
                    planDisplayName: data?.plan_display_name,
                    features: (data?.features && typeof data.features === 'object') ? data.features : {}
                };
            }

        } catch (e) {
            Logger.error(`❌ 라이선스 모듈 에러: ${e.message}`);
            return { success: false, message: '라이선스 확인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' };
        }
    }
};

module.exports = License;
