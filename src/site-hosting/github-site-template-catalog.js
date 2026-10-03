'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createSiteTemplateCatalog } = require('./site-template-catalog');

const DEFAULT_CATALOG_URL = 'https://raw.githubusercontent.com/delta898/Amade/main/amade/catalog/index.json';
const DEVELOPMENT_CATALOG_URL = 'https://raw.githubusercontent.com/delta898/Amade/dev/amade/catalog/index.json';
const MAX_CATALOG_BYTES = 1024 * 1024;
const MAX_RESOURCE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_PACKAGE_BYTES = 50 * 1024 * 1024;
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA_PATTERN = /^[a-f0-9]{64}$/;

function createGitHubSiteTemplateCatalog(options = {}) {
    const fileSystem = options.fs || fs;
    const pathApi = options.path || path;
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    const requestedCacheRoot = String(options.cacheRoot || '').trim();
    const cacheRoot = requestedCacheRoot ? pathApi.resolve(requestedCacheRoot) : '';
    const environment = String(options.environment || process.env.BLOGGENIUS_ENV || '').trim().toLowerCase();
    const environmentCatalogUrl = ['local', 'development'].includes(environment) ? DEVELOPMENT_CATALOG_URL : DEFAULT_CATALOG_URL;
    const catalogUrl = String(options.catalogUrl || process.env.BLOGGENIUS_SITE_TEMPLATE_CATALOG_URL || environmentCatalogUrl);
    if (!cacheRoot) throw new Error('템플릿 catalog cache 폴더가 필요합니다.');
    if (typeof fetchImpl !== 'function') throw new Error('HTTPS fetch를 사용할 수 없습니다.');

    const cached = createSiteTemplateCatalog({ fs: fileSystem, path: pathApi, templatesRoot: cacheRoot });
    let lastCatalog = null;
    let stale = false;

    function fail(code, message, status = 502, cause) {
        const error = new Error(message);
        error.code = code;
        error.status = status;
        if (cause) error.cause = cause;
        return error;
    }

    function safeRelativePath(value) {
        const normalized = String(value || '').replaceAll('\\', '/');
        if (!normalized || normalized.startsWith('/') || normalized.includes('\0')
            || normalized.split('/').some((part) => !part || part === '.' || part === '..')) return '';
        return normalized;
    }

    async function fetchBytes(url, maxBytes) {
        const response = await fetchImpl(url, { headers: { Accept: 'application/json, application/octet-stream' } });
        if (!response?.ok) throw fail('SITE_HOSTING_TEMPLATE_SOURCE_UNAVAILABLE', `GitHub에서 템플릿 파일을 가져오지 못했습니다 (HTTP ${response?.status || 0}).`);
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length > maxBytes) throw fail('SITE_HOSTING_TEMPLATE_SOURCE_TOO_LARGE', '템플릿 파일 크기가 허용 범위를 넘었습니다.', 413);
        return buffer;
    }

    function rawUrl(revision, filePath) {
        const safePath = safeRelativePath(filePath);
        if (!/^[a-f0-9]{40}$/.test(String(revision || '')) || !safePath) {
            throw fail('SITE_HOSTING_TEMPLATE_MANIFEST_INVALID', '템플릿의 revision 또는 파일 경로가 올바르지 않습니다.', 502);
        }
        return `https://raw.githubusercontent.com/delta898/Amade/${revision}/${safePath.split('/').map(encodeURIComponent).join('/')}`;
    }

    function validateCatalog(catalog) {
        if (catalog?.schema_version !== 1 || !Array.isArray(catalog.resources)) {
            throw fail('SITE_HOSTING_TEMPLATE_CATALOG_INVALID', 'Amade template catalog 형식이 올바르지 않습니다.');
        }
        return catalog.resources.filter((item) => item?.kind === 'site-hosting').map((item) => {
            if (!ID_PATTERN.test(String(item.id || '')) || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(String(item.version || ''))
                || !/^[a-f0-9]{40}$/.test(String(item.revision || '')) || !safeRelativePath(item.manifest)) {
                throw fail('SITE_HOSTING_TEMPLATE_CATALOG_INVALID', 'Amade catalog 항목이 올바르지 않습니다.');
            }
            return item;
        });
    }

    function validateResource(resource, reference) {
        if (resource?.schema_version !== 1 || resource.kind !== 'site-hosting'
            || resource.id !== reference.id || resource.version !== reference.version
            || resource.package?.path !== '.' || !Array.isArray(resource.package?.files)
            || !resource.site_hosting || !resource.preview) {
            throw fail('SITE_HOSTING_TEMPLATE_MANIFEST_INVALID', 'Amade 템플릿 manifest가 올바르지 않습니다.');
        }
        const files = [...resource.package.files, resource.preview];
        const uniquePaths = new Set();
        let totalBytes = 0;
        for (const entry of files) {
            const safePath = safeRelativePath(entry.path);
            if (!safePath || !SHA_PATTERN.test(String(entry.sha256 || '')) || uniquePaths.has(safePath)) {
                throw fail('SITE_HOSTING_TEMPLATE_MANIFEST_INVALID', '템플릿 파일 목록에 올바르지 않은 경로 또는 checksum이 있습니다.');
            }
            uniquePaths.add(safePath);
            if (!resource.package.files.includes(entry) && safePath !== resource.preview.path) {
                throw fail('SITE_HOSTING_TEMPLATE_MANIFEST_INVALID', '템플릿 preview 경로가 올바르지 않습니다.');
            }
            totalBytes += Number(entry.size || 0);
        }
        if (resource.package.files.length > 500 || totalBytes > MAX_TOTAL_PACKAGE_BYTES) {
            throw fail('SITE_HOSTING_TEMPLATE_SOURCE_TOO_LARGE', '템플릿이 허용된 파일 수 또는 전체 크기를 넘었습니다.', 413);
        }
        return resource;
    }

    function cacheTemplateRoot(resource) {
        return pathApi.join(cacheRoot, resource.id);
    }

    async function downloadResource(reference, includePackage) {
        const manifestPath = safeRelativePath(reference.manifest);
        const manifestUrl = rawUrl(reference.revision, manifestPath);
        let resource;
        try { resource = JSON.parse((await fetchBytes(manifestUrl, MAX_CATALOG_BYTES)).toString('utf8')); }
        catch (error) {
            if (error?.code) throw error;
            throw fail('SITE_HOSTING_TEMPLATE_MANIFEST_INVALID', '템플릿 manifest를 읽지 못했습니다.', 502, error);
        }
        validateResource(resource, reference);
        const templateRoot = cacheTemplateRoot(resource);
        if (fileSystem.existsSync(pathApi.join(templateRoot, 'template.json'))) {
            try {
                const existing = JSON.parse(fileSystem.readFileSync(pathApi.join(templateRoot, 'template.json'), 'utf8'));
                if (existing.source_revision === reference.revision && existing.package_ready) return existing;
                if (!includePackage && existing.package_ready) return { ...existing, remote_resource: resource };
            } catch (_error) { }
        }
        fileSystem.mkdirSync(cacheRoot, { recursive: true });
        const stagingRoot = pathApi.join(cacheRoot, `.staging-${resource.id}-${crypto.randomUUID()}`);
        const packageRoot = pathApi.join(stagingRoot, 'package', resource.version);
        fileSystem.mkdirSync(packageRoot, { recursive: true });
        try {
            const previewPath = safeRelativePath(resource.preview.path);
            const preview = await fetchBytes(rawUrl(reference.revision, pathApi.posix.join(pathApi.posix.dirname(manifestPath), previewPath)), MAX_RESOURCE_BYTES);
            if (crypto.createHash('sha256').update(preview).digest('hex') !== resource.preview.sha256) {
                throw fail('SITE_HOSTING_TEMPLATE_CHECKSUM_MISMATCH', '템플릿 미리보기 checksum이 일치하지 않습니다.');
            }
            fileSystem.writeFileSync(pathApi.join(stagingRoot, 'preview.svg'), preview, { flag: 'wx', mode: 0o600 });
            fileSystem.mkdirSync(pathApi.join(packageRoot, resource.site_hosting.astro.source), { recursive: true });
            if (includePackage) {
                let downloadedBytes = 0;
                for (const entry of resource.package.files) {
                    const relative = safeRelativePath(entry.path);
                    const bytes = await fetchBytes(rawUrl(reference.revision, pathApi.posix.join(pathApi.posix.dirname(manifestPath), resource.package.path, relative)), MAX_RESOURCE_BYTES);
                    downloadedBytes += bytes.length;
                    if (downloadedBytes > MAX_TOTAL_PACKAGE_BYTES) throw fail('SITE_HOSTING_TEMPLATE_SOURCE_TOO_LARGE', '템플릿 전체 다운로드 크기가 허용 범위를 넘었습니다.', 413);
                    if (crypto.createHash('sha256').update(bytes).digest('hex') !== entry.sha256) {
                        throw fail('SITE_HOSTING_TEMPLATE_CHECKSUM_MISMATCH', `템플릿 파일 checksum이 일치하지 않습니다: ${relative}`);
                    }
                    const destination = pathApi.join(stagingRoot, 'package', resource.version, relative);
                    fileSystem.mkdirSync(pathApi.dirname(destination), { recursive: true });
                    fileSystem.writeFileSync(destination, bytes, { flag: 'wx', mode: 0o600 });
                }
            }
            const sourceDirectory = `package/${resource.version}/${resource.site_hosting.astro.source}`;
            const descriptor = {
                id: resource.id,
                version: resource.version,
                name: resource.name,
                description: resource.description,
                source_directory: sourceDirectory,
                preview_file: 'preview.svg',
                source_revision: reference.revision,
                resource,
                package_ready: Boolean(includePackage)
            };
            fileSystem.writeFileSync(pathApi.join(stagingRoot, 'template.json'), `${JSON.stringify(descriptor, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
            fileSystem.mkdirSync(cacheRoot, { recursive: true });
            const backupRoot = `${templateRoot}.previous`;
            if (fileSystem.existsSync(templateRoot)) {
                try { fileSystem.rmSync(backupRoot, { recursive: true, force: true }); } catch (_error) { }
                fileSystem.renameSync(templateRoot, backupRoot);
            }
            try {
                fileSystem.renameSync(stagingRoot, templateRoot);
                if (fileSystem.existsSync(backupRoot)) fileSystem.rmSync(backupRoot, { recursive: true, force: true });
            } catch (error) {
                if (fileSystem.existsSync(backupRoot) && !fileSystem.existsSync(templateRoot)) fileSystem.renameSync(backupRoot, templateRoot);
                throw error;
            }
            return descriptor;
        } catch (error) {
            try { fileSystem.rmSync(stagingRoot, { recursive: true, force: true }); } catch (_cleanupError) { }
            throw error;
        }
    }

    async function refreshCatalog() {
        try {
            const response = await fetchImpl(catalogUrl, { headers: { Accept: 'application/json' } });
            if (!response?.ok) throw fail('SITE_HOSTING_TEMPLATE_CATALOG_UNAVAILABLE', `Amade catalog를 가져오지 못했습니다 (HTTP ${response?.status || 0}).`);
            const bytes = Buffer.from(await response.arrayBuffer());
            if (bytes.length > MAX_CATALOG_BYTES) throw fail('SITE_HOSTING_TEMPLATE_CATALOG_TOO_LARGE', 'Amade catalog 크기가 허용 범위를 넘었습니다.', 413);
            const catalog = JSON.parse(bytes.toString('utf8'));
            const resources = validateCatalog(catalog);
            const metadata = [];
            for (const reference of resources) {
                const descriptor = await downloadResource(reference, false);
                const listedResource = descriptor.remote_resource || descriptor.resource;
                metadata.push({
                    id: descriptor.id,
                    version: reference.version,
                    name: listedResource?.name || descriptor.name,
                    description: listedResource?.description || descriptor.description || '',
                    author: String(listedResource?.author || listedResource?.maintainer || '').trim().slice(0, 100),
                    homepage_url: normalizeHomepageUrl(listedResource?.homepage),
                    has_preview: Boolean(descriptor.preview_file),
                    preview_url: `/api/v1/site-hosting/templates/${encodeURIComponent(descriptor.id)}/preview`,
                    kind: 'site-hosting'
                });
            }
            lastCatalog = resources;
            stale = false;
            return metadata.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
        } catch (error) {
            const cachedTemplates = cached.list()
                .map((template) => cached.get(template.id))
                .filter((template) => template?.package_ready);
            if (!cachedTemplates.length) throw error?.code ? error : fail('SITE_HOSTING_TEMPLATE_CATALOG_UNAVAILABLE', 'Amade template catalog에 연결할 수 없습니다.', 502, error);
            stale = true;
            return cachedTemplates.map((template) => ({ ...template, kind: 'site-hosting', preview_url: `/api/v1/site-hosting/templates/${encodeURIComponent(template.id)}/preview`, catalog_status: 'cached' }));
        }
    }

    async function prepare(id) {
        if (!ID_PATTERN.test(String(id || ''))) return null;
        if (!lastCatalog) await refreshCatalog();
        const reference = lastCatalog?.find((item) => item.id === id);
        if (!reference) {
            const cachedTemplate = cached.get(id);
            if (cachedTemplate?.package_ready) return cachedTemplate;
            return null;
        }
        const current = cached.get(id);
        let descriptor = null;
        if (current?.version === reference.version) {
            try { descriptor = JSON.parse(fileSystem.readFileSync(pathApi.join(cacheRoot, id, 'template.json'), 'utf8')); } catch (_error) { }
        }
        if (descriptor?.package_ready && descriptor.source_revision === reference.revision) return current;
        await downloadResource(reference, true);
        return cached.get(id);
    }

    async function list() { return refreshCatalog(); }

    function get(id) { return cached.get(id); }
    function copySource(id, destination) { return cached.copySource(id, destination); }
    function copyPreview(id, destination) { return cached.copyPreview(id, destination); }

    function getPreview(id) {
        const template = cached.get(id);
        if (!template?.preview_file) return null;
        const buffer = fileSystem.readFileSync(template.preview_file);
        const ext = pathApi.extname(template.preview_file).toLowerCase();
        const contentType = ({ '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' })[ext];
        if (!contentType) return null;
        return { buffer, contentType };
    }

    return { list, get, prepare, copySource, copyPreview, getPreview, get stale() { return stale; }, cacheRoot, catalogUrl };
}

function normalizeHomepageUrl(value) {
    try {
        const parsed = new URL(String(value || '').trim());
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return '';
        return parsed.href;
    } catch (_error) {
        return '';
    }
}

module.exports = { DEFAULT_CATALOG_URL, DEVELOPMENT_CATALOG_URL, createGitHubSiteTemplateCatalog };
