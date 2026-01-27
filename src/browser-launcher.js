// src/browser-launcher.js
const { chromium } = require('playwright');
// 💡 config-loader를 통해 바깥쪽 config/settings.js 내용을 가져옵니다.
const CONFIG = require('./config-loader'); 

async function launchBrowser() {
    // 사용자가 설정한 값 가져오기 (없으면 기본값 'chrome')
    let channel = CONFIG.BROWSER_CHANNEL || 'chrome';

    // 로그가 너무 시끄러우면 주석 처리 가능
    // console.log(`🚀 브라우저 모드: ${channel} (Headless: ${CONFIG.HEADLESS})`);

    const launchOptions = {
        headless: CONFIG.HEADLESS,
        channel: channel, 
        args: ['--no-sandbox', '--disable-setuid-sandbox'] // 호환성 옵션
    };

    try {
        // 1. 설정된 브라우저로 실행 시도
        return await chromium.launch(launchOptions);
    } catch (e) {
        // 2. 실패 시 자동 복구 (Chrome 실패 -> Edge 시도)
        if (channel === 'chrome') {
            console.warn("⚠️ [Info] Chrome 실행 실패. MS Edge로 재시도합니다...");
            launchOptions.channel = 'msedge';
            return await chromium.launch(launchOptions);
        } else {
            // Edge도 안 되면 진짜 에러
            throw e;
        }
    }
}

module.exports = { launchBrowser };
