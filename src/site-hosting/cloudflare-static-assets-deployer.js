'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const API_BASE_URL = 'https://api.cloudflare.com/client/v4';
const WORKER_MODULE = `export default {\n  fetch(request, env) {\n    return env.ASSETS.fetch(request);\n  }\n};\n`;

function createAssetManifest(files) {
    if (!Array.isArray(files) || files.length === 0) throw new Error('빌드 결과에 업로드할 파일이 없습니다.');
    const manifest = {};
    const filesByHash = new Map();
    for (const file of files) {
        const assetPath = String(file?.path || '').replace(/\\/g, '/');
        if (!assetPath || assetPath.startsWith('//') || assetPath.split('/').some((part) => part === '.' || part === '..')) {
            throw new Error('빌드 결과에 올바르지 않은 파일 경로가 있습니다.');
        }
        const normalizedPath = `/${assetPath.replace(/^\/+/, '')}`;
        if (manifest[normalizedPath]) throw new Error(`중복된 빌드 파일 경로가 있습니다: ${normalizedPath}`);
        const content = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content ?? '');
        const extension = path.posix.extname(normalizedPath).slice(1);
        const hash = crypto.createHash('sha256').update(content.toString('base64') + extension).digest('hex').slice(0, 32);
        manifest[normalizedPath] = { hash, size: content.length };
        filesByHash.set(hash, content);
    }
    return { manifest, filesByHash };
}

function createCloudflareSdkAdapter({ client, fetchImpl = globalThis.fetch } = {}) {
    if (!client) throw new Error('Cloudflare SDK client가 필요합니다.');

    async function listItems(page) {
        if (page && typeof page.then === 'function' && typeof page[Symbol.asyncIterator] !== 'function') page = await page;
        if (page && typeof page[Symbol.asyncIterator] === 'function') {
            const items = [];
            for await (const item of page) items.push(item);
            return items;
        }
        return Array.isArray(page?.result) ? page.result : Array.isArray(page) ? page : [];
    }

    return {
        listWorkerScripts: (accountId) => listItems(client.workers.scripts.list({ account_id: accountId })),
        getWorkersSubdomain: async (accountId) => String((await client.workers.subdomains.get({ account_id: accountId }))?.subdomain || '').trim(),
        createWorker: ({ accountId, workerName }) => client.workers.beta.workers.create({
            account_id: accountId,
            name: workerName,
            subdomain: { enabled: true },
            observability: { enabled: true }
        }),
        createAssetUploadSession: ({ accountId, workerName, manifest }) => client.workers.scripts.assets.upload.create(
            workerName, { account_id: accountId, manifest }
        ),
        async uploadAssetBuckets({ accountId, buckets, filesByHash, uploadToken }) {
            if (!Array.isArray(buckets)) throw new Error('Cloudflare 자산 업로드 정보가 올바르지 않습니다.');
            let completionToken = '';
            for (const bucket of buckets) {
                const form = new FormData();
                for (const hash of bucket) {
                    const content = filesByHash.get(hash);
                    if (content === undefined) throw new Error('Cloudflare 업로드 대상 파일을 찾을 수 없습니다.');
                    form.append(hash, Buffer.from(content).toString('base64'));
                }
                const response = await fetchImpl(`${API_BASE_URL}/accounts/${accountId}/workers/assets/upload?base64=true`, {
                    method: 'POST', headers: { Authorization: `Bearer ${uploadToken}` }, body: form
                });
                const payload = await response.json().catch(() => ({}));
                if (!response.ok || payload.success !== true) {
                    throw new Error(`Cloudflare 자산 업로드에 실패했습니다 (HTTP ${response.status}).`);
                }
                if (typeof payload.result?.jwt === 'string') completionToken = payload.result.jwt;
            }
            if (buckets.length && !completionToken) throw new Error('Cloudflare 자산 업로드 확인 토큰을 받지 못했습니다.');
            return completionToken || uploadToken;
        },
        createWorkerVersion: ({ accountId, workerId, completionToken, compatibilityDate }) => client.workers.beta.workers.versions.create(workerId, {
            account_id: accountId,
            main_module: 'worker.js',
            compatibility_date: compatibilityDate,
            bindings: [{ type: 'assets', name: 'ASSETS' }],
            assets: { jwt: completionToken },
            modules: [{
                name: 'worker.js',
                content_type: 'application/javascript+module',
                content_base64: Buffer.from(WORKER_MODULE).toString('base64')
            }]
        }),
        createDeployment: ({ accountId, workerName, versionId }) => client.workers.scripts.deployments.create(workerName, {
            account_id: accountId,
            strategy: 'percentage',
            versions: [{ percentage: 100, version_id: versionId }]
        }),
        async listDeployments({ accountId, workerName }) {
            const page = await client.workers.scripts.deployments.list(workerName, { account_id: accountId });
            if (Array.isArray(page?.result?.deployments)) return page.result.deployments;
            const items = await listItems(page);
            return items.flatMap((item) => Array.isArray(item?.deployments) ? item.deployments : [item]);
        }
    };
}

