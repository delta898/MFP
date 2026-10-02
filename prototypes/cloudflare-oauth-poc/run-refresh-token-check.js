const crypto = require('node:crypto');
const http = require('node:http');

const AUTHORIZATION_URL = 'https://dash.cloudflare.com/oauth2/auth';
const TOKEN_URL = 'https://dash.cloudflare.com/oauth2/token';
const REVOKE_URL = 'https://dash.cloudflare.com/oauth2/revoke';
const MEMBERSHIPS_URL = 'https://api.cloudflare.com/client/v4/memberships';
const HOST = '127.0.0.1';
const PORT = 43127;
const REDIRECT_URI = `http://${HOST}:${PORT}/oauth/callback`;
const CLIENT_ID = String(process.env.CF_OAUTH_CLIENT_ID || '').trim();
const SCOPES = ['memberships.read', 'offline_access'];

if (!CLIENT_ID) {
    process.stderr.write('Set CF_OAUTH_CLIENT_ID to the private verification client ID first.\n');
    process.exit(2);
}

function base64Url(value) {
    return Buffer.from(value)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}

async function postForm(url, fields) {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(fields)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(`OAuth endpoint returned HTTP ${response.status}.`);
        error.oauthCode = String(payload.error || '');
        throw error;
    }
    Object.defineProperty(payload, 'httpStatus', { value: response.status });
    return payload;
}

function startAuthorization() {
    const state = crypto.randomBytes(32).toString('hex');
    const verifier = base64Url(crypto.randomBytes(48));
    const challenge = base64Url(crypto.createHash('sha256').update(verifier).digest());
    const url = new URL(AUTHORIZATION_URL);
    url.search = new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        scope: SCOPES.join(' '),
        prompt: 'consent',
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256'
    }).toString();
    return { state, verifier, authorizationUrl: url.toString() };
}

const flow = startAuthorization();
let finished = false;
const server = http.createServer(async (request, response) => {
    const callback = new URL(request.url || '/', `http://${HOST}`);
    if (callback.pathname !== '/oauth/callback') {
        response.writeHead(404).end('Not found');
        return;
    }
    if (finished) {
        response.writeHead(409).end('This authorization attempt has already been handled.');
        return;
    }
    finished = true;

    const providerError = callback.searchParams.get('error');
    if (providerError) {
        response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
            .end('Cloudflare authorization was not completed. You may close this page.');
        process.stderr.write(`Authorization was not completed (${providerError}).\n`);
        server.close();
        return;
    }
    if (callback.searchParams.get('state') !== flow.state) {
        response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
            .end('Cloudflare authorization state was invalid. You may close this page.');
        process.stderr.write('Authorization callback state did not match.\n');
        server.close();
        return;
    }

    let activeRefreshToken = '';
    try {
        const initialTokens = await postForm(TOKEN_URL, {
            grant_type: 'authorization_code',
            client_id: CLIENT_ID,
            redirect_uri: REDIRECT_URI,
            code: callback.searchParams.get('code') || '',
            code_verifier: flow.verifier
        });
        activeRefreshToken = String(initialTokens.refresh_token || '');
        if (!initialTokens.access_token) throw new Error('Authorization code exchange returned no access token.');

        process.stdout.write(JSON.stringify({
            authorizationCodeExchange: 'success',
            tokenType: String(initialTokens.token_type || ''),
            accessTokenExpiresInSeconds: Number(initialTokens.expires_in || 0),
            refreshTokenIssued: Boolean(activeRefreshToken),
            scope: String(initialTokens.scope || '')
        }, null, 2) + '\n');
        if (!activeRefreshToken) {
            response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
                .end('OAuth completed, but Cloudflare did not issue a refresh token. You may close this page.');
            return;
        }

        const membershipsResponse = await fetch(MEMBERSHIPS_URL, {
            headers: { Authorization: `Bearer ${initialTokens.access_token}` }
        });
        const membershipsPayload = await membershipsResponse.json().catch(() => ({}));
        if (!membershipsResponse.ok || membershipsPayload.success !== true) {
            throw new Error(`Membership read returned HTTP ${membershipsResponse.status}.`);
        }

        const refreshedTokens = await postForm(TOKEN_URL, {
            grant_type: 'refresh_token',
            client_id: CLIENT_ID,
            refresh_token: activeRefreshToken
        });
        if (!refreshedTokens.access_token) throw new Error('Refresh grant returned no access token.');
        const rotatedRefreshToken = String(refreshedTokens.refresh_token || '');
        activeRefreshToken = rotatedRefreshToken || activeRefreshToken;

        process.stdout.write(JSON.stringify({
            membershipRead: 'success',
            membershipCount: Array.isArray(membershipsPayload.result) ? membershipsPayload.result.length : 0,
            refreshGrant: 'success',
            refreshedAccessTokenExpiresInSeconds: Number(refreshedTokens.expires_in || 0),
            refreshTokenRotated: Boolean(rotatedRefreshToken)
        }, null, 2) + '\n');

        const revoked = await postForm(REVOKE_URL, {
            client_id: CLIENT_ID,
            token: activeRefreshToken,
            token_type_hint: 'refresh_token'
        });
        activeRefreshToken = '';

        let refreshAfterRevokeRejected = false;
        try {
            await postForm(TOKEN_URL, {
                grant_type: 'refresh_token',
                client_id: CLIENT_ID,
                refresh_token: rotatedRefreshToken || String(initialTokens.refresh_token || '')
            });
        } catch (error) {
            refreshAfterRevokeRejected = true;
        }
        process.stdout.write(JSON.stringify({
            revocationHttpStatus: Number(revoked.httpStatus || 0),
            refreshAfterRevokeRejected
        }, null, 2) + '\n');
        if (!refreshAfterRevokeRejected) process.exitCode = 1;

        response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
            .end('Cloudflare OAuth refresh-token check completed. You may close this page.');
    } catch (error) {
        if (activeRefreshToken) {
            try {
                await postForm(REVOKE_URL, {
                    client_id: CLIENT_ID,
                    token: activeRefreshToken,
                    token_type_hint: 'refresh_token'
                });
            } catch {
                // Keep credential values out of diagnostics; report only the cleanup outcome below.
            }
        }
        const code = error?.oauthCode ? ` (${error.oauthCode})` : '';
        process.stderr.write(`OAuth refresh verification failed${code}: ${String(error?.message || 'unknown error')}\n`);
        response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
            .end('Cloudflare OAuth refresh verification failed. You may close this page.');
    } finally {
        server.close();
    }
});

server.on('error', (error) => {
    process.stderr.write(`Could not listen on ${REDIRECT_URI}: ${String(error?.message || 'unknown error')}\n`);
    process.exitCode = 1;
});

server.listen(PORT, HOST, () => {
    process.stdout.write(`Listening for the one-time OAuth callback at ${REDIRECT_URI}\n`);
    process.stdout.write(`Requested Cloudflare OAuth scope(s): ${SCOPES.join(', ')}\n`);
    process.stdout.write('Open this authorization URL in the macOS system browser:\n');
    process.stdout.write(`${flow.authorizationUrl}\n`);
});
