const path = require('path');

// 🔥 [Setup] 본인의 네이버 아이디로 변경하세요.
const NAVER_ID = 'amadejjs'; 

module.exports = {
    AUTH_FILE_PATH: path.join(__dirname, 'auth.json'),
    WORKSPACE_DIR: path.join(__dirname, '../workspace'),
    PROMPT_FILE: path.join(__dirname, 'system_prompt.md'),
    
    NAVER_ID: NAVER_ID,
    WRITE_URL: `https://blog.naver.com/${NAVER_ID}/postwrite`,
    
    GEMINI_API_KEY: process.env.GEMINI_APIKEY || 'YOUR_GEMINI_API_KEY_HERE', 
    
    GEMINI_TEXT_ENDPOINT: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent',
    GEMINI_IMAGE_ENDPOINT: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent',
    
    HEADLESS: false, 

    API_CALL_INTERVAL: 5000,
    TYPING: { MIN: 10, MAX: 30 },
    WAIT: { LOAD: 3000, UPLOAD: 2000, SHORT: 100 }
};
