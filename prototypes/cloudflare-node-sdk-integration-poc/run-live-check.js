import http from 'node:http';
import crypto from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout, stderr } from 'node:process';
import Cloudflare from 'cloudflare';
import oauthModule from '../cloudflare-oauth-poc/oauth-client.js';
import { createAssetManifest, createCloudflareSdkAdapter, redactToken } from './sdk-client.js';

const { createCloudflareOAuthClient, listCloudflareMemberships, selectCloudflareAccount } = oauthModule;
const HOST = '127.0.0.1';
const PORT = 43127;
const REDIRECT_URI = `http://${HOST}:${PORT}/oauth/callback`;
const CLIENT_ID = String(process.env.CF_OAUTH_CLIENT_ID || '').trim();
const REQUESTED_ACCOUNT_ID = String(process.env.CF_ACCOUNT_ID || '').trim();
const SCOPES = ['memberships.read', 'workers-scripts.read', 'workers-scripts.write'];
const CONTENT_MARKER = 'BlogGenius Cloudflare Node SDK PoC';

function createWorkerName() {
  return `bg-sdk-poc-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
}

function makeSampleAssets() {
  return [{
    path: 'index.html',
    content: Buffer.from(`<!doctype html><html lang="en"><meta charset="utf-8"><title>${CONTENT_MARKER}</title><body><main><h1>${CONTENT_MARKER}</h1><p>Official Cloudflare Node SDK integration check.</p></main></body></html>`)
  }];
}

async function publishSample({ accessToken, account, workerName }) {
  const client = new Cloudflare({ apiToken: accessToken, maxRetries: 1 });
  const cf = createCloudflareSdkAdapter({ client });
  const subdomain = await cf.getWorkersSubdomain(account.id);
  if (!subdomain) throw new Error('This Cloudflare account has no workers.dev subdomain configured. No Worker was created.');

  const scripts = await cf.listWorkerScripts(account.id);
  const existing = Array.from(scripts).find((script) => String(script.id || script.name || '') === workerName);
  if (existing) throw new Error(`Random Worker name collision (${workerName}); no write request was sent. Run again to generate a new name.`);

  const url = `https://${workerName}.${subdomain}.workers.dev/`;
  const terminal = createInterface({ input: stdin, output: stdout });
  stdout.write('\nSDK live deployment plan\n');
  stdout.write(`Account: …${String(account.id).slice(-6)}\n`);
  stdout.write(`New Worker: ${workerName}\n`);
  stdout.write(`Public URL: ${url}\n`);
  stdout.write('This creates a new Worker, uploads one public sample HTML page, and directs 100% of this new Worker’s traffic to it. The Worker remains in your Cloudflare account after the check.\n');
  stdout.write('Worker inventory was read through the official Cloudflare SDK. Asset bytes will be sent to Cloudflare’s signed upload endpoint; Worker creation, upload session, version, and traffic deployment use the SDK.\n');
  const answer = await terminal.question(`To publish this exact sample, type PUBLISH ${workerName}: `);
  terminal.close();
  if (answer.trim() !== `PUBLISH ${workerName}`) {
    stdout.write('Cancelled. No Cloudflare write request was sent.\n');
    return { cancelled: true };
  }

  let stage = 'Worker creation';
  try {
    const worker = await cf.createWorker({ accountId: account.id, workerName });
    const assets = makeSampleAssets();
    const { manifest, filesByHash } = createAssetManifest(assets);

    stage = 'Asset upload session';
    const session = await cf.createAssetUploadSession({ accountId: account.id, workerName, manifest });
    stage = 'Static asset upload';
    const completionToken = await cf.uploadAssetBuckets({
      accountId: account.id,
      buckets: session.buckets,
      filesByHash,
      uploadToken: session.jwt
    });
    stage = 'Worker version upload';
    const version = await cf.createWorkerVersion({
      accountId: account.id,
      workerId: worker.id,
      completionToken,
      compatibilityDate: new Date().toISOString().slice(0, 10)
    });
    stage = 'Traffic deployment';
    const deployment = await cf.createDeployment({ accountId: account.id, workerName, versionId: version.id });

    stage = 'Deployment status lookup';
    let activeDeployment;
    for (let attempt = 0; attempt < 15; attempt += 1) {
      const deployments = await cf.listDeployments({ accountId: account.id, workerName });
      activeDeployment = deployments.find((item) => item.id === deployment.id
        && item.versions?.some((entry) => entry.version_id === version.id && entry.percentage === 100));
      if (activeDeployment) break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (!activeDeployment) throw new Error('The uploaded version did not become the 100% active deployment within 15 seconds.');

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
      throw new Error(`The public sample URL did not return the expected page (last HTTP ${publicResponse?.status || 'no response'}).`);
    }

    stdout.write(`\nSUCCESS\nWorker: ${workerName}\nURL: ${url}\nHTTP: ${publicResponse.status}\nActive deployment: ${activeDeployment.id}\nSDK inventory count: ${Array.from(scripts).length}\n`);
    return { workerName, url, deploymentId: activeDeployment.id };
  } catch (error) {
    throw new Error(`${stage} failed after creating Worker ${workerName}; it may remain in your account: ${redactToken(error?.message, accessToken)}`);
  }
}

if (!CLIENT_ID) {
  stderr.write('Set CF_OAUTH_CLIENT_ID to your private Cloudflare OAuth client ID.\n');
  process.exit(2);
}
if (!stdin.isTTY || !stdout.isTTY) {
  stderr.write('Run this live check in an interactive terminal so the exact deployment plan can be reviewed and confirmed.\n');
  process.exit(2);
}

const workerName = createWorkerName();
const oauth = createCloudflareOAuthClient({ clientId: CLIENT_ID, redirectUri: REDIRECT_URI, scopes: SCOPES });
const flow = oauth.beginAuthorization();
let callbackHandled = false;

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${HOST}`);
  if (url.pathname !== '/oauth/callback') return response.writeHead(404).end('Not found');
  if (callbackHandled) return response.writeHead(409).end('This callback was already handled.');
  callbackHandled = true;

  const providerError = url.searchParams.get('error');
  if (providerError) {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Cloudflare authorization failed. You may close this page.');
    stderr.write(`Cloudflare authorization failed (${providerError}). Check that the private OAuth client allows all requested scopes.\n`);
    server.close();
    return;
  }

  response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Authorization received. Follow the local terminal to review the deployment plan.');
  let accessToken = '';
  try {
    const tokens = await oauth.exchangeCode({ code: url.searchParams.get('code'), state: url.searchParams.get('state') });
    if (!tokens.access_token) throw new Error('Cloudflare did not return an access token.');
    accessToken = tokens.access_token;
    const memberships = await listCloudflareMemberships(tokens.access_token);
    const account = selectCloudflareAccount(memberships, REQUESTED_ACCOUNT_ID);
    stdout.write(`Cloudflare OAuth succeeded. Granted scope: ${String(tokens.scope || '(scope omitted by provider)')}\n`);
    await publishSample({ accessToken: tokens.access_token, account, workerName });
  } catch (error) {
    stderr.write(`${redactToken(error?.message, accessToken)}\n`);
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
  stdout.write(`Requested OAuth scopes: ${SCOPES.join(' ')}\n`);
  stdout.write(`Planned Worker name: ${workerName}\n`);
  stdout.write('Open this authorization URL in a system browser:\n');
  stdout.write(`${flow.authorizationUrl}\n`);
});
