const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { machineIdSync } = require('node-machine-id');
const CONFIG = require('./config-loader');
const Logger = require('./logger');

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

let runtimeLicenseKey = '';

function getResolvedLicenseKey() {
    return resolveLicenseKey(process.env.LICENSE_KEY || runtimeLicenseKey || CONFIG.LICENSE_KEY);
}

function persistLicenseKeyFile(licenseKey) {
    // 환경변수로 주입된 키는 파일에 덮어쓰지 않는다.
    if (process.env.LICENSE_KEY) return true;

    const targetPath = CONFIG.LICENSE_KEY_FILE_PATH || path.join(process.cwd(), 'config', 'license.key');
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
        return { success: true, licenseKey: current };
    }

    if (!supabase) {
        return { success: false, message: '라이선스 서버 설정 오류' };
    }

    Logger.info('🔐 라이선스 초기화 중...');
    const { data, error } = await supabase.rpc('issue_test_license', { p_hwid: hwid });
    if (error) {
        Logger.error(`❌ 라이선스 초기화 실패: ${error.message}`);
        return { success: false, message: '라이선스 인증 준비에 실패했습니다. 잠시 후 다시 시도해 주세요.' };
    }

    const issuedKey = String(data?.license_key || '').trim();
    if (!data?.success || !issuedKey) {
        return { success: false, message: data?.message || '라이선스 인증 준비에 실패했습니다. 잠시 후 다시 시도해 주세요.' };
    }

    runtimeLicenseKey = issuedKey;
    if (persistLicenseKeyFile(issuedKey)) {
        Logger.info('✅ 라이선스 초기화 완료');
    } else {
        Logger.warn('⚠️ 라이선스 인증 정보 저장이 지연되었지만 이번 실행은 계속 진행합니다.');
    }

    return { success: true, licenseKey: issuedKey };
}

const License = {
    /**
     * 라이선스 사전 검증 (무차감)
     * - 서버 RPC: check_license_status
     * @returns {Promise<{success: boolean, message: string, remaining?: number}>}
     */
    checkLicenseStatus: async function() {
        try {
            const hwid = machineIdSync({ original: true });
            const keyReady = await ensureLicenseKey(hwid);
            if (!keyReady.success) {
                return { success: false, message: keyReady.message };
            }
            const resolvedLicenseKey = keyReady.licenseKey;
            Logger.info('📡 라이선스 사전 검증 중...');

            const { data, error } = await supabase
                .rpc('check_license_status', {
                    p_license_key: resolvedLicenseKey,
                    p_hwid: hwid
                });

            if (error) {
                const msg = String(error.message || '');
                Logger.error(`❌ 서버 통신 에러: ${msg}`);
                return { success: false, message: '라이선스 서버 통신에 실패했습니다. 잠시 후 다시 시도해 주세요.' };
            }

            if (data && data.success) {
                const remainingLabel = formatPlanRemaining(data.plan_code, data.plan_display_name, data.remaining);
                if (data.auto_downgraded_to_free) {
                    Logger.info('ℹ️ 테스트 플랜이 종료되어 free 플랜으로 자동 전환되었습니다. 더 많은 사용량이 필요하면 Pro 플랜 업그레이드를 고려해 주세요.');
                }
                Logger.info(`✅ 라이선스 사전 검증 통과 (${remainingLabel})`);
                return {
                    success: true,
                    message: data.message,
                    remaining: data.remaining,
                    planCode: data.plan_code,
                    planDisplayName: data.plan_display_name,
                    features: (data.features && typeof data.features === 'object') ? data.features : {}
                };
            }
            return {
                success: false,
                message: buildMessageWithPlan(data?.message || '라이선스 사전 검증 실패', data?.plan_code, data?.plan_display_name),
                remaining: data?.remaining,
                planCode: data?.plan_code,
                planDisplayName: data?.plan_display_name,
                features: (data?.features && typeof data.features === 'object') ? data.features : {}
            };
        } catch (e) {
            Logger.error(`❌ 라이선스 사전 검증 모듈 에러: ${e.message}`);
            return { success: false, message: '라이선스 확인 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' };
        }
    },

    /**
     * 라이선스 검증 및 사용 처리 (RPC 호출)
     * @returns {Promise<{success: boolean, message: string, remaining?: number}>}
     */
    verifyLicense: async function() {
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
                // RPC 에러 (예: 함수 없음, 파라미터 오류 등)
                Logger.error(`❌ 서버 통신 에러: ${error.message}`);
                return { success: false, message: '라이선스 서버 통신에 실패했습니다. 잠시 후 다시 시도해 주세요.' };
            }

            // data 구조: { success: true/false, message: '...', remaining: N }
            if (data && data.success) {
                const remainingLabel = formatPlanRemaining(data.plan_code, data.plan_display_name, data.remaining);
                if (data.auto_downgraded_to_free) {
                    Logger.info('ℹ️ 테스트 플랜이 종료되어 free 플랜으로 자동 전환되었습니다. 더 많은 사용량이 필요하면 Pro 플랜 업그레이드를 고려해 주세요.');
                }
                Logger.info(`✅ 라이선스 승인 (${remainingLabel})`);
                return {
                    success: true,
                    message: data.message,
                    remaining: data.remaining,
                    planCode: data.plan_code,
                    planDisplayName: data.plan_display_name,
                    features: (data.features && typeof data.features === 'object') ? data.features : {}
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
