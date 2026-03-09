const path = require('path');
const fs = require('fs');

// 앱 버전 정보 로드 (명시적 로딩)
let APP_VERSION = '0.0.0';
try {
    const pkgPath = path.join(__dirname, '..', 'package.json');
    if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        APP_VERSION = pkg.version || '0.0.0';
    } else {
        // node_modules 모드 고려
        APP_VERSION = require('../package.json').version || '0.0.0';
    }
} catch (e) {
    // fallback
}

const RUNTIME_ROOT = process.env.BLOG_GENIUS_USER_DATA || process.cwd();

module.exports = {
    APP_VERSION,
    // 🔓 시스템 경로 (사용자 실행 위치 기준)

    // 1. 인증 파일: 실행 파일 바로 옆에 'auth.json'이 있다고 가정
    AUTH_FILE_PATH: path.join(RUNTIME_ROOT, 'auth.json'),

    // 2. 워크스페이스: 실행 위치 하위에 'workspace' 폴더 생성/사용
    WORKSPACE_DIR: path.join(RUNTIME_ROOT, 'workspace'),

    // 3. 블로그 기본 프롬프트(내부 파일)
    // 사용자 오버라이드는 config-loader에서 config/blog_prompt.md 우선 적용
    PROMPT_FILE: path.join(__dirname, 'config', 'blog_prompt.md'),

    // 🔒 API 엔드포인트 (변경 없음)
    GEMINI_TEXT_ENDPOINT: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent',

    GEMINI_IMAGE_ENDPOINT: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent',

    // 🔒 기본 대기 시간 (변경 없음)
    WAIT: {
        LOAD: 3000,
        UPLOAD: 2000,
        SHORT: 500
    },

    // 🔒 타이핑 속도 프리셋 (ms/문자)
    TYPING_PRESETS: {
        QUICK: { MIN: 0, MAX: 2 },
        FAST: { MIN: 1, MAX: 8 },
        NORMAL: { MIN: 5, MAX: 45 },
        HUMAN: { MIN: 24, MAX: 60 }
    },

    // 🔒 외부 참고 설정 (내부 변수 - 사용자 설정 아님)
    REFERENCE_BLOG_COUNT: 3,  // 자동 참고할 인기 블로그 글 수

    // 🔄 업데이트 관련 설정
    DEFAULT_UPDATE_MIRROR_REPO: 'delta898/NaverAutoBlog-Releases',
    UPDATE_CHECK_INTERVAL_MS: 1000 * 60 * 60 * 6, // 6시간마다 체크
    UPDATE_TEMP_DIR: 'tmp_update'
};
