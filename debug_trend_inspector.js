const fs = require('fs');
const path = require('path');
const BrowserLauncher = require('./src/browser-launcher');
const CONFIG = require('./src/config-loader');

(async () => {
    console.log("🔍 크리에이터 어드바이저 트렌드 페이지 조사 시작...");

    if (!CONFIG.NAVER_ID) {
        console.error("❌ 설정 파일에 NAVER_ID가 없습니다.");
        return;
    }

    const browser = await BrowserLauncher.launchBrowser();
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    // 인증 정보 로드
    const authPath = path.resolve(process.cwd(), CONFIG.AUTH_FILE_PATH || 'config/auth.json');
    if (fs.existsSync(authPath)) {
        console.log("✅ 인증 정보 로드 중...");
        await context.addCookies(JSON.parse(fs.readFileSync(authPath, 'utf-8')).cookies);
    } else {
        console.warn("⚠️ 인증 파일(auth.json)이 없습니다. 로그인이 필요할 수 있습니다.");
    }

    const page = await context.newPage();
    const targetUrl = `https://creator-advisor.naver.com/naver_blog/${CONFIG.NAVER_ID}/trends`;

    console.log(`🌐 접속 시도: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'networkidle' });

    console.log("📸 스크린샷 저장 중 (debug_trends.png)...");
    await page.screenshot({ path: 'debug_trends.png', fullPage: true });

    console.log("📄 HTML구조 저장 중 (debug_trends.html)...");
    const html = await page.content();
    fs.writeFileSync('debug_trends.html', html);

    // API 응답 캡처 시도 (네트워크 로그 분석용)
    // 실제로는 DevTools Protocol이나 page.on('response')를 써야 하지만, 일단 HTML 구조부터 확인.

    console.log("✅ 조사 완료. 브라우저를 닫습니다.");
    await browser.close();
})();
