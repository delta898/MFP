const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const Core = require('../src/core');
const Utils = require('../src/utils');
const Logger = require('../src/logger');

async function testIntegratedNaverFlow() {
    Logger.info("🚀 Naver Blog Integrated Category & Schedule Test Started");

    const storageStatePath = path.join(__dirname, '../config/auth.json');
    if (!fs.existsSync(storageStatePath)) {
        Logger.error(`❌ Cannot find Naver login state file (${storageStatePath}).`);
        return;
    }

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
        storageState: storageStatePath,
        viewport: { width: 1280, height: 800 }
    });

    const page = await context.newPage();

    try {
        Logger.info("🌐 Navigating to Naver Blog write page...");
        await page.goto('https://blog.naver.com/amadejjs/postwrite');

        Logger.info("⏳ Waiting for editor to load...");
        await Core.waitForBlogEditorReady(page, 30000);
        await Utils.sleep(1000);

        // Close initial popups (using robust Core logic)
        Logger.info("🧹 Closing initial popups...");
        await Core.dismissEditorPopups(page);

        // 1. Click top 'Publish' button
        Logger.info("🖱️ Clicking top 'Publish' button...");
        const topPublishBtn = page.locator('button[class*="publish_btn"], header button:has-text("발행"), .se-publish-button').first();
        await topPublishBtn.click();

        Logger.info("⏳ Waiting for setting layer...");
        const layerSelector = '.se-publish-setting-panel, .se-publish-setting-layer, [class*="publish_setting"], button.confirm_btn__WEaBq';
        await page.waitForSelector(layerSelector, { timeout: 10000 });
        await Utils.sleep(1500);

        // 2. Category Selection Flow
        const targetCategory = "세계문화유산";
        Logger.info(`🎯 Testing [Category]: [${targetCategory}]...`);
        const catSuccess = await Core.selectNaverBlogCategory(page, targetCategory);

        if (catSuccess) {
            Logger.info("✅ SUCCESS: Category selection completed.");
        } else {
            Logger.warn("⚠️ FAILURE: Category selection failed.");
        }

        await Utils.sleep(1000);

        // 3. Schedule Selection Flow
        const targetDate = "2026. 03. 10. 10:57";
        Logger.info(`🎯 Testing [Schedule] (Rounding Test: 57m -> 50m): [${targetDate}]...`);
        await Core.setNaverBlogSchedule(page, targetDate);

        Logger.info("🌟 Test finished. Browser will remain open for 60s for manual inspection.");
        await Utils.sleep(60000);

    } catch (e) {
        Logger.error(`❌ Unexpected error during test: ${e.message}`);
    } finally {
        await browser.close();
        Logger.info("🔒 Browser closed.");
    }
}

testIntegratedNaverFlow();
