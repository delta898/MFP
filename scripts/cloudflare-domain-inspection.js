'use strict';

// Read-only inspection for a Cloudflare Worker custom hostname.
// Run with: ./node_modules/.bin/electron scripts/cloudflare-domain-inspection.js
// The script never creates, updates, or deletes DNS records or Worker domains.

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');
const { app } = require('electron');
const Cloudflare = require('cloudflare');
const {
    createCloudflareConnectionService,
    createEncryptedCredentialStore
} = require('../src/host/cloudflare/connection-service');

app.setName('BlogGenius');

function getArg(name) {
    const prefix = `--${name}=`;
    const inline = process.argv.find((arg) => arg.startsWith(prefix));
    if (inline) return inline.slice(prefix.length).trim();
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 ? String(process.argv[index + 1] || '').trim() : '';
}

function safeError(error) {
    const errors = Array.isArray(error?.errors) ? error.errors : [];
    return {
        status: Number(error?.status || error?.statusCode) || null,
        code: error?.code == null ? (errors[0]?.code ?? null) : String(error.code),
        message: String(error?.message || 'Cloudflare API 요청에 실패했습니다.')
            .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
            .slice(0, 500)
    };
}

async function askClientId() {
    const supplied = getArg('client-id') || process.env.CLOUDFLARE_OAUTH_CLIENT_ID || '';
    if (supplied) return supplied;
    if (!stdin.isTTY) throw new Error('Client ID를 --client-id 또는 CLOUDFLARE_OAUTH_CLIENT_ID로 전달해 주세요.');
    const prompt = readline.createInterface({ input: stdin, output: stdout });
    try {
        return (await prompt.question('Cloudflare OAuth Client ID: ')).trim();
    } finally {
        prompt.close();
    }
}

async function inspect() {
    const hostname = String(getArg('hostname') || '').toLowerCase().replace(/\.$/, '');
    if (!hostname || hostname.includes('/') || hostname.includes(':') || /\s/.test(hostname)) {
        throw new Error('조회할 hostname을 --hostname <host>로 지정해 주세요. 예: --hostname test33.bloggenius.kr');
    }

    const clientId = await askClientId();
    if (!clientId) throw new Error('Cloudflare OAuth Client ID가 비어 있습니다.');

    const credentialStore = createEncryptedCredentialStore({
        filePath: path.join(app.getPath('userData'), 'credentials', 'cloudflare-oauth.json'),
        fsImpl: fs,
        pathImpl: path
    });
    const connection = createCloudflareConnectionService({ clientId, credentialStore });
    const { accessToken, account } = await connection.getDeploymentCredentials();
    const client = new Cloudflare({ apiToken: accessToken, maxRetries: 0 });

    const zonesPage = await client.zones.list({ account: { id: account.id }, status: 'active', per_page: 100 });
    const zones = Array.isArray(zonesPage?.result) ? zonesPage.result : Array.isArray(zonesPage) ? zonesPage : [];
    const zone = zones
        .filter((item) => hostname === item.name || hostname.endsWith(`.${item.name}`))
        .sort((a, b) => String(b.name).length - String(a.name).length)[0];
    if (!zone?.id) throw new Error('접근 가능한 Cloudflare zone 중 hostname과 일치하는 zone을 찾지 못했습니다.');

    const [dnsPage, workerPage] = await Promise.all([
        client.dns.records.list({ zone_id: zone.id, name: hostname, per_page: 100 }),
        client.workers.domains.list({ account_id: account.id })
    ]);
    const dnsRecords = Array.isArray(dnsPage?.result) ? dnsPage.result : Array.isArray(dnsPage) ? dnsPage : [];
    const workerDomains = Array.isArray(workerPage?.result) ? workerPage.result : Array.isArray(workerPage) ? workerPage : [];
    const matchingWorkerDomains = workerDomains.filter((item) => String(item.hostname || '').toLowerCase() === hostname);

    return {
        mode: 'read-only',
        hostname,
        account: { id: account.id, name: account.name },
        zone: { id: zone.id, name: zone.name },
        dnsRead: 'ok',
        dnsRecords: dnsRecords.map(({ id, type, name, content, proxied, ttl }) => ({ id, type, name, content, proxied, ttl })),
        workerDomainRead: 'ok',
        workerDomains: matchingWorkerDomains.map(({ id, hostname: host, service, environment, zone_id }) => ({
            id,
            hostname: host,
            service,
            environment,
            zone_id
        })),
        note: 'DNS 레코드의 현재 상태와 Worker custom hostname 연결만 조회했습니다. 이 결과만으로 DNS 레코드의 생성 주체/소유권을 증명할 수는 없습니다.'
    };
}

app.whenReady().then(async () => {
    try {
        stdout.write(`${JSON.stringify(await inspect(), null, 2)}\n`);
    } catch (error) {
        stdout.write(`${JSON.stringify({ mode: 'read-only', error: safeError(error) }, null, 2)}\n`);
        process.exitCode = 1;
    } finally {
        app.quit();
    }
});