function readStaticAssets(distRoot, fileSystem = fs, pathApi = path) {
    const files = [];
    const walk = (directory, prefix = '') => {
        for (const entry of fileSystem.readdirSync(directory, { withFileTypes: true })) {
            const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
            const fullPath = pathApi.join(directory, entry.name);
            if (entry.isSymbolicLink()) throw new Error('빌드 결과에 심볼릭 링크가 포함되어 있어 배포할 수 없습니다.');
            if (entry.isDirectory()) walk(fullPath, relativePath);
            else if (entry.isFile()) files.push({ path: relativePath, content: fileSystem.readFileSync(fullPath) });
        }
    };
    walk(distRoot);
    return files;
}

function createCloudflareStaticAssetsDeployer(options = {}) {
    const fileSystem = options.fs || fs;
    const pathApi = options.path || path;
    const getCredentials = options.getCredentials;
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    const sleep = options.sleep || ((duration) => new Promise((resolve) => setTimeout(resolve, duration)));
    const createClient = options.createClient || ((accessToken) => {
        const Cloudflare = require('cloudflare');
        return new Cloudflare({ apiToken: accessToken, maxRetries: 1 });
    });
    const createAdapter = options.createAdapter || createCloudflareSdkAdapter;

    async function deploy(site, suppliedCredentials) {
        const credentials = suppliedCredentials || await getCredentials();
        const { accessToken, account } = credentials || {};
        if (!accessToken || !account?.id) throw new Error('Cloudflare 배포 인증 정보를 확인하지 못했습니다.');
        const accountId = String(account.id);
        if (!/^[a-f\d]{32}$/i.test(accountId)) throw new Error('Cloudflare 계정 정보를 확인하지 못했습니다.');
        const workerName = `bg-${String(site.id).toLowerCase().replace(/[^a-z0-9-]/g, '-')}`;
        if (workerName.length > 63 || !/^bg-[a-z0-9][a-z0-9-]*$/.test(workerName)) throw new Error('사이트 배포 이름을 만들 수 없습니다.');
        let activeStep = 'workers.dev 주소 확인';
        try {
            const adapter = createAdapter({ client: createClient(accessToken), fetchImpl: options.fetchImpl });
            const subdomain = await adapter.getWorkersSubdomain(accountId);
            if (!subdomain) throw new Error('Cloudflare 계정에 workers.dev 주소가 설정되어 있지 않습니다.');
            const url = `https://${workerName}.${subdomain}.workers.dev/`;
            activeStep = 'Worker 목록 조회';
            const scripts = await adapter.listWorkerScripts(accountId);
            const existing = scripts.find((script) => String(script?.id || script?.name || '') === workerName);
            if (!existing) activeStep = 'Worker 생성';
            const worker = existing || await adapter.createWorker({ accountId, workerName });
            const workerId = String(worker?.id || worker?.name || workerName);
            const { manifest, filesByHash } = createAssetManifest(readStaticAssets(pathApi.join(site.root_path, 'dist'), fileSystem, pathApi));
            activeStep = '정적 파일 업로드';
            const session = await adapter.createAssetUploadSession({ accountId, workerName, manifest });
            const completionToken = await adapter.uploadAssetBuckets({
                accountId, buckets: session?.buckets || [], filesByHash, uploadToken: session?.jwt
            });
            activeStep = '배포 버전 생성';
            const version = await adapter.createWorkerVersion({
                accountId, workerId, completionToken, compatibilityDate: new Date().toISOString().slice(0, 10)
            });
            const versionId = String(version?.id || '');
            if (!versionId) throw new Error('Cloudflare가 배포 버전을 반환하지 않았습니다.');
            activeStep = '배포 적용';
            const deployment = await adapter.createDeployment({ accountId, workerName, versionId });
            const deploymentId = String(deployment?.id || '');
            let active = false;
            for (let attempt = 0; attempt < 15; attempt += 1) {
                activeStep = '배포 상태 확인';
                const deployments = await adapter.listDeployments({ accountId, workerName });
                active = deployments.some((item) => (!deploymentId || item.id === deploymentId)
                    && item.versions?.some((entry) => entry.version_id === versionId && Number(entry.percentage) === 100));
                if (active) break;
                if (attempt < 14) await sleep(1000);
            }
            if (!active) throw new Error('Cloudflare가 새 배포를 활성 상태로 확인하지 못했습니다.');
            activeStep = '공개 사이트 응답 확인';
            console.info('[Site Hosting] 배포 주소:', url);
            const response = await fetchImpl(url, { method: 'GET' });
            if (!response?.ok) throw new Error(`공개 사이트 확인에 실패했습니다 (HTTP ${response?.status || 0}).`);
            return { worker_name: workerName, url, deployment_id: deploymentId, version_id: versionId };
        } catch (cause) {
            const status = Number(cause?.status);
            const message = status === 401 || status === 403
                ? `Cloudflare 권한이 거부되었습니다: ${activeStep}. OAuth Client의 Workers 권한과 계정 역할을 확인해 주세요.`
                : String(cause?.message || 'Cloudflare 배포에 실패했습니다.').split(String(accessToken)).join('[redacted]');
            const error = new Error(message);
            error.code = status === 401 || status === 403 ? 'CLOUDFLARE_DEPLOY_PERMISSION_DENIED' : (cause?.code || 'CLOUDFLARE_DEPLOY_FAILED');
            error.status = cause?.status;
            throw error;
        }
    }

    return { deploy };
}

module.exports = { createAssetManifest, createCloudflareSdkAdapter, readStaticAssets, createCloudflareStaticAssetsDeployer };
