const fs = require('fs');
const path = require('path');
const CONFIG = require('./config-loader');
const BrowserLauncher = require('./browser-launcher');
const Utils = require('./utils');
const Logger = require('./logger');
const { NAVER_DEFAULT_USER_AGENT } = require('./naver-auth-flow');

let cachedSession = null;
let cachedAtMs = 0;
let cachedSessionConfigKey = '';
let sessionCheckInFlight = null;
let lastSessionStateKey = null;
let sessionStateGeneration = 0;

function cloneSessionResult(result) {
    return result ? { ...result } : result;
}

function getSessionConfigKey() {
    return [
        String(CONFIG.AUTH_FILE_PATH || '').trim(),
        String(CONFIG.NAVER_ID || '').trim().toLowerCase(),
        String(CONFIG.WRITE_URL || '').trim()
    ].join('\u0000');
}

function peekAuthSessionState() {
    const authPath = String(CONFIG.AUTH_FILE_PATH || '').trim();
    if (!authPath || !fs.existsSync(authPath)) {
        return { ok: false, reason: 'missing_auth', checked: true };
    }
    if (cachedSession && cachedSessionConfigKey === getSessionConfigKey()) {
        return { ...cloneSessionResult(cachedSession), checked: true, checkedAt: cachedAtMs || null };
    }
    return { ok: false, reason: 'not_checked', checked: false };
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

    const sessionConfigKey = getSessionConfigKey();
    if (!forceRefresh && cacheTtlMs > 0 && cachedSession
        && cachedSessionConfigKey === sessionConfigKey
        && (now - cachedAtMs) < cacheTtlMs) {
        return cloneSessionResult(cachedSession);
    }

    if (!forceRefresh && sessionCheckInFlight) {
        return cloneSessionResult(await sessionCheckInFlight);
    }

    const checkGeneration = sessionStateGeneration;
    sessionCheckInFlight = (async () => {
        const result = await performAuthSessionCheck(options);
        if (checkGeneration !== sessionStateGeneration) {
            return { ok: false, reason: 'missing_auth' };
        }
        logSessionStateTransition(result);
        cachedSession = cloneSessionResult(result);
        cachedAtMs = Date.now();
        cachedSessionConfigKey = sessionConfigKey;
        return result;
    })();

    try {
        return cloneSessionResult(await sessionCheckInFlight);
    } finally {
        sessionCheckInFlight = null;
    }
}

async function clearAuthSession(options = {}) {
    const authPath = String(options.authPath || CONFIG.AUTH_FILE_PATH || '').trim();
    if (!authPath) {
        throw new Error('네이버 인증 파일 경로가 설정되어 있지 않습니다.');
    }

    const inFlightCheck = sessionCheckInFlight;
    sessionStateGeneration += 1;
    if (inFlightCheck) {
        try {
            await inFlightCheck;
        } catch (_ignore) {
            // 확인 중이던 세션의 성공/실패와 관계없이 아래에서 인증 정보를 제거한다.
        }
    }

    const removed = fs.existsSync(authPath);
    if (removed) fs.unlinkSync(authPath);

    sessionCheckInFlight = null;
    cachedSession = { ok: false, reason: 'missing_auth' };
    cachedAtMs = Date.now();
    cachedSessionConfigKey = getSessionConfigKey();
    logSessionStateTransition(cachedSession);

    return { ok: true, removed };
}

module.exports = {
    checkAuthSessionValid,
    peekAuthSessionState,
    persistAuthSessionState,
    clearAuthSession
};
