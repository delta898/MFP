const API_BASE_URL = 'https://api.cloudflare.com/client/v4';
const STATIC_ASSETS_WORKER_MODULE = `export default {\n  fetch(request, env) {\n    return env.ASSETS.fetch(request);\n  }\n};\n`;
const crypto = require('node:crypto');
const path = require('node:path');

function createAssetManifest(files) {
    if (!Array.isArray(files) || files.length === 0) throw new Error('At least one static asset is required.');
    const manifest = {};
    const filesByHash = new Map();
    for (const file of files) {
        const assetPath = String(file?.path || '').replace(/\\/g, '/');
        if (!assetPath || assetPath.startsWith('//') || assetPath.split('/').some((part) => part === '.' || part === '..')) {
            throw new Error('Static asset paths must be relative site paths without dot segments.');
        }
        const normalizedPath = `/${assetPath.replace(/^\/+/, '')}`;
        if (manifest[normalizedPath]) throw new Error(`Duplicate static asset path: ${normalizedPath}`);
        const content = Buffer.isBuffer(file.content) ? file.content : Buffer.from(String(file.content ?? ''));
        const extension = path.posix.extname(normalizedPath).slice(1);
        const hash = crypto.createHash('sha256')
            .update(content.toString('base64') + extension)
            .digest('hex')
            .slice(0, 32);
        manifest[normalizedPath] = { hash, size: content.length };
        filesByHash.set(hash, content);
    }
    return { manifest, filesByHash };
}

function requireValue(value, label) {
    const normalized = String(value || '').trim();
    if (!normalized) throw new Error(`${label} is required.`);
    return normalized;
}

function validateAccountId(accountId) {
    const normalized = requireValue(accountId, 'Cloudflare account ID');
    if (!/^[a-f\d]{32}$/i.test(normalized)) {
        throw new Error('Cloudflare account ID must be 32 hexadecimal characters.');
    }
    return normalized;
}

function assertScriptName(scriptName) {
    const normalized = requireValue(scriptName, 'Worker script name');
    if (normalized.length > 63 || !/^[a-z0-9][a-z0-9-]*$/.test(normalized)) {
        throw new Error('Worker script name must be 1–63 lowercase letters, numbers, or hyphens and start with a letter or number.');
    }
    return normalized;
}

