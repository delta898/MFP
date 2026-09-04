const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const CONFIG = require('./config-loader');

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
const DEFAULT_SCOPES = [
    'openid',
    'email',
    'profile',
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive.file'
];
const STATE_TTL_MS = 10 * 60 * 1000;
const pendingStates = new Map();

function getOauthClientConfig() {
    return {
        clientId: String(CONFIG.GOOGLE_OAUTH_CLIENT_ID || '').trim(),
        clientSecret: String(CONFIG.GOOGLE_OAUTH_CLIENT_SECRET || '').trim(),
        tokensPath: String(CONFIG.GOOGLE_OAUTH_TOKENS_JSON_PATH || '').trim(),
        redirectUri: ''
    };
}

function getConfigurationStatus() {
    const config = getOauthClientConfig();
    const missing = [];
    if (!config.clientId) missing.push('client_id');
    if (!config.clientSecret) missing.push('client_secret');
    if (!config.tokensPath) missing.push('tokens_path');
    return {
        configured: missing.length === 0,
        missing
    };
}

function ensureConfigured() {
    const config = getOauthClientConfig();
    const status = getConfigurationStatus();
    if (!status.configured) {
        throw new Error('Google OAuth 앱 설정이 준비되지 않았습니다. BlogGenius 앱 설정 또는 버전을 확인해 주세요.');
    }
    return config;
}

function normalizeScopes(scopes = []) {
    const list = Array.isArray(scopes) && scopes.length > 0 ? scopes : DEFAULT_SCOPES;
    return Array.from(new Set(list.map((value) => String(value || '').trim()).filter(Boolean)));
}

function cleanupPendingStates() {
    const now = Date.now();
    for (const [key, entry] of pendingStates.entries()) {
        if (!entry?.createdAt || now - entry.createdAt > STATE_TTL_MS) {
            pendingStates.delete(key);
        }
    }
}

function describeAxiosError(error) {
    const apiMessage = String(
        error?.response?.data?.error_description
        || error?.response?.data?.error
        || error?.message
        || 'unknown error'
    ).trim();
    return apiMessage;
}

function encodeBase64Url(input) {
    return Buffer.from(input)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function buildPkcePair() {
    const verifier = encodeBase64Url(crypto.randomBytes(48));
    const challenge = encodeBase64Url(crypto.createHash('sha256').update(verifier).digest());
    return { verifier, challenge };
}

function readTokens() {
    const { tokensPath } = ensureConfigured();
    if (!fs.existsSync(tokensPath)) return null;
    const parsed = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
}

function writeTokens(tokens = {}) {
    const { tokensPath } = ensureConfigured();
    fs.mkdirSync(path.dirname(tokensPath), { recursive: true });
    fs.writeFileSync(tokensPath, JSON.stringify(tokens, null, 2), 'utf8');
}

function deleteTokens() {
    const { tokensPath } = ensureConfigured();
    if (fs.existsSync(tokensPath)) fs.unlinkSync(tokensPath);
}

function buildAuthUrl(options = {}) {
    cleanupPendingStates();
    const config = ensureConfigured();
    const redirectUri = String(options.redirectUri || '').trim();
    if (!redirectUri) throw new Error('Google OAuth redirect URI가 준비되지 않았습니다.');
    const state = crypto.randomBytes(24).toString('hex');
    const pkce = buildPkcePair();
    const normalizedScopes = normalizeScopes(options.scopes || []);
    pendingStates.set(state, {
        scopes: normalizedScopes,
        redirectUri,
        codeVerifier: pkce.verifier,
        createdAt: Date.now()
    });
    const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: normalizedScopes.join(' '),
        access_type: 'offline',
        include_granted_scopes: 'true',
        prompt: 'consent',
        code_challenge: pkce.challenge,
        code_challenge_method: 'S256',
        state
    });
    return {
        authUrl: `${GOOGLE_AUTH_URL}?${params.toString()}`,
        redirectUri,
        state
    };
}

async function fetchUserInfo(accessToken) {
    const response = await axios.get(GOOGLE_USERINFO_URL, {
        headers: {
            Authorization: `Bearer ${accessToken}`
        }
    });
    return response.data || {};
}

