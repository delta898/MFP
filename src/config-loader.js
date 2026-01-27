const path = require('path');
const fs = require('fs');

// 💡 [경로 기준점]
// 1. 내부 파일(secret.js)은 __dirname(현재 파일 위치) 기준
// 2. 외부 파일(settings.js)은 process.cwd()(실행 위치) 기준
const ROOT_DIR = process.cwd(); 

// 🔒 [비밀 키 로딩] 
// src/config/secret.js 파일을 불러옵니다.
// pkg 빌드 시 이 내용은 실행 파일 내부에 포함됩니다. (보안 👍)
let internalSecrets = {};
try {
    // 같은 폴더 내의 config/secret.js를 찾습니다.
    internalSecrets = require('./config/secret'); 
} catch (e) {
    // 개발 중이거나 파일이 없을 때 대비
    console.warn("⚠️ [Dev] 내부 secret.js 파일을 찾을 수 없습니다. (빌드 시에는 포함되어야 함)");
    internalSecrets = { LICENSE_CHK_URL: "", LICENSE_CHK_KEY: "" }; 
}

// 경로 정의 (사용자 파일들은 바깥세상 경로인 ROOT_DIR 기준)
const PATHS = {
    settings: path.join(ROOT_DIR, 'config', 'settings.js'),
    auth: path.join(ROOT_DIR, 'config', 'auth.json'),
    systemPrompt: path.join(ROOT_DIR, 'config', 'system_prompt.md'),
    job: path.join(ROOT_DIR, 'job.json')
};

// 사용자 설정 파일(settings.js) 불러오기
let userConfig = {};
try {
    if (fs.existsSync(PATHS.settings)) {
        userConfig = require(PATHS.settings);
    } 
} catch (e) {
    // 설정 파일 로딩 실패 시 로그 (main.js에서 처리하므로 여기선 패스)
}

// 📌 [병합] 비밀키(secret.js) + 사용자설정(settings.js) + 경로상수
module.exports = {
    ...internalSecrets,  // secret.js의 내용 (URL, KEY)
    ...userConfig,       // settings.js의 내용 (Naver ID, License Key)
    
    // 경로 상수들
    PATHS: PATHS,
    AUTH_FILE_PATH: PATHS.auth,
    SYSTEM_PROMPT_PATH: PATHS.systemPrompt
};
