
const path = require('path');
const fs = require('fs');
const { launchBrowser } = require('./src/browser-launcher');
const CONFIG = require('./src/config-loader');
const Logger = require('./src/logger');

(async () => {
    Logger.info('🔍 디버깅 모드: 트렌드 페이지 접속 및 상태 확인');

    const NAVER_ID = CONFIG.NAVER_ID;
    Logger.info(`   - 설정된 NAVER_ID: ${NAVER_ID}`);

    const browser = await launchBrowser();

    // Auth 로드
    const authPath = path.join(process.cwd(), 'config', 'auth.json');
    let context;
    if (fs.existsSync(authPath)) {
        Logger.info(`   - 인증 파일 로드: ${authPath}`);
        context = await browser.newContext({ storageState: authPath });
    } else {
        Logger.warn('   ⚠️ 인증 파일(auth.json)이 없습니다. 비로그인 상태로 진행합니다.');
        context = await browser.newContext();
    }

    const page = await context.newPage();

    try {
        const targetUrl = `https://creator-advisor.naver.com/naver_blog/${NAVER_ID}/trends`;
        Logger.info(`🔗 접속 시도: ${targetUrl}`);

        await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(3000); // 로딩 대기

        const currentUrl = page.url();
        const pageTitle = await page.title();
        Logger.info(`   👉 현재 URL: ${currentUrl}`);
        Logger.info(`   👉 페이지 제목: ${pageTitle}`);

        // 페이지 텍스트 일부 추출 (에러 메시지 확인용)
        const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 500).replace(/\n/g, ' '));
        Logger.info(`   📄 페이지 텍스트 요약: ${bodyText}`);

        // 스크린샷 저장
        const screenshotPath = 'debug_trend_error.png';
        await page.screenshot({ path: screenshotPath, fullPage: true });
        Logger.info(`   📸 스크린샷 저장됨: ${screenshotPath}`);

        // 트렌드 리스트 존재 여부 확인
        const boxCount = await page.evaluate(() => document.querySelectorAll('.u_ni_trend_list_box').length);
        if (boxCount > 0) {
            Logger.info(`   ✅ 트렌드 박스 ${boxCount}개 발견됨. HTML 덤프를 시도합니다.`);
            const htmlDump = await page.evaluate(() => document.querySelector('.u_ni_trend_list_box').outerHTML);
            fs.writeFileSync('trend_structure_dump.html', htmlDump);
            Logger.info(`   💾 구조 덤프 저장 완료: trend_structure_dump.html`);
        } else {
            Logger.warn('   ⚠️ 트렌드 박스(.u_ni_trend_list_box)를 찾을 수 없습니다.');
        }

    } catch (error) {
        console.error('❌ 오류 발생:', error);
    } finally {
        await browser.close();
    }
})();
