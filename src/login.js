// src/login.js
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// 설정 파일 경로 (auth.json 저장 위치)
const CONFIG_DIR = path.join(__dirname, '../config');
const AUTH_FILE_PATH = path.join(CONFIG_DIR, 'auth.json');
const NAVER_LOGIN_URL = 'https://nid.naver.com/nidlogin.login';

(async () => {
    console.log("🚀 [Login Mode] 네이버 로그인 브라우저를 엽니다...");
    console.log("🔑 브라우저가 뜨면 사용자가 직접 로그인해주세요. (2단계 인증 포함)");
    console.log("⏳ 로그인이 완료되어 네이버 메인으로 이동하면 자동으로 저장하고 종료됩니다.");

    // 1. 브라우저 열기 (Headless: false 필수 - 사용자가 봐야 함)
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
    
    const page = await context.newPage();

    try {
        // 2. 로그인 페이지 이동
        await page.goto(NAVER_LOGIN_URL);

        // 3. 로그인 완료 대기
        // 사용자가 ID/PW 입력하고 로그인 버튼 눌러서 -> 'https://www.naver.com' 메인으로 갈 때까지 무한 대기
        // timeout: 0 (제한시간 없음. 사용자가 2단계 인증 찾느라 늦을 수 있으므로)
        await page.waitForURL('https://www.naver.com/**', { timeout: 0 });

        console.log("✅ 로그인 감지됨! 쿠키 정보를 추출합니다...");

        // 4. 쿠키 및 세션 정보 추출 (storageState)
        // config 폴더가 없으면 생성
        if (!fs.existsSync(CONFIG_DIR)) {
            fs.mkdirSync(CONFIG_DIR, { recursive: true });
        }

        // 파일로 저장
        await context.storageState({ path: AUTH_FILE_PATH });

        console.log(`💾 인증 정보 저장 완료: ${AUTH_FILE_PATH}`);
        console.log("🎉 이제 'npm run auto'를 실행할 수 있습니다!");

    } catch (e) {
        if (e.message.includes('Target closed')) {
            console.log("⚠️ 사용자가 브라우저를 강제로 닫았습니다. 로그인이 취소되었습니다.");
        } else {
            console.error("❌ 에러 발생:", e);
        }
    } finally {
        await browser.close();
    }
})();
