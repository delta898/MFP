'use strict';

const crypto = require('node:crypto');
const http = require('node:http');

const AUTHORIZATION_URL = 'https://dash.cloudflare.com/oauth2/auth';
const TOKEN_URL = 'https://dash.cloudflare.com/oauth2/token';
const REVOKE_URL = 'https://dash.cloudflare.com/oauth2/revoke';
const MEMBERSHIPS_URL = 'https://api.cloudflare.com/client/v4/memberships';
const CALLBACK_HOST = '127.0.0.1';
const CALLBACK_PORT = 43127;
const CALLBACK_PATH = '/oauth/callback';
const REDIRECT_URI = `http://${CALLBACK_HOST}:${CALLBACK_PORT}${CALLBACK_PATH}`;
const FLOW_TTL_MS = 10 * 60 * 1000;
const {
    DEFAULT_CLOUDFLARE_OAUTH_SCOPES,
    normalizeCloudflareOAuthScopes
} = require('../environment/oauth-config');
const DEFAULT_OAUTH_REQUESTED_SCOPES = DEFAULT_CLOUDFLARE_OAUTH_SCOPES;

function normalizeRequestedScopes(value) {
    return normalizeCloudflareOAuthScopes(value).join(' ');
}

function createCloudflareConnectionService(deps = {}) {
    const {
        clientId = '',
        requestedScopes = '',
        credentialStore,
        safeStorage: safeStorageOverride = null,
        openExternal = async (url) => {
            const electron = require('electron');
            if (!electron?.shell?.openExternal) throw new Error('시스템 브라우저를 실행할 수 없습니다.');
            await electron.shell.openExternal(url);
        },
        createServer = (handler) => http.createServer(handler),
        listen = (server) => new Promise((resolve, reject) => {
            const onError = (error) => reject(error);
            server.once('error', onError);
            server.listen(CALLBACK_PORT, CALLBACK_HOST, () => {
                server.removeListener('error', onError);
                resolve();
            });
        }),
        fetchImpl = (...args) => fetch(...args),
        now = () => Date.now(),
        randomBytes = crypto.randomBytes,
        createHash = crypto.createHash
    } = deps;

    const oauthRequestedScopes = normalizeRequestedScopes(requestedScopes);

    const flows = new Map();
    let accessTokenCache = null;
    let accessTokenRefreshPromise = null;
    let refreshTokenCache;
    let refreshTokenReadPromise = null;

    function requireClientId() {
        const value = String(clientId || '').trim();
        if (!value) {
            const error = new Error('Cloudflare OAuth Client ID가 앱 설정에 없습니다.');
            error.status = 503;
            error.apiCode = 'CLOUDFLARE_OAUTH_NOT_CONFIGURED';
            throw error;
        }
        return value;
    }

    function getSafeStorage() {
        if (safeStorageOverride) return safeStorageOverride;
        const electron = require('electron');
        if (!electron?.safeStorage) throw new Error('OS 보호 저장소를 사용할 수 없습니다.');
        return electron.safeStorage;
    }

    async function readRefreshToken() {
        if (typeof refreshTokenCache === 'string') return refreshTokenCache;
        if (refreshTokenReadPromise) return refreshTokenReadPromise;
        refreshTokenReadPromise = (async () => {
            const encrypted = await credentialStore.read();
            if (!encrypted) {
                refreshTokenCache = '';
                return '';
            }
            const safeStorage = getSafeStorage();
            if (typeof safeStorage.decryptStringAsync !== 'function'
                || typeof safeStorage.isEncryptionAvailable !== 'function'
                || !safeStorage.isEncryptionAvailable()) {
                throw new Error('이 기기에서 Cloudflare 연결 정보를 안전하게 읽을 수 없습니다.');
            }
            const decrypted = await safeStorage.decryptStringAsync(Buffer.from(encrypted, 'base64'));
            const token = typeof decrypted === 'string' ? decrypted : String(decrypted?.result || '');
            if (!token) throw new Error('저장된 Cloudflare 연결 정보를 복호화하지 못했습니다.');
            if (decrypted?.shouldReEncrypt) await saveRefreshToken(token);
            else refreshTokenCache = token;
            return token;
        })();
        try {
            return await refreshTokenReadPromise;
        } finally {
            refreshTokenReadPromise = null;
        }
    }

    async function saveRefreshToken(token) {
        const safeStorage = getSafeStorage();
        if (typeof safeStorage.encryptStringAsync !== 'function'
            || typeof safeStorage.isEncryptionAvailable !== 'function'
            || !safeStorage.isEncryptionAvailable()) {
            throw new Error('이 기기에서 안전한 Cloudflare 연결 저장소를 사용할 수 없습니다.');
        }
        const encrypted = await safeStorage.encryptStringAsync(String(token));
        await credentialStore.write(Buffer.from(encrypted).toString('base64'));
        refreshTokenCache = String(token);
    }

    async function postForm(url, fields) {
        const response = await fetchImpl(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(fields)
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error('Cloudflare 인증 서버가 요청을 처리하지 못했습니다.');
            error.status = response.status === 401 ? 401 : 502;
            error.apiCode = String(payload.error || 'CLOUDFLARE_OAUTH_REQUEST_FAILED');
            throw error;
        }
        return payload;
    }

    async function exchangeAuthorizationCode(code, verifier) {
        const tokens = await postForm(TOKEN_URL, {
            grant_type: 'authorization_code',
            client_id: requireClientId(),
            redirect_uri: REDIRECT_URI,
            code,
            code_verifier: verifier
        });
        if (!tokens.access_token || !tokens.refresh_token) {
            const error = new Error('Cloudflare가 장기 연결 정보를 발급하지 않았습니다. OAuth Client의 Refresh Token 설정을 확인해 주세요.');
            error.apiCode = 'CLOUDFLARE_REFRESH_TOKEN_MISSING';
            throw error;
        }
        await saveRefreshToken(tokens.refresh_token);
        accessTokenCache = {
            token: String(tokens.access_token),
            expiresAt: now() + Math.max(0, Number(tokens.expires_in) || 0) * 1000
        };
    }

    async function getAccessToken({ forceRefresh = false, refreshToken: knownRefreshToken } = {}) {
        if (!forceRefresh && accessTokenCache && accessTokenCache.expiresAt > now() + 60_000) {
            return accessTokenCache.token;
        }
        if (accessTokenRefreshPromise) return accessTokenRefreshPromise;
        accessTokenRefreshPromise = (async () => {
            const refreshToken = typeof knownRefreshToken === 'string'
                ? knownRefreshToken
                : await readRefreshToken();
            if (!refreshToken) return '';
            const tokens = await postForm(TOKEN_URL, {
                grant_type: 'refresh_token',
                client_id: requireClientId(),
                refresh_token: refreshToken
            });
            if (!tokens.access_token) throw new Error('Cloudflare token 갱신 응답에 access token이 없습니다.');
            const rotatedRefreshToken = String(tokens.refresh_token || refreshToken);
            if (rotatedRefreshToken !== refreshToken) await saveRefreshToken(rotatedRefreshToken);
            accessTokenCache = {
                token: String(tokens.access_token),
                expiresAt: now() + Math.max(0, Number(tokens.expires_in) || 0) * 1000
            };
            return accessTokenCache.token;
        })();
        try {
            return await accessTokenRefreshPromise;
        } finally {
            accessTokenRefreshPromise = null;
        }
    }

    async function loadMemberships(token, didRefreshRetry = false) {
        const accounts = [];
        for (let page = 1; page <= 1000; page += 1) {
            const url = new URL(MEMBERSHIPS_URL);
            url.search = new URLSearchParams({ page: String(page), per_page: '50' }).toString();
            const response = await fetchImpl(url.toString(), {
                headers: { Authorization: `Bearer ${token}` }
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || payload.success !== true) {
                if (response.status === 401 && !didRefreshRetry) {
                    return loadMemberships(await getAccessToken({ forceRefresh: true }), true);
                }
                const error = new Error('Cloudflare 계정 목록을 불러오지 못했습니다. 권한을 확인하고 다시 연결해 주세요.');
                error.status = response.status === 401 || response.status === 403 ? 403 : 502;
                error.apiCode = 'CLOUDFLARE_MEMBERSHIPS_READ_FAILED';
                throw error;
            }
            const rows = Array.isArray(payload.result) ? payload.result : [];
            accounts.push(...rows.map((membership) => ({
                id: String(membership?.account?.id || ''),
                name: String(membership?.account?.name || '이름 없는 계정'),
                roles: Array.isArray(membership?.roles) ? membership.roles.map((role) => String(role?.name || role)).filter(Boolean) : []
            })).filter((account) => account.id));
            const totalPages = Number(payload.result_info?.total_pages);
            if (Number.isFinite(totalPages) && totalPages > 0 ? page >= totalPages : rows.length < 50) break;
        }
        return accounts;
    }

    function finishFlow(flow, status, result = {}) {
        if (flow.status !== 'pending' && flow.status !== 'exchanging') return;
        flow.status = status;
        flow.result = result;
        flow.state = '';
        flow.verifier = '';
        flow.authUrl = '';
        flow.server?.close(() => {});
        clearTimeout(flow.expiryTimer);
        flow.cleanupTimer = setTimeout(() => flows.delete(flow.id), 2 * 60 * 1000);
        flow.cleanupTimer.unref?.();
    }

    function callbackHtml(message) {
        const safe = String(message).replace(/[&<>"']/g, (char) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[char]));
        return `<!doctype html><html lang="ko"><meta charset="utf-8"><title>BlogGenius</title><body style="font:16px system-ui;max-width:36rem;margin:15vh auto;padding:0 1rem"><h1>${safe}</h1><p>이 창을 닫고 BlogGenius로 돌아가세요.</p></body></html>`;
    }

    return {
        async getStatus() {
            const refreshToken = await readRefreshToken();
            if (!refreshToken) return { connected: false, accounts: [] };
            const token = await getAccessToken({ refreshToken });
            const accounts = await loadMemberships(token);
            return { connected: true, accounts };
        },

        async getDeploymentCredentials() {
            const refreshToken = await readRefreshToken();
            if (!refreshToken) {
                const error = new Error('먼저 Cloudflare를 연결해 주세요.');
                error.status = 409;
                error.apiCode = 'CLOUDFLARE_CONNECTION_REQUIRED';
                throw error;
            }
            const token = await getAccessToken({ refreshToken });
            const accounts = await loadMemberships(token);
            if (!accounts.length) {
                const error = new Error('배포할 수 있는 Cloudflare 계정이 없습니다.');
                error.status = 409;
                error.apiCode = 'CLOUDFLARE_ACCOUNT_REQUIRED';
                throw error;
            }
            return { accessToken: token, account: accounts[0] };
        },

        async start() {
            const active = [...flows.values()].find((flow) => flow.status === 'pending');
            if (active) {
                const error = new Error('이미 Cloudflare 인증이 진행 중입니다.');
                error.status = 409;
                error.apiCode = 'CLOUDFLARE_OAUTH_FLOW_ACTIVE';
                throw error;
            }
            const id = randomBytes(16).toString('hex');
            const state = randomBytes(32).toString('hex');
            const verifier = Buffer.from(randomBytes(48)).toString('base64url');
            const challenge = createHash('sha256').update(verifier).digest('base64url');
            const authUrl = new URL(AUTHORIZATION_URL);
            authUrl.search = new URLSearchParams({
                client_id: requireClientId(),
                redirect_uri: REDIRECT_URI,
                response_type: 'code',
                scope: oauthRequestedScopes,
                prompt: 'consent',
                state,
                code_challenge: challenge,
                code_challenge_method: 'S256'
            }).toString();
            const flow = { id, state, verifier, authUrl: authUrl.toString(), status: 'pending', result: {} };
            flow.server = createServer(async (request, response) => {
                const callback = new URL(request.url || '/', `http://${CALLBACK_HOST}`);
                if (request.method !== 'GET' || callback.pathname !== CALLBACK_PATH) {
                    response.writeHead(404).end('Not found');
                    return;
                }
                if (flow.status !== 'pending') {
                    response.writeHead(409).end('This authorization attempt has already been handled.');
                    return;
                }
                if (callback.searchParams.get('state') !== flow.state) {
                    response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' }).end(callbackHtml('인증 상태를 확인하지 못했습니다.'));
                    return;
                }
                const providerError = callback.searchParams.get('error');
                if (providerError) {
                    const providerCode = String(providerError).replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 80);
                    const description = String(callback.searchParams.get('error_description') || '')
                        .replace(/[\u0000-\u001f\u007f]/g, ' ')
                        .replace(/\s+/g, ' ')
                        .trim()
                        .slice(0, 300);
                    const message = providerCode === 'invalid_scope'
                        ? `Cloudflare OAuth Client에서 요청 권한을 허용하지 않았습니다.${description ? ` (${description})` : ''}`
                        : providerCode === 'access_denied'
                            ? 'Cloudflare 권한 승인이 취소되었거나 거부되었습니다.'
                            : `Cloudflare 권한 승인이 완료되지 않았습니다.${providerCode ? ` (${providerCode})` : ''}${description ? `: ${description}` : ''}`;
                    finishFlow(flow, 'failed', { message });
                    response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' }).end(callbackHtml(message));
                    return;
                }
                flow.status = 'exchanging';
                try {
                    await exchangeAuthorizationCode(String(callback.searchParams.get('code') || ''), flow.verifier);
                    finishFlow(flow, 'completed', { message: 'Cloudflare 연결을 완료했습니다.' });
                    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(callbackHtml('Cloudflare 연결을 완료했습니다.'));
                } catch (error) {
                    finishFlow(flow, 'failed', { message: error.message || 'Cloudflare 연결을 완료하지 못했습니다.' });
                    response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' }).end(callbackHtml('Cloudflare 연결을 완료하지 못했습니다.'));
                }
            });
            try {
                await listen(flow.server);
            } catch (error) {
                if (error?.code === 'EADDRINUSE' || error?.code === 'EACCES') {
                    const friendly = new Error('Cloudflare 인증용 로컬 주소를 사용할 수 없습니다. 다른 인증 창을 닫고 다시 시도해 주세요.');
                    friendly.status = 409;
                    friendly.apiCode = 'CLOUDFLARE_CALLBACK_UNAVAILABLE';
                    throw friendly;
                }
                throw error;
            }
            flow.expiryTimer = setTimeout(() => finishFlow(flow, 'expired', { message: '인증 시간이 만료되었습니다. 다시 시도해 주세요.' }), FLOW_TTL_MS);
            flow.expiryTimer.unref?.();
            flows.set(id, flow);
            try {
                await openExternal(flow.authUrl);
            } catch (error) {
                finishFlow(flow, 'failed', { message: '시스템 브라우저를 열지 못했습니다.' });
                throw error;
            }
            return { flowId: id, status: 'pending' };
        },

        getFlow(flowId) {
            const flow = flows.get(String(flowId || '').trim());
            if (!flow) {
                const error = new Error('Cloudflare 인증 요청이 만료되었습니다. 다시 시도해 주세요.');
                error.status = 404;
                error.apiCode = 'CLOUDFLARE_OAUTH_FLOW_NOT_FOUND';
                throw error;
            }
            return { flowId: flow.id, status: flow.status === 'exchanging' ? 'pending' : flow.status, ...(flow.result || {}) };
        },

        cancel(flowId) {
            const flow = flows.get(String(flowId || '').trim());
            if (flow?.status === 'exchanging') return { cancelled: false };
            if (flow) finishFlow(flow, 'cancelled', { message: 'Cloudflare 연결을 취소했습니다.' });
            return { cancelled: true };
        },

        async disconnect() {
            const refreshToken = await readRefreshToken();
            if (!refreshToken) return { disconnected: true };
            await postForm(REVOKE_URL, {
                client_id: requireClientId(),
                token: refreshToken,
                token_type_hint: 'refresh_token'
            });
            accessTokenCache = null;
            await credentialStore.clear();
            refreshTokenCache = '';
            return { disconnected: true };
        }
    };
}

function createEncryptedCredentialStore({ filePath, fsImpl = require('node:fs'), pathImpl = require('node:path') } = {}) {
    if (!filePath) throw new Error('Cloudflare credential file path is required.');
    return {
        async read() {
            try {
                const payload = JSON.parse(await fsImpl.promises.readFile(filePath, 'utf8'));
                return typeof payload.encryptedRefreshToken === 'string' ? payload.encryptedRefreshToken : '';
            } catch (error) {
                if (error?.code === 'ENOENT') return '';
                throw new Error('저장된 Cloudflare 연결 정보를 읽지 못했습니다.');
            }
        },
        async write(encryptedRefreshToken) {
            const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
            await fsImpl.promises.mkdir(pathImpl.dirname(filePath), { recursive: true, mode: 0o700 });
            try {
                await fsImpl.promises.writeFile(tempPath, JSON.stringify({ version: 1, encryptedRefreshToken }), { mode: 0o600 });
                await fsImpl.promises.rename(tempPath, filePath);
            } catch (error) {
                await fsImpl.promises.rm(tempPath, { force: true }).catch(() => {});
                throw new Error('Cloudflare 연결 정보를 이 기기에 저장하지 못했습니다.');
            }
        },
        async clear() {
            await fsImpl.promises.rm(filePath, { force: true });
        }
    };
}

module.exports = {
    createCloudflareConnectionService,
    createEncryptedCredentialStore,
    DEFAULT_OAUTH_REQUESTED_SCOPES,
    normalizeRequestedScopes,
    REDIRECT_URI
};
