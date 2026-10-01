const http = require('node:http');
const {
    createCloudflareOAuthClient,
    listCloudflareMemberships,
    listCloudflareWorkerScripts,
    selectCloudflareAccount
} = require('./oauth-client');

const HOST = '127.0.0.1';
const PORT = 43127;
const REDIRECT_URI = `http://${HOST}:${PORT}/oauth/callback`;
const CLIENT_ID = String(process.env.CF_OAUTH_CLIENT_ID || '').trim();
const REQUESTED_ACCOUNT_ID = String(process.env.CF_ACCOUNT_ID || '').trim();
const SCOPES = String(process.env.CF_OAUTH_SCOPES || 'memberships.read workers-scripts.read')
    .split(/\s+/)
    .filter(Boolean);

if (!CLIENT_ID) {
    process.stderr.write('Set CF_OAUTH_CLIENT_ID to a private Cloudflare OAuth client ID first.\n');
    process.exit(2);
}

const oauth = createCloudflareOAuthClient({
    clientId: CLIENT_ID,
    redirectUri: REDIRECT_URI,
    scopes: SCOPES
});
const flow = oauth.beginAuthorization();

const server = http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', `http://${HOST}:${PORT}`);
    if (url.pathname !== '/oauth/callback') {
        response.writeHead(404).end('Not found');
        return;
    }

    const providerError = url.searchParams.get('error');
    if (providerError) {
        response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Cloudflare authorization was not completed. You may close this page.');
        process.stderr.write(`Authorization was not completed (${providerError}).\n`);
        server.close();
        return;
    }

    try {
        const tokens = await oauth.exchangeCode({
            code: url.searchParams.get('code'),
            state: url.searchParams.get('state')
        });
        const memberships = await listCloudflareMemberships(tokens.access_token);
        const account = selectCloudflareAccount(memberships, REQUESTED_ACCOUNT_ID);
        const scripts = await listCloudflareWorkerScripts(tokens.access_token, account.id);
        const staticAssetScripts = scripts
            .filter((script) => script.has_assets === true)
            .map((script) => ({
                name: String(script.id || ''),
                modifiedOn: String(script.modified_on || '')
            }));

        response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Cloudflare Static Assets lookup succeeded. You may close this page.');
        process.stdout.write(JSON.stringify({
            result: 'success',
            tokenType: String(tokens.token_type || ''),
            expiresInSeconds: Number(tokens.expires_in || 0),
            scope: String(tokens.scope || ''),
            refreshTokenIssued: Boolean(tokens.refresh_token),
            workerScriptCount: scripts.length,
            staticAssetWorkerCount: staticAssetScripts.length,
            staticAssetWorkers: staticAssetScripts
        }, null, 2) + '\n');
    } catch (error) {
        response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Cloudflare lookup failed. Check the local terminal for details.');
        process.stderr.write(`${String(error?.message || 'Cloudflare lookup failed')}\n`);
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
    process.stdout.write(`Listening for the one-time OAuth callback at ${REDIRECT_URI}\n`);
    process.stdout.write(`Requested Cloudflare OAuth scope(s): ${SCOPES.join(', ')}\n`);
    process.stdout.write(`Open this authorization URL in a browser:\n${flow.authorizationUrl}\n`);
});
