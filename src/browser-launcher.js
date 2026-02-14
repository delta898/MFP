// src/browser-launcher.js
const { chromium } = require('playwright');
// 💡 config-loader를 통해 config/config.txt 값을 로딩합니다.
const CONFIG = require('./config-loader');

async function launchBrowser(overrides = {}) {
    // 사용자가 설정한 값 가져오기 (없으면 기본값 'chrome')
    const channel = overrides.channel || CONFIG.BROWSER_CHANNEL || 'chrome';

    const launchOptions = {
        headless: typeof overrides.headless === 'boolean' ? overrides.headless : CONFIG.HEADLESS,
        args: overrides.args || ['--no-sandbox', '--disable-setuid-sandbox'] // 호환성 옵션
    };

    // 🔧 [Fixed] 브라우저 채널 자동 복구 개선 (여러 옵션 시도)
    const channelsToTry = channel === 'chrome'
        ? ['chrome', 'msedge', 'chromium']  // Chrome 실패 시 Edge, Chromium 순서로 시도
        : [channel, 'chrome', 'chromium'];   // 사용자 지정 채널 실패 시 fallback

    for (let i = 0; i < channelsToTry.length; i++) {
        const currentChannel = channelsToTry[i];
        try {
            launchOptions.channel = currentChannel;
            const browser = await chromium.launch(launchOptions);
            if (i > 0) {
                console.warn(`⚠️ ${channelsToTry[0]} 실패, ${currentChannel}(으)로 실행합니다.`);
            }
            return browser;
        } catch (e) {
            if (i === channelsToTry.length - 1) {
                // 모든 옵션 실패
                console.error(`❌ 사용 가능한 브라우저를 찾을 수 없습니다.`);
                console.error(`   시도한 채널: ${channelsToTry.join(', ')}`);
                throw new Error(`브라우저 실행 실패: ${e.message}`);
            }
        }
    }
}

module.exports = { launchBrowser };
