const fs = require('fs');
const CONFIG = require('./config-loader');
const BrowserLauncher = require('./browser-launcher');
const Utils = require('./utils');

async function checkAuthSessionValid() {
    const authPath = CONFIG.AUTH_FILE_PATH;
    if (!authPath || !fs.existsSync(authPath)) {
        return { ok: false, reason: 'missing_auth' };
    }

    let browser = null;
    let context = null;
    try {
        browser = await BrowserLauncher.launchBrowser({ headless: true });
        context = await browser.newContext({
            storageState: authPath,
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        const page = await context.newPage();
        const checkUrl = CONFIG.WRITE_URL || `https://blog.naver.com/${CONFIG.NAVER_ID}/postwrite`;

        await page.goto(checkUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await Utils.sleep(400);

        const currentUrl = String(page.url() || '');
        if (/nid\.naver\.com/i.test(currentUrl) || /nidlogin\.login/i.test(currentUrl)) {
            return { ok: false, reason: 'expired' };
        }
        return { ok: true };
    } catch (e) {
        return { ok: false, reason: 'check_failed', message: e.message };
    } finally {
        try { if (context) await context.close(); } catch (e) { }
        try { if (browser) await browser.close(); } catch (e) { }
    }
}

module.exports = {
    checkAuthSessionValid
};

