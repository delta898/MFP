const http = require('node:http');
const crypto = require('node:crypto');
const { createInterface } = require('node:readline/promises');
const { stdin, stdout } = require('node:process');

const {
    createCloudflareOAuthClient,
    listCloudflareMemberships,
    selectCloudflareAccount
} = require('../cloudflare-oauth-poc/oauth-client');
const { createAssetManifest, createCloudflareStaticAssetsClient } = require('./deploy-client');

const HOST = '127.0.0.1';
const PORT = 43127;
const REDIRECT_URI = `http://${HOST}:${PORT}/oauth/callback`;
const CLIENT_ID = String(process.env.CF_OAUTH_CLIENT_ID || '').trim();
const REQUESTED_ACCOUNT_ID = String(process.env.CF_ACCOUNT_ID || '').trim();
const REQUESTED_WORKER_NAME = String(process.env.CF_WORKER_NAME || '').trim();
const SCOPES = ['memberships.read', 'workers-scripts.read', 'workers-scripts.write'];
const CONTENT_MARKER = 'BlogGenius Cloudflare Static Assets PoC';

function createWorkerName() {
    const suffix = crypto.randomBytes(3).toString('hex');
    return `bg-static-poc-${Date.now().toString(36)}-${suffix}`;
}

function makeSampleAssets() {
    return [{
        path: 'index.html',
        content: Buffer.from(`<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${CONTENT_MARKER}</title>
<body><main><h1>${CONTENT_MARKER}</h1><p>Live API verification sample.</p></main></body>
</html>
`)
    }];
}

