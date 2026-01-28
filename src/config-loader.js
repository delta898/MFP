const path = require('path');
const fs = require('fs');
const Constants = require('./constants'); 

// 💡 [경로 기준점]
const ROOT_DIR = process.cwd(); 

// =========================================================
// 1. 🔒 [비밀 키 로딩] 
// =========================================================
let internalSecrets = {};
try {
    // pkg 빌드 시 번들링되는 내부 파일 (secret.js)
    internalSecrets = require('./config/secret'); 
} catch (e) {
    console.warn("⚠️ [Dev] 내부 secret.js를 찾을 수 없습니다. (빌드 시 포함됨)");
    internalSecrets = { LICENSE_CHK_URL: "", LICENSE_CHK_KEY: "" }; 
}

// =========================================================
// 2. 📂 [경로 정의]
// =========================================================
const PATHS = {
    configFile: path.join(ROOT_DIR, 'config', 'config.txt'),
    auth: path.join(ROOT_DIR, 'config', 'auth.json'),
    systemPrompt: path.join(ROOT_DIR, 'config', 'system_prompt.md'),
    topic: path.join(ROOT_DIR, 'topic.json'),
    workspace: path.join(ROOT_DIR, 'workspace')
};

// =========================================================
// 3. 🛠️ [config.txt 파싱 함수]
// =========================================================
function loadUserConfig() {
    const config = {};
    
    if (!fs.existsSync(PATHS.configFile)) {
        console.error(`❌ 설정 파일을 찾을 수 없습니다: ${PATHS.configFile}`);
        console.error(`👉 config/config.txt.sample 파일을 config.txt로 복사해주세요.`);
        process.exit(1);
    }

    const fileContent = fs.readFileSync(PATHS.configFile, 'utf-8');
    
    fileContent.split('\n').forEach(line => {
        const cleanLine = line.split('#')[0].trim();
        if (!cleanLine || !cleanLine.includes('=')) return;

        const [key, ...valueParts] = cleanLine.split('=');
        const finalKey = key.trim();
        const finalValue = valueParts.join('=').trim();

        if (finalValue.toLowerCase() === 'true') config[finalKey] = true;
        else if (finalValue.toLowerCase() === 'false') config[finalKey] = false;
        else if (!isNaN(finalValue) && finalValue !== '') config[finalKey] = Number(finalValue);
        else config[finalKey] = finalValue;
    });

    return config;
}

// 사용자 설정 로드
const userConfig = loadUserConfig();

// =========================================================
// 4. 🧩 [데이터 가공 및 엔드포인트 동적 생성]
// =========================================================

// 💡 [모델명 처리] 사용자가 설정한 모델, 없으면 기본값 사용
const textModel = userConfig.TEXT_MODEL || 'gemini-3-flash-preview';
const imageModel = userConfig.IMAGE_MODEL || 'gemini-2.5-flash-image';
const imageStyle = userConfig.IMAGE_STYLE || 'photorealistic';

// 💡 [엔드포인트 생성] 주소 체계 유지하며 모델명만 주입
const TEXT_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${textModel}:generateContent`;
const IMAGE_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${imageModel}:generateContent`;

// 타이핑 속도 변환
const typingMode = userConfig.TYPING_SPEED || 'NORMAL';
const typingDelay = Constants.TYPING_PRESETS[typingMode] || Constants.TYPING_PRESETS.NORMAL;

const viewportWidth = userConfig.VIEWPORT_WIDTH || 1280;
const viewportHeight = userConfig.VIEWPORT_HEIGHT || 1024;

const closeDelay = (userConfig.CLOSE_DELAY_SECONDS || 10) * 1000;

// 최종 내보낼 객체
module.exports = {
    ...Constants,       // 1. 내부 상수 (대기 시간 등)
    ...internalSecrets, // 2. 비밀키 (라이선스 URL, KEY)
    ...userConfig,      // 3. 사용자 설정 (ID, Key, 모델명 등)
    
    // 💡 데이터 가공 섹션 (명시적 선언)
    IMAGE_STYLE: imageStyle, 
    GEMINI_TEXT_ENDPOINT: TEXT_ENDPOINT,
    GEMINI_IMAGE_ENDPOINT: IMAGE_ENDPOINT,
    VIEWPORT: { width: viewportWidth, height: viewportHeight },

    // 4. 경로 상수 (호환성 유지)
    PATHS: PATHS,
    AUTH_FILE_PATH: PATHS.auth,
    SYSTEM_PROMPT_PATH: PATHS.systemPrompt,
    WORKSPACE_DIR: PATHS.workspace,

    // 5. 확정된 동적 데이터
    WRITE_URL: `https://blog.naver.com/${userConfig.NAVER_ID}/postwrite`,
    TYPING: typingDelay,
    CLOSE_DELAY: closeDelay,

    // 브라우저 채널 처리
    BROWSER_CHANNEL: (userConfig.BROWSER_CHANNEL === 'auto') ? undefined : userConfig.BROWSER_CHANNEL
};