async function exchangeCode(code, state) {
    const config = ensureConfigured();
    const pending = pendingStates.get(String(state || '').trim());
    pendingStates.delete(String(state || '').trim());
    if (!pending) {
        throw new Error('유효하지 않거나 만료된 Google OAuth 요청입니다. 다시 시도해 주세요.');
    }
    const payload = new URLSearchParams({
        code: String(code || '').trim(),
        client_id: config.clientId,
        client_secret: String(config.clientSecret || ''),
        redirect_uri: String(pending.redirectUri || ''),
        code_verifier: String(pending.codeVerifier || ''),
        grant_type: 'authorization_code'
    });
    let tokenResponse;
    try {
        tokenResponse = await axios.post(GOOGLE_TOKEN_URL, payload.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
    } catch (error) {
        throw new Error(`Google 토큰 교환 실패: ${describeAxiosError(error)}`);
    }
    const tokenData = tokenResponse.data || {};
    const userInfo = await fetchUserInfo(tokenData.access_token);
    const nextTokens = {
        provider: 'google',
        connected_email: String(userInfo.email || ''),
        access_token: String(tokenData.access_token || ''),
        refresh_token: String(tokenData.refresh_token || ''),
        expiry_date: Date.now() + Number(tokenData.expires_in || 0) * 1000,
        scope: String(tokenData.scope || pending.scopes.join(' ')),
        token_type: String(tokenData.token_type || 'Bearer'),
        last_verified_at: new Date().toISOString()
    };
    writeTokens(nextTokens);
    return nextTokens;
}

async function refreshAccessToken(scopes = []) {
    const config = ensureConfigured();
    const tokens = readTokens();
    if (!tokens?.refresh_token) {
        throw new Error('Google 계정이 연결되어 있지 않습니다. 먼저 로그인해 주세요.');
    }
    if (tokens.access_token && Number(tokens.expiry_date || 0) > Date.now() + 60_000) {
        return tokens;
    }
    const payload = new URLSearchParams({
        client_id: config.clientId,
        client_secret: String(config.clientSecret || ''),
        refresh_token: String(tokens.refresh_token || ''),
        grant_type: 'refresh_token'
    });
    const tokenResponse = await axios.post(GOOGLE_TOKEN_URL, payload.toString(), {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    });
    const tokenData = tokenResponse.data || {};
    const nextTokens = {
        ...tokens,
        access_token: String(tokenData.access_token || ''),
        expiry_date: Date.now() + Number(tokenData.expires_in || 0) * 1000,
        scope: String(tokenData.scope || tokens.scope || normalizeScopes(scopes).join(' ')),
        token_type: String(tokenData.token_type || tokens.token_type || 'Bearer'),
        last_verified_at: new Date().toISOString()
    };
    writeTokens(nextTokens);
    return nextTokens;
}

async function getAccessToken(scopes = []) {
    const tokens = await refreshAccessToken(scopes);
    if (!tokens?.access_token) {
        throw new Error('Google 액세스 토큰을 가져오지 못했습니다.');
    }
    return {
        accessToken: String(tokens.access_token),
        tokens
    };
}

async function getStatus() {
    try {
        const config = ensureConfigured();
        const tokens = readTokens();
        if (!tokens?.refresh_token) {
            return {
                state: 'disconnected',
            configured: Boolean(config.clientId),
            redirectUri: '',
            connectedEmail: '',
            lastVerifiedAt: '',
            message: 'Google 계정이 아직 연결되지 않았습니다.'
            };
        }
        try {
            const refreshed = await refreshAccessToken();
            return {
                state: 'connected',
                configured: true,
                redirectUri: '',
                connectedEmail: String(refreshed.connected_email || ''),
                lastVerifiedAt: String(refreshed.last_verified_at || ''),
                message: 'Google 계정이 연결되어 있습니다.'
            };
        } catch (error) {
            return {
                state: 'reauth_required',
                configured: true,
                redirectUri: '',
                connectedEmail: String(tokens.connected_email || ''),
                lastVerifiedAt: String(tokens.last_verified_at || ''),
                message: `Google 연결이 만료되었거나 다시 로그인이 필요합니다. (${error.message})`
            };
        }
    } catch (error) {
        return {
            state: 'error',
            configured: false,
            redirectUri: '',
            connectedEmail: '',
            lastVerifiedAt: '',
            message: error.message
        };
    }
}

function peekStatus() {
    try {
        const config = ensureConfigured();
        const tokens = readTokens();
        const connected = Boolean(tokens?.refresh_token);
        return {
            state: connected ? 'connected_cached' : 'disconnected',
            configured: Boolean(config.clientId),
            connected,
            connectedEmail: connected ? String(tokens.connected_email || '') : '',
            lastVerifiedAt: connected ? String(tokens.last_verified_at || '') : '',
            message: connected
                ? '저장된 Google 계정 연결 정보가 있습니다.'
                : 'Google 계정이 아직 연결되지 않았습니다.'
        };
    } catch (error) {
        return {
            state: 'error',
            configured: false,
            connected: false,
            connectedEmail: '',
            lastVerifiedAt: '',
            message: error.message
        };
    }
}

function renderCallbackHtml({ success, message = '', email = '' }) {
    const title = success ? 'Google 연결 완료' : 'Google 연결 실패';
    const description = success
        ? `${email ? `${email} 계정으로 ` : ''}연결이 완료되었습니다. 이 창을 닫고 앱으로 돌아가세요.`
        : `연결 처리 중 오류가 발생했습니다. ${message}`.trim();
    const payload = JSON.stringify({
        source: 'google-oauth',
        status: success ? 'success' : 'error',
        email: String(email || ''),
        message: String(message || '')
    });
    return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;color:#0f172a;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}.card{width:min(92vw,520px);background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:28px;box-shadow:0 10px 30px rgba(15,23,42,.08)}h1{font-size:24px;margin:0 0 12px}p{margin:0;line-height:1.6;color:#475569}</style>
</head><body><div class="card"><h1>${title}</h1><p>${description}</p></div><script>
try {
  if (window.opener && !window.opener.closed) {
    window.opener.postMessage(${payload}, '*');
  }
} catch (_) {}
</script></body></html>`;
}

module.exports = {
    DEFAULT_SCOPES,
    buildAuthUrl,
    deleteTokens,
    exchangeCode,
    getAccessToken,
    getConfigurationStatus,
    getOauthClientConfig,
    getStatus,
    peekStatus,
    readTokens,
    renderCallbackHtml
};
