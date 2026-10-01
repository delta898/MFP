import crypto from 'node:crypto';
import path from 'node:path';

const API_BASE_URL = 'https://api.cloudflare.com/client/v4';
const WORKER_MODULE = `export default {\n  fetch(request, env) {\n    return env.ASSETS.fetch(request);\n  }\n};\n`;

function required(value, label) {
  const normalized = String(value || '').trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

function validateAccountId(value) {
  const accountId = required(value, 'Cloudflare account ID');
  if (!/^[a-f\d]{32}$/i.test(accountId)) throw new Error('Cloudflare account ID must be 32 hexadecimal characters.');
  return accountId;
}

function validateWorkerName(value) {
  const name = required(value, 'Worker name');
  if (name.length > 63 || !/^[a-z0-9][a-z0-9-]*$/.test(name)) {
    throw new Error('Worker name must be 1–63 lowercase letters, numbers, or hyphens.');
  }
  return name;
}

async function collectPageItems(page) {
  if (page && typeof page.then === 'function' && typeof page[Symbol.asyncIterator] !== 'function') page = await page;
  if (page && typeof page[Symbol.asyncIterator] === 'function') {
    const items = [];
    for await (const item of page) items.push(item);
    return items;
  }
  if (page && typeof page[Symbol.iterator] === 'function') return Array.from(page);
  if (Array.isArray(page?.result)) return page.result;
  if (Array.isArray(page?.result?.items)) return page.result.items;
  return [];
}

export function createAssetManifest(files) {
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
    const hash = crypto.createHash('sha256').update(content.toString('base64') + extension).digest('hex').slice(0, 32);
    manifest[normalizedPath] = { hash, size: content.length };
    filesByHash.set(hash, content);
  }
  return { manifest, filesByHash };
}

export function createCloudflareSdkAdapter({ client, fetchImpl = globalThis.fetch } = {}) {
  if (!client) throw new Error('A Cloudflare SDK client is required.');
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required.');

  async function uploadAssetBuckets({ accountId, buckets, filesByHash, uploadToken }) {
    const account = validateAccountId(accountId);
    const jwt = required(uploadToken, 'Cloudflare asset upload token');
    if (!Array.isArray(buckets)) throw new Error('Cloudflare upload buckets are required.');
    if (!buckets.length) return jwt;
    if (!(filesByHash instanceof Map)) throw new Error('Files indexed by hash are required.');

    let completionToken = '';
    for (const bucket of buckets) {
      if (!Array.isArray(bucket) || !bucket.length) throw new Error('Cloudflare returned an invalid asset bucket.');
      const form = new FormData();
      for (const hash of bucket) {
        const content = filesByHash.get(hash);
        if (content === undefined) throw new Error(`A local asset is missing for hash ${hash}.`);
        form.append(hash, Buffer.from(content).toString('base64'));
      }
      const response = await fetchImpl(`${API_BASE_URL}/accounts/${account}/workers/assets/upload?base64=true`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}` },
        body: form
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success !== true) {
        const details = (payload.errors || []).map((error) => error.message).filter(Boolean).join('; ');
        throw new Error(`Cloudflare asset bucket upload failed (HTTP ${response.status}): ${details || 'request failed'}`);
      }
      if (typeof payload.result?.jwt === 'string') completionToken = payload.result.jwt;
    }
    if (!completionToken) throw new Error('Cloudflare asset upload did not return a completion token.');
    return completionToken;
  }

  return {
    async listWorkerScripts(accountId) {
      const account = validateAccountId(accountId);
      return collectPageItems(client.workers.scripts.list({ account_id: account }));
    },
    async getWorkersSubdomain(accountId) {
      const account = validateAccountId(accountId);
      const response = await client.workers.subdomains.get({ account_id: account });
      return String(response.subdomain || '').trim();
    },
    async createWorker({ accountId, workerName }) {
      const account = validateAccountId(accountId);
      const name = validateWorkerName(workerName);
      return client.workers.beta.workers.create({
        account_id: account,
        name,
        subdomain: { enabled: true },
        observability: { enabled: true }
      });
    },
    async createAssetUploadSession({ accountId, workerName, manifest }) {
      const account = validateAccountId(accountId);
      const name = validateWorkerName(workerName);
      return client.workers.scripts.assets.upload.create(name, { account_id: account, manifest });
    },
    uploadAssetBuckets,
    async createWorkerVersion({ accountId, workerId, completionToken, compatibilityDate }) {
      const account = validateAccountId(accountId);
      const id = required(workerId, 'Worker ID');
      const jwt = required(completionToken, 'Cloudflare asset completion token');
      return client.workers.beta.workers.versions.create(id, {
        account_id: account,
        main_module: 'worker.js',
        compatibility_date: required(compatibilityDate, 'Worker compatibility date'),
        bindings: [{ type: 'assets', name: 'ASSETS' }],
        assets: { jwt },
        modules: [{
          name: 'worker.js',
          content_type: 'application/javascript+module',
          content_base64: Buffer.from(WORKER_MODULE).toString('base64')
        }]
      });
    },
    async createDeployment({ accountId, workerName, versionId }) {
      const account = validateAccountId(accountId);
      const name = validateWorkerName(workerName);
      const version = required(versionId, 'Worker version ID');
      return client.workers.scripts.deployments.create(name, {
        account_id: account,
        strategy: 'percentage',
        versions: [{ percentage: 100, version_id: version }]
      });
    },
    async listDeployments({ accountId, workerName }) {
      const account = validateAccountId(accountId);
      const name = validateWorkerName(workerName);
      const page = await client.workers.scripts.deployments.list(name, { account_id: account });
      // The SDK currently models this endpoint as a paginated response, while the
      // API returns { result: { deployments: [...] } }. Preserve the API payload
      // when the generated pagination iterator cannot see nested deployments.
      if (Array.isArray(page?.result?.deployments)) return page.result.deployments;
      const items = await collectPageItems(page);
      return items.flatMap((item) => Array.isArray(item?.deployments) ? item.deployments : [item]);
    }
  };
}

export function redactToken(value, token) {
  const message = String(value || 'Cloudflare operation failed');
  return token ? message.split(token).join('[redacted]') : message;
}
