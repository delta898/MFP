const path = require('path');
const fs = require('fs');
const { launchBrowser } = require('../src/browser-launcher'); // Import launchBrowser
const CONFIG = require('../src/config-loader');
const Logger = require('../src/logger');

(async () => {
    Logger.info('🔍 [Interactive Debug] 브라우저를 직접 띄워 확인합니다.');
    Logger.info('   사용자께서 직접 로그인 상태와 페이지 로딩을 확인해주세요.');

    const NAVER_ID = CONFIG.NAVER_ID;
    console.log(`\n👉 설정된 NAVER_ID: ${NAVER_ID}`);

    // src/browser-launcher.js의 launchBrowser 사용 (환경 통일)
    // 단, 디버깅을 위해 headless: false 강제 적용을 위해 CONFIG를 잠시 조작하거나, 
    // launchBrowser가 인자를 받도록 수정하는게 좋겠지만, 
    // 여기서는 CONFIG를 런타임에 잠시 수정합니다.
    const originalHeadless = CONFIG.HEADLESS;
    CONFIG.HEADLESS = false;

    // 브라우저 실행
    const browser = await launchBrowser();

    // 복구
    CONFIG.HEADLESS = originalHeadless;

    // Auth 로드 시도 (있으면 사용, 없으면 빈 컨텍스트)
    const authPath = path.join(process.cwd(), 'config', 'naver_auth.json');
    let context;
    if (fs.existsSync(authPath)) {
        Logger.info(`   - 기존 인증 파일 로드: ${authPath}`);
        context = await browser.newContext({ storageState: authPath });
    } else {
        Logger.info('   - 인증 파일 없음. 새 컨텍스트 시작.');
        context = await browser.newContext();
    }

    const page = await context.newPage();

    // 타임아웃 넉넉하게
    page.setDefaultTimeout(60000);

    try {
        const targetUrl = `https://creator-advisor.naver.com/naver_blog/${NAVER_ID}/trends`;

        console.log(`\n🔗 [접속 시도] ${targetUrl}`);
        console.log('   (로그인이 안 되어 있다면 브라우저에서 직접 로그인 해주세요!)');

        await page.goto(targetUrl);

        // 사용자가 볼 수 있도록 충분히 대기 (또는 특정 요소 대기)
        console.log('\n⏳ 페이지 로딩 및 로그인 대기 중... (최대 60초)');

        // 1. 로그인 화면이면 로그인 대기
        if (page.url().includes('nid.naver.com')) {
            console.log('   👉 로그인 화면 감지됨. 로그인을 완료해주세요.');
            await page.waitForURL(url => url.toString().includes('creator-advisor.naver.com'), { timeout: 120000 });
            console.log('   ✅ 로그인 완료 확인 (Creator Advisor로 이동됨)');
        }

        // 2. 트렌드 리스트 박스 대기
        try {
            await page.waitForSelector('.u_ni_trend_list_box', { timeout: 20000 });
            console.log('   ✅ 트렌드 리스트 박스 발견!');
        } catch (e) {
            console.log('   ⚠️ 트렌드 리스트 박스를 아직 못 찾았습니다. (수동 확인 필요)');
        }

        // HTML 덤프
        const htmlDump = await page.evaluate(() => {
            const box = document.querySelector('.u_ni_trend_list_box');
            return box ? box.outerHTML : "NOT_FOUND";
        });

        if (htmlDump !== "NOT_FOUND") {
            fs.writeFileSync('trend_structure_dump.html', htmlDump);
            console.log('\n🎉 [성공] HTML 구조를 trend_structure_dump.html 파일로 저장했습니다.');

            // 스크린샷 
            await page.screenshot({ path: 'debug_interactive_success.png' });
            console.log('   📸 디버그용 스크린샷 저장 완료: debug_interactive_success.png');
        } else {
            console.log('\n❌ [실패] 트렌드 요소를 찾을 수 없었습니다. 화면에 보이는 에러 메시지를 확인해주세요.');
            await page.screenshot({ path: 'debug_interactive_fail.png' });
        }

    } catch (error) {
        console.error('❌ 오류 발생:', error);
    } finally {
        console.log('\n🛑 30초 후 브라우저를 닫습니다. 화면을 확인하세요.');
        await new Promise(r => setTimeout(r, 30000));
        await browser.close();
    }
})();
