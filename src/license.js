// src/license.js
const { createClient } = require('@supabase/supabase-js');
const { machineIdSync } = require('node-machine-id');
const CONFIG = require('./config-loader'); // 여기서 설정을 다 가져옵니다
const Logger = require('./logger');

// 🔥 [체크] 라이선스 서버 설정이 로드되었는지 확인
// config-loader가 secret.js 내용을 합쳐서 CONFIG에 넣어줬습니다.
if (!CONFIG.LICENSE_CHK_URL || !CONFIG.LICENSE_CHK_KEY) {
    Logger.error("❌ 라이선스 서버 설정이 누락되었습니다. (pkg 내부 secret.js 확인 필요)");
    // 여기서 process.exit(1)을 하거나, 아래 함수에서 에러를 뱉게 둡니다.
}

// 🔥 [수정] SECRET.xxx -> CONFIG.xxx 로 변경!
// (config-loader가 합쳐줬으니까요)
const supabase = createClient(CONFIG.LICENSE_CHK_URL, CONFIG.LICENSE_CHK_KEY);

async function verifyLicense() {
    try {
        // 1. HWID 추출
        const hwid = machineIdSync({original: true}); 
        const licenseKey = CONFIG.LICENSE_KEY;

        if (!licenseKey) {
            return { success: false, message: '라이선스 키가 입력되지 않았습니다 (settings.js 확인).' };
        }

        Logger.info(`📡 라이선스 검증 시도... (${licenseKey.substring(0, 4)}***)`);

        // 2. RPC 호출
        const { data, error } = await supabase
            .rpc('check_and_use_license', { 
                p_license_key: licenseKey, 
                p_hwid: hwid 
            });

        if (error) {
            return { success: false, message: `서버 연결 실패: ${error.message}` };
        }

        return data; // { success: true, message: '...', remaining: N }

    } catch (e) {
        return { success: false, message: `검증 중 오류 발생: ${e.message}` };
    }
}

module.exports = { verifyLicense };
