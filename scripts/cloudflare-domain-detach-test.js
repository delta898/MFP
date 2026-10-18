'use strict';

// Destructive integration experiment against a disposable hostname in a Cloudflare zone.
// Creates one temporary Worker + Worker custom domain, detaches the custom domain,
// observes DNS state, and removes the temporary Worker after observation.
// This script never calls the DNS create/update/delete APIs.
// Run: ./node_modules/.bin/electron scripts/cloudflare-domain-detach-test.js --run

const crypto = require('node:crypto');
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

const DOMAIN_SUFFIX = 'bloggenius.kr';
const ZONE_NAME = 'bloggenius.kr';
const COMPATIBILITY_DATE = '2026-10-06';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function log(event, data = {}) {
    stdout.write(`${JSON.stringify({ event, ...data })}\n`);
}

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

async function collect(page) {
    if (page && typeof page.then === 'function' && typeof page[Symbol.asyncIterator] !== 'function') page = await page;
    if (page && typeof page[Symbol.asyncIterator] === 'function') {
        const result = [];
        for await (const row of page) result.push(row);
        return result;
    }
    return Array.isArray(page?.result) ? page.result : Array.isArray(page) ? page : [];
}

function recordsForName(records, hostname) {
    return records.filter((record) => String(record.name || '').toLowerCase() === hostname)
        .map(({ id, type, name, content, proxied, ttl }) => ({ id, type, name, content, proxied, ttl }));
}

async function listDns(client, zoneId, hostname) {
    const page = await client.dns.records.list({ zone_id: zoneId, name: hostname, per_page: 100 });
    return recordsForName(await collect(page), hostname);
}

async function listWorkerDomains(client, accountId, hostname) {
    const page = await client.workers.domains.list({ account_id: accountId, hostname });
    return (await collect(page))
        .filter((item) => String(item.hostname || '').toLowerCase() === hostname)
        .map(({ id, hostname: host, service, environment, zone_id }) => ({
            id,
            hostname: host,
            service,
            environment,
            zone_id
        }));
}

async function uploadTestWorker({ accessToken, accountId, workerName }) {
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify({
        main_module: 'worker.js',
        compatibility_date: COMPATIBILITY_DATE
    })], { type: 'application/json' }));
    form.append('worker.js', new Blob([
        'export default {\n  fetch() {\n    return new Response("Cloudflare domain detach test", { headers: { "content-type": "text/plain; charset=utf-8" } });\n  }\n};\n'
    ], { type: 'application/javascript+module' }), 'worker.js');

    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/workers/scripts/${encodeURIComponent(workerName)}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success !== true) {
        const error = new Error(payload.errors?.[0]?.message || `Worker 업로드 실패 (HTTP ${response.status}).`);
        error.status = response.status;
        error.code = payload.errors?.[0]?.code;
        throw error;
    }
    return payload.result;
}

async function waitFor(check, predicate, timeoutMs = 20_000) {
    const startedAt = Date.now();
    let value;
    do {
        value = await check();
        if (predicate(value)) return { value, reached: true, elapsedMs: Date.now() - startedAt };
        await sleep(2_000);
    } while (Date.now() - startedAt < timeoutMs);
    return { value, reached: predicate(value), elapsedMs: Date.now() - startedAt };
}