async function publishSample({ accessToken, account, workerName }) {
    const cf = createCloudflareStaticAssetsClient({ accessToken });
    const subdomain = await cf.getWorkersSubdomain({ accountId: account.id });
    if (!subdomain) throw new Error('The selected Cloudflare account has no workers.dev subdomain configured. No Worker was created.');

    const existingWorker = await cf.getWorker({ accountId: account.id, name: workerName });
    const workerAlreadyExists = Boolean(existingWorker);
    if (workerAlreadyExists) {
        const deployments = await cf.listDeployments({ accountId: account.id, scriptName: workerName });
        if (deployments.length) {
            throw new Error(`Worker ${workerName} already has a deployment. Recovery is limited to an undeployed Worker; no write request was sent.`);
        }
    }

    const url = `https://${workerName}.${subdomain}.workers.dev/`;
    const terminal = createInterface({ input: stdin, output: stdout });
    stdout.write('\nLive deployment plan\n');
    stdout.write(`Account: …${String(account.id).slice(-6)}\n`);
    stdout.write(`${workerAlreadyExists ? 'Existing undeployed Worker to resume: ' : 'New Worker: '}${workerName}\n`);
    stdout.write(`Public URL: ${url}\n`);
    stdout.write(`${workerAlreadyExists ? 'This reuses the existing undeployed Worker, uploads one public sample HTML page, and directs 100% of its traffic to that version.' : 'This creates a Worker, uploads one public sample HTML page, and directs 100% of the new Worker’s traffic to it.'} The Worker will remain in your Cloudflare account after the check.\n`);
    const answer = await terminal.question(`To publish this exact sample, type PUBLISH ${workerName}: `);
    terminal.close();
    if (answer.trim() !== `PUBLISH ${workerName}`) {
        stdout.write('Cancelled. No Cloudflare write request was sent.\n');
        return { cancelled: true };
    }

    let stage = workerAlreadyExists ? 'Asset upload session' : 'Worker creation';
    let workerCreated = false;
    try {
        const worker = existingWorker || await cf.createWorker({ accountId: account.id, name: workerName });
        workerCreated = !workerAlreadyExists;

        const assets = makeSampleAssets();
        const { manifest, filesByHash, contentTypesByHash } = createAssetManifest(assets);
        stage = 'Asset upload session';
        const session = await cf.createAssetUploadSession({ accountId: account.id, scriptName: workerName, manifest });

        stage = 'Static asset upload';
        const completionToken = await cf.uploadAssetBuckets({
            accountId: account.id,
            buckets: session.buckets,
            filesByHash,
            contentTypesByHash,
            uploadToken: session.uploadToken
        });

        stage = 'Worker version upload';
        const version = await cf.uploadWorkerVersion({
            accountId: account.id,
            scriptName: workerName,
            completionToken,
            compatibilityDate: new Date().toISOString().slice(0, 10)
        });

        stage = 'Traffic deployment';
        const deployment = await cf.createDeployment({ accountId: account.id, scriptName: workerName, versionId: version.id });

        stage = 'Deployment status lookup';
        let activeDeployment;
        for (let attempt = 0; attempt < 15; attempt += 1) {
            const deployments = await cf.listDeployments({ accountId: account.id, scriptName: workerName });
            activeDeployment = deployments[0];
            if (activeDeployment?.id === deployment.id
                && activeDeployment.versions?.some((item) => item.version_id === version.id && item.percentage === 100)) break;
            activeDeployment = undefined;
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        if (!activeDeployment) throw new Error('The latest Cloudflare deployment did not match the uploaded sample version within 15 seconds.');

        stage = 'Public URL check';
        let publicResponse;
        let publicHtml = '';
        for (let attempt = 0; attempt < 15; attempt += 1) {
            publicResponse = await fetch(url);
            publicHtml = await publicResponse.text();
            if (publicResponse.ok && publicHtml.includes(CONTENT_MARKER)) break;
            if (attempt < 14) await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        if (!publicResponse?.ok || !publicHtml.includes(CONTENT_MARKER)) {
            throw new Error(`The public sample URL did not return the expected page within 15 attempts (last HTTP ${publicResponse?.status || 'no response'}).`);
        }

        stdout.write(`\nSUCCESS\nWorker: ${workerName}\nURL: ${url}\nHTTP: ${publicResponse.status}\nLatest deployment: ${activeDeployment.id}\n`);
        return { workerName, url, deploymentId: activeDeployment.id };
    } catch (error) {
        const detail = String(error?.message || 'Cloudflare operation failed');
        const partialState = workerCreated
            ? ` after creating Worker ${workerName}; the Worker may remain in the account`
            : workerAlreadyExists ? ` while resuming undeployed Worker ${workerName}` : '';
        throw new Error(`${stage} failed${partialState}: ${detail}`);
    }
}

if (!CLIENT_ID) {
    process.stderr.write('Set CF_OAUTH_CLIENT_ID to the private Cloudflare OAuth client ID.\n');
    process.exit(2);
}
if (!stdin.isTTY || !stdout.isTTY) {
    process.stderr.write('Run this live check in an interactive terminal so the final publish confirmation can be typed.\n');
    process.exit(2);
}

const workerName = REQUESTED_WORKER_NAME || createWorkerName();
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
        process.stderr.write(`Cloudflare authorization failed (${providerError}). Check that the private OAuth client allows all requested scopes.\n`);
        server.close();
        return;
    }

    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
        .end('Authorization received. Follow the local terminal to review the deployment plan.');
    try {
        const tokens = await oauth.exchangeCode({ code: url.searchParams.get('code'), state: url.searchParams.get('state') });
        if (!tokens.access_token) throw new Error('Cloudflare did not return an access token.');
        const memberships = await listCloudflareMemberships(tokens.access_token);
        const account = selectCloudflareAccount(memberships, REQUESTED_ACCOUNT_ID);
        await publishSample({ accessToken: tokens.access_token, account, workerName });
    } catch (error) {
        process.stderr.write(`${String(error?.message || 'Live deployment check failed')}\n`);
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
    stdout.write(`Listening for the one-time callback at ${REDIRECT_URI}\n`);
    stdout.write(`Requested scopes: ${SCOPES.join(' ')}\n`);
    stdout.write(`Worker name: ${workerName}\n`);
    stdout.write(`Open this authorization URL in a system browser:\n${flow.authorizationUrl}\n`);
});
