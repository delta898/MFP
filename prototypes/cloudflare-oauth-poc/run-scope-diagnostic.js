const http = require('node:http');

const { createCloudflareOAuthClient } = require('./oauth-client');

const HOST = '127.0.0.1';
const PORT = 43127;
const REDIRECT_URI = `http://${HOST}:${PORT}/oauth/callback`;
const CLIENT_ID = String(process.env.CF_OAUTH_CLIENT_ID || '').trim();
const SCOPES = ['memberships.read', 'workers-scripts.read'];

async function listOAuthScopes(accessToken) {
    const response = await fetch('https://api.cloudflare.com/client/v4/oauth/scopes', {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success !== true) {
        const detail = Array.isArray(payload.errors)
            ? payload.errors.map((item) => item.message).filter(Boolean).join('; ')
            : '';
        throw new Error(`Cloudflare OAuth scope lookup failed: ${detail || `HTTP ${response.status}`}`);
    }
    return Array.isArray(payload.result) ? payload.result : [];
}

if (!CLIENT_ID) {
    process.stderr.write('Set CF_OAUTH_CLIENT_ID to the private Cloudflare OAuth client ID.\n');
    process.exit(2);
} else if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stderr.write('Run this read-only diagnostic in an interactive terminal.\n');
    process.exit(2);
} else {
    const oauth = createCloudflareOAuthClient({ clientId: CLIENT_ID, redirectUri: REDIRECT_URI, scopes: SCOPES });
    const flow = oauth.beginAuthorization();
    let callbackHandled = false;
    const server = http.createServer(async (request, response) => {
        const url = new URL(request.url || '/', `http://${HOST}:${PORT}`);
        if (url.pathname !== '/oauth/callback') {
            response.writeHead(404).end('Not found');
            return;
        }
        if (callbackHandled) {
            response.writeHead(409).end('This authorization callback was already handled.');
            return;
        }
        callbackHandled = true;
        const providerError = url.searchParams.get('error');
        if (providerError) {
            response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
                .end('Cloudflare authorization was not completed. You may close this page.');
            process.stderr.write(`Cloudflare authorization failed (${providerError}).\n`);
            server.close();
            return;
        }
        response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
            .end('Authorization received. You may close this page.');
        try {
            const tokens = await oauth.exchangeCode({ code: url.searchParams.get('code'), state: url.searchParams.get('state') });
            if (!tokens.access_token) throw new Error('Cloudflare did not return an access token.');
            const scopes = await listOAuthScopes(tokens.access_token);
            const matches = scopes.filter((scope) => /worker/i.test(`${scope.id} ${scope.name} ${scope.category || ''}`));
            process.stdout.write('\nWorkers-related OAuth scopes (ID is the exact value to use):\n');
            for (const scope of matches) {
                process.stdout.write(`${JSON.stringify({ id: scope.id, name: scope.name, category: scope.category, scopes: scope.scopes })}\n`);
            }
            if (!matches.length) process.stdout.write('No scope names containing "worker" were returned.\n');
            process.stdout.write('\nRead-only diagnostic complete. No Cloudflare resources were changed.\n');
        } catch (error) {
            process.stderr.write(`${String(error?.message || 'Scope diagnostic failed')}\n`);
            process.exitCode = 1;
        } finally {
            server.close();
        }
    });
    server.on('error', (error) => {
        process.stderr.write(`Could not listen on ${REDIRECT_URI}: ${String(error?.message || error)}\n`);
        process.exitCode = 1;
    });
    server.listen(PORT, HOST, () => {
        process.stdout.write(`Listening for the one-time callback at ${REDIRECT_URI}\n`);
        process.stdout.write(`Requested scopes: ${SCOPES.join(' ')}\n`);
        process.stdout.write(`Open this authorization URL in a system browser:\n${flow.authorizationUrl}\n`);
    });
}
