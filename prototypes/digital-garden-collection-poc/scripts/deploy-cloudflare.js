import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const http = require('node:http');
const crypto = require('node:crypto');
const { readdir, readFile } = require('node:fs/promises');
const { createInterface } = require('node:readline/promises');
const { stdin, stdout, stderr } = require('node:process');

const {
    createCloudflareOAuthClient,
    listCloudflareMemberships,
    selectCloudflareAccount
} = require('../../cloudflare-oauth-poc/oauth-client');
const { createAssetManifest, createCloudflareStaticAssetsClient } = require('../../cloudflare-static-assets-deploy-poc/deploy-client');

const HOST = '127.0.0.1';
const PORT = 43129;
const REDIRECT_URI = `http://${HOST}:${PORT}/oauth/callback`;
const CLIENT_ID = String(process.env.CF_OAUTH_CLIENT_ID || '').trim();
const REQUESTED_ACCOUNT_ID = String(process.env.CF_ACCOUNT_ID || '').trim();
const REQUESTED_WORKER_NAME = String(process.env.CF_WORKER_NAME || '').trim();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXPECTED_ROUTES = [
    '/',
    '/garden/',
    '/garden/start-here/',
    '/garden/garden-note/',
    '/blog/',
    '/blog/first-post/',
    '/knowledge-assets/mark.svg',
    '/knowledge-assets/field-guide.pdf'
];

function createWorkerName() {
    return `bg-garden-poc-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
}

function validateWorkerName(name) {
    if (name.length > 63 || !/^[a-z0-9][a-z0-9-]*$/.test(name)) {
        throw new Error('Worker name must be 1–63 lowercase letters, numbers, or hyphens and start with a letter or number.');
    }
    return name;
}

async function collectAssets(directory, relative = '') {
    const entries = await readdir(path.join(directory, relative), { withFileTypes: true });
    const assets = [];
    for (const entry of entries) {
        const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
        if (entry.isSymbolicLink()) throw new Error(`Refusing to deploy a symbolic link: ${childRelative}`);
        if (entry.isDirectory()) {
            assets.push(...await collectAssets(directory, childRelative));
        } else if (entry.isFile()) {
            assets.push({ path: childRelative, content: await readFile(path.join(directory, childRelative)) });
        }
    }
    return assets;
}

function validateOutputDirectory(value) {
    const directory = path.resolve(ROOT, value || '');
    const allowed = path.join(ROOT, 'dist', 'subpath');
    if (directory !== allowed) throw new Error(`Only the reviewed subpath build may be deployed: ${allowed}`);
    return directory;
}

async function publishSite({ accessToken, account, workerName, outputDirectory }) {
    const cf = createCloudflareStaticAssetsClient({ accessToken });
    const subdomain = await cf.getWorkersSubdomain({ accountId: account.id });
    if (!subdomain) throw new Error('The selected Cloudflare account has no workers.dev subdomain configured. No Worker was created.');

    const existingWorker = await cf.getWorker({ accountId: account.id, name: workerName });
    const updatingPocWorker = Boolean(existingWorker);
    if (updatingPocWorker && (!REQUESTED_WORKER_NAME || !workerName.startsWith('bg-garden-poc-'))) {
        throw new Error(`Worker ${workerName} already exists. Existing Workers can only be updated when CF_WORKER_NAME explicitly names a bg-garden-poc-* Worker.`);
    }
    const previousDeployments = updatingPocWorker
        ? await cf.listDeployments({ accountId: account.id, scriptName: workerName })
        : [];

    const assets = await collectAssets(outputDirectory);
    if (!assets.some((asset) => asset.path === 'index.html')) throw new Error('The build output has no index.html.');
    const totalBytes = assets.reduce((sum, asset) => sum + asset.content.length, 0);
    const { manifest, filesByHash, contentTypesByHash } = createAssetManifest(assets);
    const url = `https://${workerName}.${subdomain}.workers.dev/`;
    const terminal = createInterface({ input: stdin, output: stdout });
    stdout.write('\nDigital Garden POC deployment plan\n');
    stdout.write(`Account: …${String(account.id).slice(-6)}\n`);
    stdout.write(`${updatingPocWorker ? 'Existing POC Worker to update' : 'New Worker'}: ${workerName}\n`);
    stdout.write(`Public URL: ${url}\n`);
    stdout.write(`Assets: ${assets.length} files, ${totalBytes} bytes from dist/subpath\n`);
    stdout.write(`${updatingPocWorker
        ? `This publishes a new version to the named POC Worker and directs 100% of its traffic to it${previousDeployments.length ? '; the currently hosted POC will be replaced' : ''}.`
        : 'This publishes the synthetic POC site to a new isolated Worker.'} The Worker remains in your Cloudflare account.\n`);
    const answer = await terminal.question(`To publish this site, type PUBLISH ${workerName}: `);
    terminal.close();
    if (answer.trim() !== `PUBLISH ${workerName}`) {
        stdout.write('Cancelled. No Cloudflare write request was sent.\n');
        return { cancelled: true };
    }

    let stage = updatingPocWorker ? 'Asset upload session' : 'Worker creation';
    let workerCreated = false;
    try {
        if (!updatingPocWorker) {
            await cf.createWorker({ accountId: account.id, name: workerName });
            workerCreated = true;
        }
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
        if (!activeDeployment) throw new Error('The latest deployment did not match the uploaded site version within 15 seconds.');

        stage = 'Public URL checks';
        const results = [];
        for (const route of EXPECTED_ROUTES) {
            const response = await fetch(new URL(route, url));
            const body = await response.text();
            if (!response.ok) throw new Error(`${route} returned HTTP ${response.status}.`);
            const expectedType = route.endsWith('.svg') ? 'image/svg+xml'
                : route.endsWith('.pdf') ? 'application/pdf'
                    : route === '/' || route.endsWith('/') ? 'text/html'
                        : '';
            const actualType = String(response.headers.get('content-type') || '').toLowerCase();
            if (expectedType && !actualType.startsWith(expectedType)) {
                throw new Error(`${route} returned Content-Type ${actualType || '(missing)'}, expected ${expectedType}.`);
            }
            if (route.endsWith('.svg') && !body.includes('<svg')) {
                throw new Error('The published SVG URL did not return SVG content.');
            }
            if (route.endsWith('.pdf') && !body.startsWith('%PDF-')) {
                throw new Error('The published PDF URL did not return PDF content.');
            }
            if (route === '/garden/start-here/' && (!body.includes('/garden/garden-note/') || !body.includes('/knowledge-assets/mark.svg'))) {
                throw new Error('The published note page is missing its note link or image reference.');
            }
            if (route === '/garden/garden-note/' && !body.includes('Backlinks')) {
                throw new Error('The published linked note page is missing its backlinks section.');
            }
            results.push(`${route} ${response.status}`);
        }

        stdout.write(`\nSUCCESS\nWorker: ${workerName}\nURL: ${url}\nLatest deployment: ${activeDeployment.id}\n`);
        stdout.write(`Public checks: ${results.join(', ')}\n`);
        return { workerName, url, deploymentId: activeDeployment.id };
    } catch (error) {
        const partialState = workerCreated
            ? ` after creating Worker ${workerName}; the Worker may remain in the account`
            : updatingPocWorker ? ` while updating POC Worker ${workerName}` : '';
        throw new Error(`${stage} failed${partialState}: ${String(error?.message || 'Cloudflare operation failed')}`);
    }
}