function createCloudflareStaticAssetsClient({ accessToken, fetchImpl = globalThis.fetch } = {}) {
    const token = requireValue(accessToken, 'Cloudflare access token');
    if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required.');

    async function readJson(response, operation, sensitiveTokens = [], { includeResponseDetails = false } = {}) {
        const responseText = await response.text().catch(() => '');
        let payload = {};
        try {
            payload = responseText ? JSON.parse(responseText) : {};
        } catch {
            payload = {};
        }
        if (!response.ok || payload.success !== true) {
            const providerMessage = Array.isArray(payload.errors)
                ? payload.errors.map((item) => {
                    const code = item.code ? `Cloudflare ${item.code}: ` : '';
                    return `${code}${String(item.message || '')}`.trim();
                }).filter(Boolean).join('; ')
                : '';
            const secrets = [token, ...sensitiveTokens].filter(Boolean);
            const safeMessage = providerMessage && !secrets.some((secret) => providerMessage.includes(secret))
                ? providerMessage
                : `HTTP ${response.status}`;
            throw new Error(`${operation} failed (HTTP ${response.status}): ${safeMessage}`);
        }
        const result = payload.result || {};
        return includeResponseDetails
            ? { result, status: response.status, messageCodes: (payload.messages || []).map((item) => item.code).filter(Number.isFinite) }
            : result;
    }

    async function jsonRequest(url, method, body, operation) {
        const response = await fetchImpl(url, {
            method,
            headers: {
                Authorization: `Bearer ${token}`,
                ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) })
        });
        return readJson(response, operation);
    }

    function scriptUrl(accountId, scriptName, path = '') {
        const account = validateAccountId(accountId);
        const script = assertScriptName(scriptName);
        return `${API_BASE_URL}/accounts/${account}/workers/scripts/${encodeURIComponent(script)}${path}`;
    }

    async function createWorker({ accountId, name } = {}) {
        const account = validateAccountId(accountId);
        const workerName = assertScriptName(name);
        const result = await jsonRequest(
            `${API_BASE_URL}/accounts/${account}/workers/workers`,
            'POST',
            { name: workerName, subdomain: { enabled: true } },
            'Cloudflare Worker creation'
        );
        if (typeof result.id !== 'string' || !result.id) throw new Error('Cloudflare Worker response has no Worker ID.');
        return result;
    }

    async function getWorker({ accountId, name } = {}) {
        const account = validateAccountId(accountId);
        const workerName = assertScriptName(name);
        let result;
        try {
            result = await jsonRequest(
                `${API_BASE_URL}/accounts/${account}/workers/workers/${encodeURIComponent(workerName)}`,
                'GET',
                undefined,
                'Cloudflare Worker lookup'
            );
        } catch (error) {
            if (String(error?.message || '').includes('(HTTP 404)')) return null;
            throw error;
        }
        if (typeof result.id !== 'string' || !result.id) throw new Error('Cloudflare Worker response has no Worker ID.');
        return result;
    }

    async function createAssetUploadSession({ accountId, scriptName, manifest } = {}) {
        if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) || !Object.keys(manifest).length) {
            throw new Error('A non-empty static asset manifest is required.');
        }
        const result = await jsonRequest(
            scriptUrl(accountId, scriptName, '/assets-upload-session'),
            'POST',
            { manifest },
            'Cloudflare asset upload session'
        );
        if (typeof result.jwt !== 'string' || !Array.isArray(result.buckets)) {
            throw new Error('Cloudflare asset upload session returned an invalid response.');
        }
        return { uploadToken: result.jwt, buckets: result.buckets };
    }

    async function uploadAssetBuckets({ accountId, buckets, filesByHash, uploadToken } = {}) {
        const account = validateAccountId(accountId);
        const jwt = requireValue(uploadToken, 'Cloudflare asset upload token');
        if (!Array.isArray(buckets)) throw new Error('Cloudflare upload buckets are required.');
        if (!buckets.length) return jwt;
        if (!(filesByHash instanceof Map)) throw new Error('Files indexed by hash are required.');
        if (typeof FormData !== 'function') throw new Error('FormData is required for Cloudflare asset upload.');

        let completionToken = '';
        let lastResponseDetails;
        for (const [bucketIndex, bucket] of buckets.entries()) {
            if (!Array.isArray(bucket) || !bucket.length) throw new Error('Cloudflare returned an invalid asset bucket.');
            const payload = [];
            for (const hash of bucket) {
                const content = filesByHash.get(hash);
                if (content === undefined) throw new Error(`A local asset is missing for hash ${hash}.`);
                payload.push([hash, Buffer.from(content).toString('base64')]);
            }
            const form = new FormData();
            for (const [hash, base64Content] of payload) {
                form.append(hash, base64Content);
            }
            const response = await fetchImpl(
                `${API_BASE_URL}/accounts/${account}/workers/assets/upload?base64=true`,
                {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${jwt}` },
                    body: form
                }
            );
            const { result, status, messageCodes } = await readJson(
                response,
                'Cloudflare static asset upload',
                [jwt],
                { includeResponseDetails: true }
            );
            if (typeof result.jwt === 'string' && result.jwt) completionToken = result.jwt;
            lastResponseDetails = { result, status, messageCodes, bucketIndex: bucketIndex + 1, bucketCount: buckets.length };
        }
        if (!completionToken) {
            const fields = Object.keys(lastResponseDetails?.result || {}).sort().join(', ') || 'none';
            const status = lastResponseDetails?.status ?? 'unknown';
            const codes = lastResponseDetails?.messageCodes?.length ? lastResponseDetails.messageCodes.join(', ') : 'none';
            const bucketProgress = lastResponseDetails
                ? `; final bucket: ${lastResponseDetails.bucketIndex}/${lastResponseDetails.bucketCount}`
                : '';
            throw new Error(`Cloudflare static asset upload succeeded without a completion JWT (HTTP ${status}; result fields: ${fields}; message codes: ${codes}${bucketProgress}).`);
        }
        return completionToken;
    }

    async function uploadWorkerVersion({ accountId, scriptName, completionToken, compatibilityDate } = {}) {
        const jwt = requireValue(completionToken, 'Cloudflare asset completion token');
        const script = assertScriptName(scriptName);
        const normalizedDate = requireValue(compatibilityDate, 'Worker compatibility date');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
            throw new Error('Worker compatibility date must use YYYY-MM-DD.');
        }
        const form = new FormData();
        form.set('metadata', JSON.stringify({
            main_module: 'worker.js',
            compatibility_date: normalizedDate,
            bindings: [{ name: 'ASSETS', type: 'assets' }],
            assets: { jwt }
        }));
        form.set('worker.js', new Blob([STATIC_ASSETS_WORKER_MODULE], { type: 'application/javascript+module' }), 'worker.js');
        const account = validateAccountId(accountId);
        const response = await fetchImpl(`${API_BASE_URL}/accounts/${account}/workers/scripts/${encodeURIComponent(script)}/versions`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: form
        });
        const result = await readJson(response, 'Cloudflare Worker version upload', [jwt]);
        if (typeof result.id !== 'string' || !result.id) throw new Error('Cloudflare Worker version response has no version ID.');
        return result;
    }

    async function createDeployment({ accountId, scriptName, versionId } = {}) {
        const version = requireValue(versionId, 'Cloudflare Worker version ID');
        return jsonRequest(
            scriptUrl(accountId, scriptName, '/deployments'),
            'POST',
            { strategy: 'percentage', versions: [{ percentage: 100, version_id: version }] },
            'Cloudflare Worker deployment'
        );
    }

    async function listDeployments({ accountId, scriptName } = {}) {
        const result = await jsonRequest(
            scriptUrl(accountId, scriptName, '/deployments'),
            'GET',
            undefined,
            'Cloudflare Worker deployment lookup'
        );
        return Array.isArray(result.deployments) ? result.deployments : [];
    }

    async function getWorkersSubdomain({ accountId } = {}) {
        const account = validateAccountId(accountId);
        const result = await jsonRequest(
            `${API_BASE_URL}/accounts/${account}/workers/subdomain`,
            'GET',
            undefined,
            'Cloudflare account workers.dev subdomain lookup'
        );
        return String(result.subdomain || '');
    }

    return { createWorker, getWorker, createAssetUploadSession, uploadAssetBuckets, uploadWorkerVersion, createDeployment, listDeployments, getWorkersSubdomain };
}

module.exports = { API_BASE_URL, STATIC_ASSETS_WORKER_MODULE, createAssetManifest, createCloudflareStaticAssetsClient };
