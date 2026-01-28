const { createClient } = require('@supabase/supabase-js');
const { machineIdSync } = require('node-machine-id');
const CONFIG = require('./config-loader');
const Logger = require('./logger');

// Supabase 클라이언트 초기화 (설정 누락 시 null 처리하여 안전하게 기동)
let supabase = null;
if (CONFIG.LICENSE_CHK_URL && CONFIG.LICENSE_CHK_KEY) {
    supabase = createClient(CONFIG.LICENSE_CHK_URL, CONFIG.LICENSE_CHK_KEY);
} else {
    Logger.warn("⚠️ [License] 라이선스 서버 설정(URL/KEY)이 누락되었습니다.");
}

const License = {
    /**
     * 라이선스 검증 및 사용 처리 (RPC 호출)
     * @returns {Promise<{success: boolean, message: string, remaining?: number}>}
     */
    verifyLicense: async function() {
        try {
            // 1. 설정 검증
            if (!supabase) {
                return { success: false, message: '라이선스 서버 설정 오류 (pkg/secret.js 확인 필요)' };
            }
            if (!CONFIG.LICENSE_KEY) {
                return { success: false, message: '라이선스 키가 없습니다. settings.js를 확인하세요.' };
            }

            // 2. HWID 추출 (기기 고유 ID)
            const hwid = machineIdSync({ original: true });
            
            // 3. 로그 출력 (보안을 위해 키 일부 마스킹)
            const maskedKey = CONFIG.LICENSE_KEY.length > 4 
                ? `${CONFIG.LICENSE_KEY.substring(0, 4)}****` 
                : '****';
            Logger.info(`📡 라이선스 검증 중... (Key: ${maskedKey})`);

            // 4. Supabase RPC 호출 (check_and_use_license)
            // 주의: 이 함수가 호출되면 서버에서 카운트가 차감된다고 가정합니다.
            const { data, error } = await supabase
                .rpc('check_and_use_license', { 
                    p_license_key: CONFIG.LICENSE_KEY, 
                    p_hwid: hwid 
                });

            if (error) {
                // RPC 에러 (예: 함수 없음, 파라미터 오류 등)
                Logger.error(`❌ 서버 통신 에러: ${error.message}`);
                return { success: false, message: `서버 에러: ${error.message}` };
            }

            // data 구조: { success: true/false, message: '...', remaining: N }
            if (data && data.success) {
                Logger.info(`✅ 라이선스 승인 (잔여: ${data.remaining ?? 'N/A'}회)`);
                return { success: true, message: data.message, remaining: data.remaining };
            } else {
                return { success: false, message: data?.message || '라이선스 검증 실패' };
            }

        } catch (e) {
            Logger.error(`❌ 라이선스 모듈 에러: ${e.message}`);
            return { success: false, message: `내부 오류: ${e.message}` };
        }
    }
};

module.exports = License;
