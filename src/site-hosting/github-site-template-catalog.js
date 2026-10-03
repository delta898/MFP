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
    const developmentEnvironment = ['local', 'development'].includes(environment);
    const environmentCatalogUrl = developmentEnvironment ? DEVELOPMENT_CATALOG_URL : DEFAULT_CATALOG_URL;
    const catalogUrl = String(options.catalogUrl || process.env.BLOGGENIUS_SITE_TEMPLATE_CATALOG_URL || environmentCatalogUrl);
    if (!cacheRoot) throw new Error('템플릿 catalog cache 폴더가 필요합니다.');
    if (typeof fetchImpl !== 'function') throw new Error('HTTPS fetch를 사용할 수 없습니다.');

    const cached = createSiteTemplateCatalog({ fs: fileSystem, path: pathApi, templatesRoot: cacheRoot });
    let lastCatalog = null;
    let lastFamilyTemplates = null;
    let lastFamilyRevision = '';
    let lastFamilyTree = null;
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

    function validateFamilyCatalog(catalog) {
        if (catalog?.spec_version !== '0.1.0' || catalog.status !== 'experimental' || !Array.isArray(catalog.families)) {
            throw fail('SITE_HOSTING_TEMPLATE_CATALOG_INVALID', 'Amade 0.1 template catalog 형식이 올바르지 않습니다.');
        }
        const familyIds = new Set();
        const templateIds = new Set();
        const result = [];
        for (const family of catalog.families) {
            const familyId = String(family?.family_id || '');
            const familyManifest = safeRelativePath(family?.manifest);
            if (!ID_PATTERN.test(familyId) || familyIds.has(familyId) || !familyManifest?.startsWith('amade/families/')) {
                throw fail('SITE_HOSTING_TEMPLATE_CATALOG_INVALID', 'Amade template family reference가 올바르지 않습니다.');
            }
            familyIds.add(familyId);
            if (!Array.isArray(family.templates)) throw fail('SITE_HOSTING_TEMPLATE_CATALOG_INVALID', 'Family의 템플릿 목록이 올바르지 않습니다.');
            for (const template of family.templates) {
                const templateId = String(template?.template_id || '');
                const manifest = safeRelativePath(template?.manifest);
                if (!ID_PATTERN.test(templateId) || templateIds.has(templateId) || !manifest?.startsWith('amade/templates/')) {
                    throw fail('SITE_HOSTING_TEMPLATE_CATALOG_INVALID', 'Amade template reference가 올바르지 않습니다.');
                }
                templateIds.add(templateId);
                result.push({ family_id: familyId, family_manifest: familyManifest, template_id: templateId, manifest });
            }
        }
        return result;
    }

    function catalogLocation() {
        const match = catalogUrl.match(/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/);
        if (!match) throw fail('SITE_HOSTING_TEMPLATE_CATALOG_INVALID', 'Amade catalog URL을 확인할 수 없습니다.');
        return { owner: match[1], repo: match[2], ref: match[3], path: safeRelativePath(match[4]) };
    }

    async function fetchJson(url, maxBytes = MAX_CATALOG_BYTES, code = 'SITE_HOSTING_TEMPLATE_MANIFEST_INVALID') {
        try { return JSON.parse((await fetchBytes(url, maxBytes)).toString('utf8')); }
        catch (error) {
            if (error?.code) throw error;
            throw fail(code, 'Amade manifest를 읽지 못했습니다.', 502, error);
        }
    }

    async function resolveFamilyRevision() {
        if (typeof options.revisionResolver === 'function') {
            const revision = String(await options.revisionResolver(catalogLocation()) || '');
            if (/^[a-f0-9]{40}$/.test(revision)) return revision;
            throw fail('SITE_HOSTING_TEMPLATE_CATALOG_INVALID', 'Amade catalog revision이 올바르지 않습니다.');
        }
        const location = catalogLocation();
        const apiUrl = `https://api.github.com/repos/${encodeURIComponent(location.owner)}/${encodeURIComponent(location.repo)}/commits/${encodeURIComponent(location.ref)}`;
        const response = await fetchImpl(apiUrl, { headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } });
        if (!response?.ok) throw fail('SITE_HOSTING_TEMPLATE_CATALOG_UNAVAILABLE', `Amade revision을 확인하지 못했습니다 (HTTP ${response?.status || 0}).`);
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length > MAX_CATALOG_BYTES) throw fail('SITE_HOSTING_TEMPLATE_CATALOG_TOO_LARGE', 'Amade revision 응답 크기가 허용 범위를 넘었습니다.', 413);
        const result = JSON.parse(bytes.toString('utf8'));
        if (!/^[a-f0-9]{40}$/.test(String(result?.sha || ''))) throw fail('SITE_HOSTING_TEMPLATE_CATALOG_INVALID', 'Amade revision이 올바르지 않습니다.');
        return result.sha;
    }

    async function familyTree(revision) {
        if (lastFamilyTree?.revision === revision) return lastFamilyTree.entries;
        const location = catalogLocation();
        const apiUrl = `https://api.github.com/repos/${encodeURIComponent(location.owner)}/${encodeURIComponent(location.repo)}/git/trees/${revision}?recursive=1`;
        const response = await fetchImpl(apiUrl, { headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } });
        if (!response?.ok) throw fail('SITE_HOSTING_TEMPLATE_SOURCE_UNAVAILABLE', `Amade 파일 목록을 가져오지 못했습니다 (HTTP ${response?.status || 0}).`);
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length > MAX_CATALOG_BYTES * 10) throw fail('SITE_HOSTING_TEMPLATE_SOURCE_TOO_LARGE', 'Amade 파일 목록 크기가 허용 범위를 넘었습니다.', 413);
        const document = JSON.parse(bytes.toString('utf8'));
        if (document?.truncated || !Array.isArray(document?.tree)) throw fail('SITE_HOSTING_TEMPLATE_CATALOG_INVALID', 'Amade 파일 목록이 불완전합니다.');
        const entries = new Map();
        for (const entry of document.tree) {
            if (entry?.type !== 'blob') continue;
            const filePath = safeRelativePath(entry.path);
            if (!filePath || !['100644', '100755'].includes(entry.mode) || !Number.isSafeInteger(entry.size) || entry.size < 0) continue;
            entries.set(filePath, { path: filePath, size: entry.size });
        }
        lastFamilyTree = { revision, entries };
        return entries;
    }

    async function downloadFamilyTemplate(reference, includePackage, revision, tree) {
        const family = await fetchJson(rawUrl(revision, reference.family_manifest));
        const template = await fetchJson(rawUrl(revision, reference.manifest));
        const templateRoot = pathApi.posix.dirname(reference.manifest);
        const familyRoot = pathApi.posix.dirname(reference.family_manifest);
        const projectPath = safeRelativePath(template.astro_project);
        const dataPath = safeRelativePath(family.site_data_directory);
        const previewPath = safeRelativePath(template.preview);
        if (family.spec_version !== '0.1.0' || family.family_id !== reference.family_id
            || template.spec_version !== '0.1.0' || template.template_id !== reference.template_id
            || template.family_id !== reference.family_id || !projectPath || !dataPath || !previewPath
            || !String(template.name || '').trim() || !String(template.description || '').trim()
            || !String(template.author || '').trim() || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(String(template.version || ''))
            || !String(template.license || '').trim() || !Array.isArray(template.categories) || !template.categories.length
            || !Array.isArray(template.tags) || (template.status !== undefined && !['active', 'deprecated', 'withdrawn'].includes(template.status))) {
            throw fail('SITE_HOSTING_TEMPLATE_MANIFEST_INVALID', 'Amade family 또는 template manifest가 0.1 규격에 맞지 않습니다.');
        }
        const projectPrefix = `${templateRoot}/${projectPath}/`;
        const dataPrefix = `${familyRoot}/${dataPath}/`;
        const selectedFiles = [...tree.values()].filter((entry) => entry.path.startsWith(projectPrefix) || entry.path.startsWith(dataPrefix));
        const projectFiles = selectedFiles.filter((entry) => entry.path.startsWith(projectPrefix));
        const dataFiles = selectedFiles.filter((entry) => entry.path.startsWith(dataPrefix));
        if (!projectFiles.some((entry) => entry.path === `${templateRoot}/${projectPath}/package.json`)
            || !projectFiles.some((entry) => entry.path === `${templateRoot}/${projectPath}/package-lock.json`)
            || !dataFiles.some((entry) => entry.path === `${dataPrefix}site.json`)
            || projectFiles.length + dataFiles.length > 1000
            || selectedFiles.reduce((sum, entry) => sum + entry.size, 0) > MAX_TOTAL_PACKAGE_BYTES) {
            throw fail('SITE_HOSTING_TEMPLATE_SOURCE_TOO_LARGE', '템플릿 패키지가 필수 파일, 파일 수 또는 전체 크기 제한을 통과하지 못했습니다.', 413);
        }
        const assets = [previewPath, ...(Array.isArray(template.screenshots) ? template.screenshots.map(safeRelativePath) : [])];
        const allowedImageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg']);
        if (assets.length > 21 || assets.some((item) => !item || !allowedImageExtensions.has(pathApi.extname(item).toLowerCase()))) {
            throw fail('SITE_HOSTING_TEMPLATE_MANIFEST_INVALID', '미리보기 파일 경로 또는 이미지 형식이 올바르지 않습니다.');
        }
        const assetEntries = assets.map((item) => tree.get(`${templateRoot}/${item}`));
        if (assetEntries.some((entry) => !entry || entry.size > MAX_RESOURCE_BYTES)
            || assetEntries.reduce((sum, entry) => sum + (entry?.size || 0), 0) + selectedFiles.reduce((sum, entry) => sum + entry.size, 0) > MAX_TOTAL_PACKAGE_BYTES) {
            throw fail('SITE_HOSTING_TEMPLATE_SOURCE_TOO_LARGE', '템플릿 이미지의 크기 또는 전체 패키지 제한을 넘었습니다.', 413);
        }
        const templateId = template.template_id;
        const templateCacheRoot = cacheTemplateRoot({ id: templateId });
        const cacheDescriptorPath = pathApi.join(templateCacheRoot, 'template.json');
        if (fileSystem.existsSync(cacheDescriptorPath)) {
            try {
                const existing = JSON.parse(fileSystem.readFileSync(cacheDescriptorPath, 'utf8'));
                if (existing.source_revision === revision && existing.package_ready && (!includePackage || existing.package_ready)) return existing;
                if (!includePackage && existing.source_revision === revision) return existing;
            } catch (_error) { }
        }
        const stagingRoot = pathApi.join(cacheRoot, `.staging-${templateId}-${crypto.randomUUID()}`);
        const packageRoot = pathApi.join(stagingRoot, 'package', template.version);
        fileSystem.mkdirSync(packageRoot, { recursive: true });
        try {
            fileSystem.mkdirSync(pathApi.join(packageRoot, projectPath), { recursive: true });
            fileSystem.mkdirSync(pathApi.join(packageRoot, 'site-data'), { recursive: true });
            const seedEntry = tree.get(`${dataPrefix}site.json`);
            const seedBytes = await fetchBytes(rawUrl(revision, `${dataPrefix}site.json`), MAX_RESOURCE_BYTES);
            if (seedBytes.length !== seedEntry.size) throw fail('SITE_HOSTING_TEMPLATE_CHECKSUM_MISMATCH', 'Family 기본 사이트 설정의 크기가 revision 파일 목록과 일치하지 않습니다.');
            let familySeedSite;
            try { familySeedSite = JSON.parse(seedBytes.toString('utf8')); }
            catch (cause) { throw fail('SITE_HOSTING_TEMPLATE_MANIFEST_INVALID', 'Family 기본 site.json 형식이 올바르지 않습니다.', 502, cause); }
            if (!String(familySeedSite.displayName || '').trim() || !Array.isArray(familySeedSite.navigation)
                || familySeedSite.navigation.some((item) => !item || typeof item.label !== 'string' || typeof item.path !== 'string')) {
                throw fail('SITE_HOSTING_TEMPLATE_MANIFEST_INVALID', 'Family 기본 site.json에 이름 또는 메뉴 규칙이 없습니다.');
            }
            const contentTypes = assets.map((item) => ({ relative: item, path: `${templateRoot}/${item}` }));
            for (const asset of contentTypes) {
                if (!tree.has(asset.path)) throw fail('SITE_HOSTING_TEMPLATE_MANIFEST_INVALID', `템플릿 미리보기 파일이 없습니다: ${asset.relative}`);
                const bytes = await fetchBytes(rawUrl(revision, asset.path), MAX_RESOURCE_BYTES);
                if (bytes.length !== tree.get(asset.path).size) throw fail('SITE_HOSTING_TEMPLATE_CHECKSUM_MISMATCH', '템플릿 파일 크기가 revision 파일 목록과 일치하지 않습니다.');
                const dest = pathApi.join(stagingRoot, asset.relative);
                fileSystem.mkdirSync(pathApi.dirname(dest), { recursive: true });
                fileSystem.writeFileSync(dest, bytes, { flag: 'wx', mode: 0o600 });
            }
            if (includePackage) {
                for (const entry of [...projectFiles, ...dataFiles]) {
                    const isProject = entry.path.startsWith(projectPrefix);
                    const relative = entry.path.slice((isProject ? projectPrefix : dataPrefix).length);
                    const bytes = await fetchBytes(rawUrl(revision, entry.path), MAX_RESOURCE_BYTES);
                    if (bytes.length !== entry.size) throw fail('SITE_HOSTING_TEMPLATE_CHECKSUM_MISMATCH', '템플릿 파일 크기가 revision 파일 목록과 일치하지 않습니다.');
                    const destination = pathApi.join(packageRoot, isProject ? projectPath : 'site-data', relative);
                    fileSystem.mkdirSync(pathApi.dirname(destination), { recursive: true });
                    fileSystem.writeFileSync(destination, bytes, { flag: 'wx', mode: 0o600 });
                }
            }
            const descriptor = {
                id: templateId, version: template.version, name: template.name, description: template.description,
                source_directory: `package/${template.version}/${projectPath}`,
                family_data_directory: `package/${template.version}/site-data`,
                preview_file: previewPath,
                source_revision: revision,
                family_id: family.family_id,
                family_name: family.name,
                family_description: family.description || '',
                resource: { spec_version: '0.1.0', family, template, family_seed_site: familySeedSite },
                package_ready: Boolean(includePackage)
            };
            fileSystem.writeFileSync(pathApi.join(stagingRoot, 'template.json'), `${JSON.stringify(descriptor, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
            fileSystem.mkdirSync(cacheRoot, { recursive: true });
            const backupRoot = `${templateCacheRoot}.previous`;
            if (fileSystem.existsSync(templateCacheRoot)) {
                try { fileSystem.rmSync(backupRoot, { recursive: true, force: true }); } catch (_error) { }
                fileSystem.renameSync(templateCacheRoot, backupRoot);
            }
            try {
                fileSystem.renameSync(stagingRoot, templateCacheRoot);
                if (fileSystem.existsSync(backupRoot)) fileSystem.rmSync(backupRoot, { recursive: true, force: true });
            } catch (error) {
                if (fileSystem.existsSync(backupRoot) && !fileSystem.existsSync(templateCacheRoot)) fileSystem.renameSync(backupRoot, templateCacheRoot);
                throw error;
            }
            return descriptor;
        } catch (error) {
            try { fileSystem.rmSync(stagingRoot, { recursive: true, force: true }); } catch (_cleanupError) { }
            throw error;
        }
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
            const catalog = await fetchJson(catalogUrl, MAX_CATALOG_BYTES, 'SITE_HOSTING_TEMPLATE_CATALOG_INVALID');
            if (developmentEnvironment && catalog?.spec_version !== '0.1.0') {
                lastFamilyTemplates = null;
                lastFamilyRevision = '';
                lastCatalog = [];
                stale = false;
                return [];
            }
            if (catalog?.spec_version === '0.1.0') {
                const revision = await resolveFamilyRevision();
                const location = catalogLocation();
                const pinnedCatalog = await fetchJson(rawUrl(revision, location.path), MAX_CATALOG_BYTES, 'SITE_HOSTING_TEMPLATE_CATALOG_INVALID');
                const references = validateFamilyCatalog(pinnedCatalog);
                const tree = await familyTree(revision);
                const descriptors = [];
                for (const reference of references) {
                    const descriptor = await downloadFamilyTemplate(reference, false, revision, tree);
                    descriptors.push(descriptor);
                }
                lastFamilyTemplates = references;
                lastFamilyRevision = revision;
                lastCatalog = null;
                stale = false;
                return descriptors
                    .filter((descriptor) => descriptor.resource?.template?.status === 'active')
                    .map((descriptor) => ({
                        id: descriptor.id,
                        version: descriptor.version,
                        name: descriptor.name,
                        description: descriptor.description,
                        author: descriptor.resource.template.author,
                        homepage_url: normalizeHomepageUrl(descriptor.resource.template.homepage),
                        categories: descriptor.resource.template.categories,
                        tags: descriptor.resource.template.tags,
                        status: descriptor.resource.template.status,
                        family_id: descriptor.family_id,
                        family_name: descriptor.family_name,
                        family_description: descriptor.family_description,
                        has_preview: Boolean(descriptor.preview_file),
                        preview_url: `/api/v1/site-hosting/templates/${encodeURIComponent(descriptor.id)}/preview`,
                        kind: 'site-hosting'
                    }));
            }
            lastFamilyTemplates = null;
            lastFamilyRevision = '';
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
                .filter((template) => template?.package_ready
                    && (!developmentEnvironment || template.resource?.template?.status === 'active'));
            if (!cachedTemplates.length) throw error?.code ? error : fail('SITE_HOSTING_TEMPLATE_CATALOG_UNAVAILABLE', 'Amade template catalog에 연결할 수 없습니다.', 502, error);
            stale = true;
            return cachedTemplates.map((template) => ({ ...template, kind: 'site-hosting', preview_url: `/api/v1/site-hosting/templates/${encodeURIComponent(template.id)}/preview`, catalog_status: 'cached' }));
        }
    }

    async function prepare(id) {
        if (!ID_PATTERN.test(String(id || ''))) return null;
        if (!lastCatalog && !lastFamilyTemplates) await refreshCatalog();
        if (lastFamilyTemplates) {
            const reference = lastFamilyTemplates.find((item) => item.template_id === id);
            if (!reference) {
                const cachedTemplate = cached.get(id);
                return cachedTemplate?.package_ready ? cachedTemplate : null;
            }
            const descriptor = cached.get(id);
            const templateStatus = descriptor?.resource?.template?.status;
            if (templateStatus !== 'active') return null;
            if (descriptor?.package_ready && descriptor.source_revision === lastFamilyRevision) return descriptor;
            const tree = await familyTree(lastFamilyRevision);
            await downloadFamilyTemplate(reference, true, lastFamilyRevision, tree);
            return cached.get(id);
        }
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
