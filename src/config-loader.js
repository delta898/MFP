const path = require('path');
const fs = require('fs');
const Constants = require('./constants');

// 💡 [경로 기준점]
const ROOT_DIR = process.cwd();
const EXEC_DIR = path.dirname(process.execPath || ROOT_DIR);

// =========================================================
// 1. 🔒 [비밀 키 로딩] 
// =========================================================
let internalSecrets = {};
try {
    // pkg 빌드 시 번들링되는 내부 파일 (secret.js)
    internalSecrets = require('./config/secret');
} catch (e) {
    console.warn("⚠️ 라이선스 서버 설정 파일을 찾지 못했습니다.");
    internalSecrets = {
        LICENSE_CHK_URL: "",
        LICENSE_CHK_KEY: ""
    };
}

// =========================================================
// 2. 📂 [경로 정의]
// =========================================================
const PATHS = {
    configFile: path.join(ROOT_DIR, 'config', 'config.txt'),
    configFileFromExec: path.join(EXEC_DIR, 'config', 'config.txt'),
    licenseKeyFile: path.join(ROOT_DIR, 'config', 'license.key'),
    licenseKeyFileFromExec: path.join(EXEC_DIR, 'config', 'license.key'),
    auth: path.join(ROOT_DIR, 'config', 'auth.json'),
    blogPromptOverride: path.join(ROOT_DIR, 'config', 'blog_prompt.md'),
    blogPromptOverrideFromExec: path.join(EXEC_DIR, 'config', 'blog_prompt.md'),
    shoppingPromptOverride: path.join(ROOT_DIR, 'config', 'shopping_prompt.md'),
    shoppingPromptOverrideFromExec: path.join(EXEC_DIR, 'config', 'shopping_prompt.md'),
    defaultBlogPrompt: path.join(__dirname, 'config', 'blog_prompt.md'),
    defaultShoppingPrompt: path.join(__dirname, 'config', 'shopping_prompt.md'),
    workspace: path.join(ROOT_DIR, 'workspace')
};

// =========================================================
// 3. 🛠️ [config.txt 파싱 함수]
// =========================================================
function loadUserConfig() {
    const config = {};
    const configPath = fs.existsSync(PATHS.configFile)
        ? PATHS.configFile
        : PATHS.configFileFromExec;

    if (!fs.existsSync(configPath)) {
        console.error(`❌ 설정 파일을 찾을 수 없습니다: ${PATHS.configFile}`);
        console.error(`👉 config/config.txt.sample 파일을 config.txt로 복사해주세요.`);
        process.exit(1);
    }

    const fileContent = fs.readFileSync(configPath, 'utf-8');

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

function loadLicenseKey() {
    const candidates = [PATHS.licenseKeyFile, PATHS.licenseKeyFileFromExec];
    const matchedPath = candidates.find((filePath) => fs.existsSync(filePath));
    if (!matchedPath) {
        return { value: '', path: PATHS.licenseKeyFile };
    }
    try {
        const value = String(fs.readFileSync(matchedPath, 'utf-8') || '')
            .split(/\r?\n/)
            .find((line) => String(line || '').trim() !== '') || '';
        return { value: String(value).trim(), path: matchedPath };
    } catch (e) {
        return { value: '', path: matchedPath };
    }
}

// 사용자 설정 로드
const userConfig = loadUserConfig();
delete userConfig.NAVER_CLIENT_ID;
delete userConfig.NAVER_CLIENT_SECRET;
delete userConfig.LICENSE_KEY;
const licenseKeyInfo = loadLicenseKey();

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
const typingModeRaw = String(userConfig.TYPING_SPEED || 'NORMAL').trim().toUpperCase();
const typingMode = Constants.TYPING_PRESETS[typingModeRaw] ? typingModeRaw : 'NORMAL';
const typingDelay = Constants.TYPING_PRESETS[typingMode];

const viewportWidth = userConfig.VIEWPORT_WIDTH || 1280;
const viewportHeight = userConfig.VIEWPORT_HEIGHT || 1024;

const closeDelay = (userConfig.CLOSE_DELAY_SECONDS || 10) * 1000;

const blogPromptCandidates = [
    PATHS.blogPromptOverride,
    PATHS.blogPromptOverrideFromExec,
    PATHS.defaultBlogPrompt
];
const shoppingPromptCandidates = [
    PATHS.shoppingPromptOverride,
    PATHS.shoppingPromptOverrideFromExec,
    PATHS.defaultShoppingPrompt
];

const blogPromptPath = blogPromptCandidates.find((filePath) => fs.existsSync(filePath)) || PATHS.defaultBlogPrompt;
const shoppingPromptPath = shoppingPromptCandidates.find((filePath) => fs.existsSync(filePath)) || PATHS.defaultShoppingPrompt;

// 최종 내보낼 객체
module.exports = {
    ...Constants,       // 1. 내부 상수 (대기 시간 등)
    ...internalSecrets, // 2. 비밀키 (라이선스 URL, KEY)
    ...userConfig,      // 3. 사용자 설정 (ID, Key, 모델명 등)

    // 🔧 [Fixed] 환경 변수 우선 지원 (보안 강화)
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || userConfig.GEMINI_API_KEY,
    LICENSE_KEY: process.env.LICENSE_KEY || licenseKeyInfo.value || '',
    NAVER_ID: process.env.NAVER_ID || userConfig.NAVER_ID,
    NAVER_PASSWORD: process.env.NAVER_PASSWORD || userConfig.NAVER_PASSWORD,
    NAVER_CLIENT_ID: process.env.NAVER_CLIENT_ID || '',
    NAVER_CLIENT_SECRET: process.env.NAVER_CLIENT_SECRET || '',
    // 🆕 데이터 소스 (GOOGLE 고정)
    DATA_SOURCE: 'GOOGLE',

    // 🆕 시트 이름 (내부 고정값)
    GOOGLE_KEYWORDS_SHEET: 'keywords',
    GOOGLE_TOPICS_SHEET: 'topics',
    GOOGLE_TRENDS_SHEET: 'trends',
    GOOGLE_SHOPPING_SHEET: 'shopping',

    // 💡 데이터 가공 섹션 (명시적 선언)
    IMAGE_STYLE: imageStyle,
    GEMINI_TEXT_ENDPOINT: TEXT_ENDPOINT,
    GEMINI_IMAGE_ENDPOINT: IMAGE_ENDPOINT,
    VIEWPORT: { width: viewportWidth, height: viewportHeight },

    // 4. 경로 상수 (호환성 유지)
    PATHS: PATHS,
    AUTH_FILE_PATH: PATHS.auth,
    LICENSE_KEY_FILE_PATH: licenseKeyInfo.path,
    BLOG_PROMPT_PATH: blogPromptPath,
    SHOPPING_PROMPT_PATH: shoppingPromptPath,
    WORKSPACE_DIR: PATHS.workspace,

    // 5. 확정된 동적 데이터
    WRITE_URL: `https://blog.naver.com/${process.env.NAVER_ID || userConfig.NAVER_ID}/postwrite`,
    TYPING_SPEED: typingMode,
    TYPING: typingDelay,
    CLOSE_DELAY: closeDelay,

    // 브라우저 채널 처리
    BROWSER_CHANNEL: (userConfig.BROWSER_CHANNEL === 'auto') ? undefined : userConfig.BROWSER_CHANNEL
};
