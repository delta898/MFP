const fs = require('fs');
const CONFIG = require('./config-loader');
const BrowserLauncher = require('./browser-launcher');
const Utils = require('./utils');
const Logger = require('./logger');

let cachedSession = null;
let cachedAtMs = 0;
let sessionCheckInFlight = null;

function cloneSessionResult(result) {
    return result ? { ...result } : result;
}

async function performAuthSessionCheck() {
    const authPath = CONFIG.AUTH_FILE_PATH;
    if (!authPath || !fs.existsSync(authPath)) {
        return { ok: false, reason: 'missing_auth' };
    }

    let browser = null;
    let context = null;
    Logger.info("📡 네이버 로그인 세션 유효성 확인 중...");
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
            Logger.error("🚨 세션 확인 실패: 로그인 정보가 만료되었습니다.");
            return { ok: false, reason: 'expired' };
        }
        Logger.info("✅ 세션 확인 완료: 정상적으로 로그인되어 있습니다.");
        return { ok: true };
    } catch (e) {
        return { ok: false, reason: 'check_failed', message: e.message };
    } finally {
        try { if (context) await context.close(); } catch (e) { }
        try { if (browser) await browser.close(); } catch (e) { }
    }
}

async function checkAuthSessionValid(options = {}) {
    const cacheTtlMs = Number.isFinite(Number(options.cacheTtlMs)) ? Math.max(0, parseInt(options.cacheTtlMs, 10)) : 0;
    const forceRefresh = options.forceRefresh === true;
    const now = Date.now();

    if (!forceRefresh && cacheTtlMs > 0 && cachedSession && (now - cachedAtMs) < cacheTtlMs) {
        return cloneSessionResult(cachedSession);
    }

    if (!forceRefresh && sessionCheckInFlight) {
        return cloneSessionResult(await sessionCheckInFlight);
    }

    sessionCheckInFlight = (async () => {
        const result = await performAuthSessionCheck();
        cachedSession = cloneSessionResult(result);
        cachedAtMs = Date.now();
        return result;
    })();

    try {
        return cloneSessionResult(await sessionCheckInFlight);
    } finally {
        sessionCheckInFlight = null;
    }
}

module.exports = {
    checkAuthSessionValid
};
