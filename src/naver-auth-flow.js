const fs = require('fs');
const path = require('path');

const CONFIG = require('./config-loader');
const BrowserLauncher = require('./browser-launcher');
const Utils = require('./utils');
const Logger = require('./logger');

const NAVER_LOGIN_URL = 'https://nid.naver.com/nidlogin.login';
const NAVER_DEFAULT_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function emitFlowState(onStateChange, patch = {}) {
    if (typeof onStateChange !== 'function') return;
    onStateChange(patch);
}

function isNaverLoginCompletedUrl(urlLike) {
    const urlStr = String(urlLike || '');
    return /naver\.com/i.test(urlStr) && !/nid\.naver\.com|nidlogin\.login/i.test(urlStr);
}

async function waitForNaverLoginCompleted(page, context, timeoutMs = 300000) {
    const start = Date.now();
    const pollIntervalMs = 500;

    const samePageWait = page.waitForURL(url => isNaverLoginCompletedUrl(url), { timeout: timeoutMs })
        .then(() => 'same-page-url')
        .catch(() => null);

    const pollWait = (async () => {
        while (Date.now() - start < timeoutMs) {
            for (const openedPage of context.pages()) {
                try {
                    if (isNaverLoginCompletedUrl(openedPage.url())) {
                        return 'any-page-url';
                    }
                } catch (e) { }
            }

            try {
                const cookies = await context.cookies([
                    'https://www.naver.com',
                    'https://naver.com',
                    'https://nid.naver.com'
                ]);
                const hasAuthCookie = cookies.some(cookie =>
                    cookie && (cookie.name === 'NID_AUT' || cookie.name === 'NID_SES')
                );
                if (hasAuthCookie) {
                    return 'auth-cookie';
                }
            } catch (e) { }

            await Utils.sleep(pollIntervalMs);
        }
        return null;
    })();

    const reason = await Promise.race([samePageWait, pollWait]);
    if (!reason) {
        throw new Error('네이버 로그인 완료를 확인하지 못했습니다. 다시 시도해 주세요.');
    }
    return reason;
}

async function closeBrowserResources(context, browser) {
    try { if (context) await context.close(); } catch (e) { }
    try { if (browser) await browser.close(); } catch (e) { }
}

async function saveAuthStorageState(context, authPath = CONFIG.AUTH_FILE_PATH) {
    const targetPath = String(authPath || '').trim();
    if (!context || !targetPath) {
        throw new Error('인증 저장 경로가 비어 있습니다.');
    }
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    await context.storageState({ path: targetPath });
    return targetPath;
}

async function runInteractiveNaverLoginFlow(options = {}) {
    const timeoutMs = Number.isFinite(Number(options.timeoutMs)) ? Math.max(1000, parseInt(options.timeoutMs, 10)) : 300000;
    const authPath = String(options.authPath || CONFIG.AUTH_FILE_PATH || '').trim();
    const onStateChange = typeof options.onStateChange === 'function' ? options.onStateChange : null;

    let browser = null;
    let context = null;

    try {
        emitFlowState(onStateChange, { phase: 'launching_browser', message: '브라우저 실행 중...' });
        browser = await BrowserLauncher.launchBrowser({ headless: false });
        Logger.info('🔐 네이버 로그인 브라우저 실행 완료');

        context = await browser.newContext({
            userAgent: NAVER_DEFAULT_USER_AGENT
        });
        const page = await context.newPage();

        emitFlowState(onStateChange, { phase: 'opening_login_page', message: '로그인 페이지를 여는 중...' });
        await page.goto(NAVER_LOGIN_URL, { waitUntil: 'domcontentloaded' });

        emitFlowState(onStateChange, { phase: 'waiting_for_login', message: '브라우저에서 로그인 후 완료를 기다리는 중...' });
        const detectedBy = await waitForNaverLoginCompleted(page, context, timeoutMs);

        const savedAuthPath = await saveAuthStorageState(context, authPath);
        Logger.info(`✅ 네이버 로그인 인증 저장 완료: ${savedAuthPath}`);

        return {
            authPath: savedAuthPath,
            detectedBy
        };
    } finally {
        await closeBrowserResources(context, browser);
    }
}

module.exports = {
    NAVER_LOGIN_URL,
    NAVER_DEFAULT_USER_AGENT,
    isNaverLoginCompletedUrl,
    waitForNaverLoginCompleted,
    closeBrowserResources,
    saveAuthStorageState,
    runInteractiveNaverLoginFlow
};