if (!CLIENT_ID) {
    stderr.write('Set CF_OAUTH_CLIENT_ID to the private Cloudflare OAuth client ID.\n');
    process.exit(2);
}
if (!stdin.isTTY || !stdout.isTTY) {
    stderr.write('Run this command in an interactive terminal so the deployment plan can be reviewed and confirmed.\n');
    process.exit(2);
}

let outputDirectory;
try {
    outputDirectory = validateOutputDirectory(process.argv[2]);
} catch (error) {
    stderr.write(`${String(error?.message || 'Invalid output directory')}\n`);
    process.exit(2);
}

let workerName;
try {
    workerName = validateWorkerName(REQUESTED_WORKER_NAME || createWorkerName());
} catch (error) {
    stderr.write(`${String(error?.message || 'Invalid Worker name')}\n`);
    process.exit(2);
}
const oauth = createCloudflareOAuthClient({
    clientId: CLIENT_ID,
    redirectUri: REDIRECT_URI,
    scopes: ['memberships.read', 'workers-scripts.read', 'workers-scripts.write']
});
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
        stderr.write(`Cloudflare authorization failed (${providerError}). Check that the OAuth client allows all requested scopes.\n`);
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
        await publishSite({ accessToken: tokens.access_token, account, workerName, outputDirectory });
    } catch (error) {
        stderr.write(`${String(error?.message || 'Digital Garden POC deployment failed')}\n`);
        process.exitCode = 1;
    } finally {
        server.close();
    }
});

server.on('error', (error) => {
    stderr.write(`Could not listen on ${REDIRECT_URI}: ${String(error?.message || error)}\n`);
    process.exitCode = 1;
});
server.listen(PORT, HOST, () => {
    stdout.write(`Listening for the one-time callback at ${REDIRECT_URI}\n`);
    stdout.write('Requested scopes: memberships.read workers-scripts.read workers-scripts.write\n');
    stdout.write(`Worker name: ${workerName}\n`);
    stdout.write(`Open this authorization URL in a system browser:\n${flow.authorizationUrl}\n`);
});
