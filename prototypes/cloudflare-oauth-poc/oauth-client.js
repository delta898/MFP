const crypto = require('node:crypto');

const AUTHORIZATION_URL = 'https://dash.cloudflare.com/oauth2/auth';
const TOKEN_URL = 'https://dash.cloudflare.com/oauth2/token';
const MEMBERSHIPS_URL = 'https://api.cloudflare.com/client/v4/memberships';
const DEFAULT_STATE_TTL_MS = 10 * 60 * 1000;

function base64Url(value) {
    return Buffer.from(value)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

function createCloudflareOAuthClient({
    clientId,
    redirectUri,
    scopes = [],
    fetchImpl = globalThis.fetch,
    now = Date.now,
    randomBytes = crypto.randomBytes,
    stateTtlMs = DEFAULT_STATE_TTL_MS
} = {}) {
    const normalizedClientId = String(clientId || '').trim();
    const normalizedRedirectUri = String(redirectUri || '').trim();
    if (!normalizedClientId) throw new Error('Cloudflare OAuth client ID is required.');
    if (!normalizedRedirectUri) throw new Error('Cloudflare OAuth redirect URI is required.');
    if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required.');

    const normalizedScopes = [...new Set(scopes.map((scope) => String(scope || '').trim()).filter(Boolean))];
    const pendingFlows = new Map();

    function cleanExpiredFlows() {
        const timestamp = now();
        for (const [state, flow] of pendingFlows.entries()) {
            if (timestamp - flow.createdAt > stateTtlMs) pendingFlows.delete(state);
        }
    }

    function beginAuthorization() {
        cleanExpiredFlows();
        const state = randomBytes(32).toString('hex');
        const verifier = base64Url(randomBytes(48));
        const challenge = base64Url(crypto.createHash('sha256').update(verifier).digest());
        pendingFlows.set(state, { verifier, createdAt: now() });

        const url = new URL(AUTHORIZATION_URL);
        url.search = new URLSearchParams({
            client_id: normalizedClientId,
            redirect_uri: normalizedRedirectUri,
            response_type: 'code',
            state,
            code_challenge: challenge,
            code_challenge_method: 'S256',
            ...(normalizedScopes.length ? { scope: normalizedScopes.join(' ') } : {})
        }).toString();

        return { authorizationUrl: url.toString(), state };
    }

    async function exchangeCode({ code, state } = {}) {
        cleanExpiredFlows();
        const normalizedState = String(state || '');
        const flow = pendingFlows.get(normalizedState);
        if (!flow) throw new Error('Cloudflare OAuth state is invalid, expired, or already used.');
        pendingFlows.delete(normalizedState);

        const body = new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: normalizedClientId,
            redirect_uri: normalizedRedirectUri,
            code: String(code || ''),
            code_verifier: flow.verifier
        });
        const response = await fetchImpl(TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString()
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            const detail = String(payload.error_description || payload.error || `HTTP ${response.status}`);
            throw new Error(`Cloudflare OAuth token exchange failed: ${detail}`);
        }
        return payload;
    }

    return { beginAuthorization, exchangeCode };
}

async function listCloudflareMemberships(accessToken, { fetchImpl = globalThis.fetch } = {}) {
    const token = String(accessToken || '').trim();
    if (!token) throw new Error('Cloudflare access token is required.');
    if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required.');

    const response = await fetchImpl(MEMBERSHIPS_URL, {
        headers: { Authorization: `Bearer ${token}` }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success !== true) {
        const detail = Array.isArray(payload.errors)
            ? payload.errors.map((item) => item.message).filter(Boolean).join('; ')
            : '';
        throw new Error(`Cloudflare membership lookup failed: ${detail || `HTTP ${response.status}`}`);
    }
    return Array.isArray(payload.result) ? payload.result : [];
}

module.exports = {
    AUTHORIZATION_URL,
    MEMBERSHIPS_URL,
    TOKEN_URL,
    createCloudflareOAuthClient,
    listCloudflareMemberships
};
