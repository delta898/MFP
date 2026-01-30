const path = require('path');

// 💡 [핵심] __dirname 대신 process.cwd() 사용
// 이렇게 해야 실행 파일이 있는 곳(사용자 PC 폴더)을 기준으로 파일을 찾습니다.
const RUNTIME_ROOT = process.cwd(); 

module.exports = {
    // 🔓 시스템 경로 (사용자 실행 위치 기준)
    
    // 1. 인증 파일: 실행 파일 바로 옆에 'auth.json'이 있다고 가정
    AUTH_FILE_PATH: path.join(RUNTIME_ROOT, 'auth.json'),

    // 2. 워크스페이스: 실행 위치 하위에 'workspace' 폴더 생성/사용
    WORKSPACE_DIR: path.join(RUNTIME_ROOT, 'workspace'), 

    // 3. 프롬프트: 실행 파일 바로 옆에 'system_prompt.md'가 있다고 가정
    // (만약 config 폴더 안에 두고 싶으면 path.join(RUNTIME_ROOT, 'config', 'system_prompt.md') 로 변경)
    PROMPT_FILE: path.join(RUNTIME_ROOT, 'system_prompt.md'),

    // 🔒 API 엔드포인트 (변경 없음)
    GEMINI_TEXT_ENDPOINT: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent',

    GEMINI_IMAGE_ENDPOINT: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent',

    // 🔒 기본 대기 시간 (변경 없음)
    WAIT: { 
        LOAD: 3000, 
        UPLOAD: 2000, 
        SHORT: 500 
    },
    
    // 🔒 타이핑 속도 프리셋 (변경 없음)
    TYPING_PRESETS: {
        FAST:   { MIN: 2, MAX: 15 },
        NORMAL: { MIN: 10, MAX: 90 },
        HUMAN:  { MIN: 60, MAX: 150 }
    }
};
