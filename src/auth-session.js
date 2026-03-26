const fs = require('fs');
const path = require('path');
const CONFIG = require('./config-loader');
const BrowserLauncher = require('./browser-launcher');
const Utils = require('./utils');
const Logger = require('./logger');
const { NAVER_DEFAULT_USER_AGENT } = require('./naver-auth-flow');

let cachedSession = null;
let cachedAtMs = 0;
let sessionCheckInFlight = null;
let lastSessionStateKey = null;

function cloneSessionResult(result) {
    return result ? { ...result } : result;
}

function getSessionStateKey(result) {
    if (result && result.ok === true) return 'valid';
    const reason = String(result?.reason || 'unknown').trim().toLowerCase() || 'unknown';
    return `invalid:${reason}`;
}

function stateKeyToLabel(stateKey) {
    if (!stateKey) return '미확인';
    if (stateKey === 'valid') return '유효';
    if (stateKey === 'invalid:expired') return '만료';
    if (stateKey === 'invalid:missing_auth') return '인증파일 없음';
    if (stateKey === 'invalid:check_failed') return '확인 실패';
    return '오류';
}

function logSessionStateTransition(result) {
    const nextStateKey = getSessionStateKey(result);
    if (lastSessionStateKey === nextStateKey) return;
    lastSessionStateKey = nextStateKey;

    if (result?.ok === true) {
        Logger.info('🔄 [AuthSession] 세션 상태 변경: 로그인 세션이 정상입니다.');
        return;
    }

    if (result?.reason === 'expired') {
        Logger.error('🔄 [AuthSession] 세션 상태 변경: 로그인 정보가 만료되었습니다.');
        return;
    }

    if (result?.reason === 'missing_auth') {
        Logger.warn('🔄 [AuthSession] 세션 상태 변경: naver_auth.json 파일을 찾지 못했습니다.');
        return;
    }

    if (result?.reason === 'check_failed') {
        Logger.warn(`🔄 [AuthSession] 세션 상태 변경: 세션 확인 중 오류가 발생했습니다. (${String(result?.message || 'unknown')})`);
        return;
    }

    Logger.warn(`🔄 [AuthSession] 세션 상태 변경: ${stateKeyToLabel(nextStateKey)}`);
}

async function persistAuthSessionState(context, options = {}) {
    const authPath = String(options.authPath || CONFIG.AUTH_FILE_PATH || '').trim();
    if (!context || !authPath) return false;

    try {
        fs.mkdirSync(path.dirname(authPath), { recursive: true });
        await context.storageState({ path: authPath });
        Logger.debug(`💾 [AuthSession] 최신 인증 상태 저장: ${authPath}`);
        return true;
    } catch (e) {
        Logger.warn(`⚠️ [AuthSession] 인증 상태 저장 실패: ${e.message}`);
        return false;
    }
}

async function performAuthSessionCheck(options = {}) {
    const authPath = CONFIG.AUTH_FILE_PATH;
    if (!authPath || !fs.existsSync(authPath)) {
        return { ok: false, reason: 'missing_auth' };
    }

    let browser = null;
    let context = null;
    Logger.debug("📡 네이버 로그인 세션 유효성 확인 중...");
    try {
        browser = await BrowserLauncher.launchBrowser({ headless: true });
        context = await browser.newContext({
            storageState: authPath,
            userAgent: NAVER_DEFAULT_USER_AGENT
        });
        const page = await context.newPage();
        const checkUrl = CONFIG.WRITE_URL || `https://blog.naver.com/${CONFIG.NAVER_ID}/postwrite`;

        await page.goto(checkUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await Utils.sleep(400);

        const currentUrl = String(page.url() || '');
        if (/nid\.naver\.com/i.test(currentUrl) || /nidlogin\.login/i.test(currentUrl)) {
            return { ok: false, reason: 'expired' };
        }
        await persistAuthSessionState(context, { authPath });
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
        const result = await performAuthSessionCheck(options);
        logSessionStateTransition(result);
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
    checkAuthSessionValid,
    persistAuthSessionState
};