async function run() {
    if (!process.argv.includes('--run')) {
        throw new Error('Cloudflare 계정을 변경하는 테스트입니다. 실행하려면 --run을 지정해 주세요.');
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
    const zones = await collect(client.zones.list({ account: { id: account.id }, status: 'active', per_page: 100 }));
    const zone = zones.find((item) => String(item.name || '').toLowerCase() === ZONE_NAME);
    if (!zone?.id) throw new Error(`활성 zone '${ZONE_NAME}'을 찾지 못했습니다.`);

    const requestedNonce = getArg('nonce');
    if (requestedNonce && !/^[a-f0-9]{12}$/i.test(requestedNonce)) {
        throw new Error('--nonce는 12자리 hex 값이어야 합니다.');
    }
    const nonce = requestedNonce || crypto.randomBytes(6).toString('hex');
    const hostname = `bg-domain-detach-${nonce}.${ZONE_NAME}`;
    const workerName = `bg-domain-detach-${nonce}`;
    log('test-created', { mode: 'mutating-test', hostname, workerName, zone: ZONE_NAME, note: '난수 테스트 리소스만 사용합니다.' });

    let workerCreated = false;
    let bindingId = '';
    let detached = false;
    let resultError = null;
    const report = {
        mode: 'mutating-test',
        hostname,
        workerName,
        account: { id: account.id, name: account.name },
        zone: { id: zone.id, name: zone.name },
        phases: {}
    };

    try {
        // Collision checks are part of the experiment and prevent touching an existing resource.
        const [initialDns, initialDomains, scripts] = await Promise.all([
            listDns(client, zone.id, hostname),
            listWorkerDomains(client, account.id, hostname),
            collect(client.workers.scripts.list({ account_id: account.id }))
        ]);
        const existingScript = scripts.some((item) => String(item.id || item.name || '') === workerName);
        if (process.argv.includes('--inspect-only')) {
            log('existing-test-resources', {
                hostname,
                workerName,
                dnsRecords: initialDns,
                workerDomains: initialDomains,
                workerScriptFound: existingScript
            });
            return;
        }
        if (initialDns.length || initialDomains.length || existingScript) {
            log('name-collision-check', { dnsRecords: initialDns, workerDomains: initialDomains, workerScriptFound: existingScript });
            throw new Error('난수 테스트 이름이 이미 사용 중입니다. 아무 리소스도 변경하지 않았습니다. 다시 실행해 주세요.');
        }

        // Send the documented multipart parts directly: SDK serialization did not
        // preserve Cloudflare's required JSON metadata part in the earlier attempt.
        workerCreated = true;
        await uploadTestWorker({ accessToken, accountId: account.id, workerName });
        report.phases.workerCreated = true;
        log('worker-created', { workerName });

        const binding = await client.workers.domains.update({
            account_id: account.id,
            hostname,
            service: workerName,
            zone_id: zone.id,
            zone_name: zone.name
        });
        bindingId = String(binding?.id || '');
        if (!bindingId) throw new Error('Worker domain 연결 응답에 binding ID가 없습니다. 리소스 상태를 확인해야 합니다.');
        report.phases.domainAttached = { id: bindingId };
        log('domain-attached', { hostname, bindingId });

        const attachedDns = await waitFor(() => listDns(client, zone.id, hostname), (value) => value.length > 0);
        const attachedDomains = await waitFor(() => listWorkerDomains(client, account.id, hostname), (value) => value.some((item) => item.id === bindingId));
        report.phases.afterAttach = {
            dnsRecords: attachedDns.value,
            dnsRecordObserved: attachedDns.reached,
            workerDomains: attachedDomains.value,
            workerDomainObserved: attachedDomains.reached
        };
        log('after-attach', report.phases.afterAttach);

        await client.workers.domains.delete(bindingId, { account_id: account.id });
        const detachCheck = await waitFor(() => listWorkerDomains(client, account.id, hostname), (value) => !value.some((item) => item.id === bindingId));
        detached = detachCheck.reached;
        const dnsAfterDetach = await waitFor(() => listDns(client, zone.id, hostname), (value) => value.length === 0, 15_000);
        report.phases.afterDetach = {
            workerDomains: detachCheck.value,
            detached: detachCheck.reached,
            dnsRecords: dnsAfterDetach.value,
            dnsRecordRemoved: dnsAfterDetach.value.length === 0,
            dnsCheckDurationMs: dnsAfterDetach.elapsedMs
        };
        log('after-domain-detach', report.phases.afterDetach);
    } catch (error) {
        resultError = safeError(error);
    } finally {
        // Never delete the Worker while a custom-domain binding may still be active.
        if (workerCreated && (detached || !bindingId)) {
            try {
                const remainingScripts = await collect(client.workers.scripts.list({ account_id: account.id }));
                const workerExists = remainingScripts.some((item) => String(item.id || item.name || '') === workerName);
                if (workerExists) {
                    await client.workers.scripts.delete(workerName, { account_id: account.id });
                    report.phases.workerDeleted = true;
                    log('worker-cleaned-up', { workerName });
                } else {
                    report.phases.workerDeleted = false;
                    log('worker-cleanup-not-needed', { workerName });
                }
            } catch (cleanupError) {
                report.phases.workerCleanupError = safeError(cleanupError);
            }
            try {
                const finalDns = await listDns(client, zone.id, hostname);
                report.phases.afterWorkerDelete = { dnsRecords: finalDns, dnsRecordPresent: finalDns.length > 0 };
                log('after-worker-cleanup', report.phases.afterWorkerDelete);
            } catch (cleanupError) {
                report.phases.finalDnsCheckError = safeError(cleanupError);
            }
        } else if (workerCreated) {
            report.phases.workerCleanup = 'skipped: binding detach was not confirmed';
        }
    }

    if (resultError) report.error = resultError;
    log('test-result', report);
    if (resultError || !detached) process.exitCode = 1;
}

app.whenReady().then(async () => {
    try {
        await run();
    } catch (error) {
        log('test-error', safeError(error));
        process.exitCode = 1;
    } finally {
        app.quit();
    }
});
