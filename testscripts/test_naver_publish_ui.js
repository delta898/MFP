const fs = require('fs');
const path = require('path');

async function testNaverPublishModal() {
    console.log("🚀 Naver Blog Publish Modal Test Script Started");

    let storageStatePath = null;
    const authPath = path.join(__dirname, '../config/auth.json');
    if (fs.existsSync(authPath)) {
        storageStatePath = authPath;
    }

    if (!storageStatePath) {
        console.error("❌ Cannot find Naver login state file. Please login first.");
        return;
    }
    console.log(`✅ Using login state from: ${storageStatePath}`);

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
        storageState: storageStatePath,
        viewport: { width: 1280, height: 800 }
    });

    const page = await context.newPage();

    // 네이버 블로그 스마트에디터 ONE 쓰기 페이지로 이동
    console.log("🌐 Navigating to Naver Blog write page...");
    await page.goto('https://blog.naver.com/amadejjs/postwrite');

    // 에디터 로딩 대기
    console.log("⏳ Waiting for editor to load (5 seconds)...");
    await page.waitForTimeout(5000);

    // 팝업 제거 시도 (도움말 패널 등)
    try {
        const cancelBtn = page.locator('.se-help-panel-close-button, .se-popup-button-cancel');
        if (await cancelBtn.count() > 0 && await cancelBtn.first().isVisible()) {
            await cancelBtn.first().click();
            console.log("🧹 Closed initial popup.");
        }
    } catch (e) { /* ignore */ }

    // 1. 우측 상단 '발행' 버튼 클릭 (팝업 열기)
    try {
        console.log("🖱️ Clicking the top initial 'Publish' button...");
        const topPublishBtn = page.locator('button[class*="publish_btn"], header button:has-text("발행")').first();
        await topPublishBtn.click();

        console.log("⏳ Waiting for publish settings layer to appear (2 seconds)...");
        await page.waitForTimeout(2000);
    } catch (e) {
        console.error("❌ Failed to click top publish button:", e);
    }

    // 2. 카테고리 셀렉트 박스 클릭 (드롭다운 열기)
    try {
        console.log("🖱️ Trying to open category dropdown...");
        const categoryBtnSelectors = [
            '.se-publish-setting-panel .se-select-button',
            '.se-category-select-button',
            'button:has-text("카테고리")' // 매우 넓은 범위
        ];

        let foundCat = false;
        for (const sel of categoryBtnSelectors) {
            const btn = page.locator(sel).first();
            if (await btn.count() > 0 && await btn.isVisible()) {
                await btn.click();
                console.log(`✅ Category dropdown opened via selector: ${sel}`);
                foundCat = true;
                break;
            }
        }
        if (!foundCat) console.log("⚠️ Could not find category dropdown button.");
    } catch (e) {
        console.error("❌ Category select error:", e);
    }

    console.log("⏳ Wait (2 seconds)...");
    await page.waitForTimeout(2000);

    // 3. '예약' 라디오 버튼 클릭 테스트
    try {
        console.log("🖱️ Trying to click 'Schedule (예약)' radio button...");
        const scheduleRadioSelectors = [
            'input[name="publish-type"][value="schedule"]',
            'label:has-text("예약")',
            '.se-publish-setting-panel input[value="schedule"]'
        ];

        let foundSchedule = false;
        for (const sel of scheduleRadioSelectors) {
            const radio = page.locator(sel).first();
            if (await radio.count() > 0 && await radio.isVisible()) {
                await radio.click();
                console.log(`✅ Schedule option clicked via selector: ${sel}`);
                foundSchedule = true;
                break;
            }
        }
        if (!foundSchedule) console.log("⚠️ Could not find schedule radio button.");
    } catch (e) {
        console.error("❌ Schedule select error:", e);
    }

    console.log("==========================================================");
    console.log("🌟 Browser is currently OPEN on your screen.");
    console.log("🌟 You have 120 seconds to inspect the DOM using Chrome DevTools.");
    console.log("🌟 Check the exact class names for Category items, Date picker, Time picker!");
    console.log("==========================================================");

    // 유저가 DOM을 분석할 수 있도록 대기
    await page.waitForTimeout(120000);

    console.log("🔚 Closing browser...");
    await browser.close();
}

testNaverPublishModal().catch(console.error);
