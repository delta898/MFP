const path = require('path');

module.exports = {
    // 🔒 시스템 경로 (사용자가 건드릴 필요 없음)
    AUTH_FILE_PATH: path.join(__dirname, '../config/auth.json'), // 인증 정보도 config 폴더로 이동 추천
    WORKSPACE_DIR: path.join(__dirname, '../../workspace'), // 실행파일 위치 기준 상위/workspace
    PROMPT_FILE: path.join(__dirname, '../config/system_prompt.md'),

    // 🔒 API 엔드포인트
    GEMINI_TEXT_ENDPOINT: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent',
    GEMINI_IMAGE_ENDPOINT: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent',

    // 🔒 기본 대기 시간 (ms)
    WAIT: { 
        LOAD: 3000, 
        UPLOAD: 2000, 
        SHORT: 500 
    },
    
    // 🔒 타이핑 속도 프리셋 (ms)
    TYPING_PRESETS: {
        FAST:   { MIN: 2, MAX: 15 },
        NORMAL: { MIN: 10, MAX: 90 },
        HUMAN:  { MIN: 60, MAX: 150 }
    }
};
