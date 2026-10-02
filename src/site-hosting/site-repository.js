'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SITE_SCHEMA_VERSION = 1;

function safeSiteId(value) {
    const id = String(value || '').trim();
    return /^[a-zA-Z0-9_-]{1,100}$/.test(id) ? id : '';
}

function createSiteHostingSiteRepository(options = {}) {
    const fileSystem = options.fs || fs;
    const pathApi = options.path || path;
    const projectRepository = options.projectRepository;
    const templates = options.templates;
    if (!projectRepository || !templates) throw new Error('프로젝트 저장소와 템플릿 catalog가 필요합니다.');

    function getSitesRoot(projectId) {
        const project = projectRepository.get(projectId);
        if (!project) {
            const error = new Error('프로젝트를 찾을 수 없습니다.');
            error.code = 'SITE_HOSTING_PROJECT_NOT_FOUND';
            error.status = 404;
            throw error;
        }
        return pathApi.join(project.root_path, 'sites');
    }

    function readSite(projectId, siteId) {
        const safeId = safeSiteId(siteId);
        if (!safeId) {
            const error = new Error('사이트 ID가 올바르지 않습니다.');
            error.code = 'SITE_HOSTING_SITE_ID_INVALID';
            error.status = 400;
            throw error;
        }
        const siteRoot = pathApi.join(getSitesRoot(projectId), safeId);
        const manifestPath = pathApi.join(siteRoot, '.bloggenius', 'site.json');
        if (!fileSystem.existsSync(manifestPath)) return null;
        try {
            const site = JSON.parse(String(fileSystem.readFileSync(manifestPath, 'utf8') || ''));
            if (site?.id !== safeId || site?.project_id !== projectId || site?.schema_version !== SITE_SCHEMA_VERSION || !String(site?.name || '').trim()) {
                throw new Error('Site manifest contract mismatch.');
            }
            const template = templates.get(site.template?.id);
            if (!template || template.version !== site.template?.version) {
                site.template_status = 'unavailable';
            } else {
                site.template_name = template.name;
                site.template_status = 'available';
            }
            return { ...site, root_path: siteRoot };
        } catch (cause) {
            const error = new Error('사이트 정보를 읽지 못했습니다.');
            error.code = 'SITE_HOSTING_SITE_READ_FAILED';
            error.status = 500;
            error.cause = cause;
            throw error;
        }
    }

    function list(projectId) {
        const sitesRoot = getSitesRoot(projectId);
        if (!fileSystem.existsSync(sitesRoot)) return [];
        return fileSystem.readdirSync(sitesRoot, { withFileTypes: true })
            .filter((entry) => entry.isDirectory() && safeSiteId(entry.name))
            .map((entry) => readSite(projectId, entry.name))
            .filter(Boolean)
            .sort((left, right) => String(right.updated_at || '').localeCompare(String(left.updated_at || '')));
    }

    function get(projectId, siteId) {
        return readSite(String(projectId || '').trim(), String(siteId || '').trim());
    }

    function create(projectId, site) {
        const sitesRoot = getSitesRoot(projectId);
        const id = safeSiteId(site?.id);
        if (!id) {
            const error = new Error('사이트 ID가 올바르지 않습니다.');
            error.code = 'SITE_HOSTING_SITE_ID_INVALID';
            error.status = 400;
            throw error;
        }
        const template = templates.get(site?.template_id);
        if (!template) {
            const error = new Error('선택한 템플릿을 찾을 수 없습니다.');
            error.code = 'SITE_HOSTING_TEMPLATE_NOT_FOUND';
            error.status = 404;
            throw error;
        }
        const siteRoot = pathApi.join(sitesRoot, id);
        fileSystem.mkdirSync(sitesRoot, { recursive: true });
        try {
            fileSystem.mkdirSync(siteRoot, { recursive: false });
        } catch (cause) {
            const error = new Error(cause?.code === 'EEXIST' ? '이미 존재하는 사이트입니다.' : '사이트 폴더를 만들지 못했습니다.');
            error.code = cause?.code === 'EEXIST' ? 'SITE_HOSTING_SITE_ALREADY_EXISTS' : 'SITE_HOSTING_SITE_CREATE_FAILED';
            error.status = cause?.code === 'EEXIST' ? 409 : 500;
            error.cause = cause;
            throw error;
        }

        try {
            const templateSnapshot = templates.copySource(template.id, siteRoot);
            const manifest = {
                schema_version: SITE_SCHEMA_VERSION,
                id,
                project_id: projectId,
                name: String(site.name || '').trim(),
                template: { id: template.id, version: templateSnapshot.version },
                hostname: '',
                created_at: String(site.created_at || ''),
                updated_at: String(site.updated_at || '')
            };
            const metadataRoot = pathApi.join(siteRoot, '.bloggenius');
            fileSystem.mkdirSync(metadataRoot, { recursive: true });
            const tempPath = pathApi.join(metadataRoot, `.site.json.${process.pid}.${Date.now()}.tmp`);
            fileSystem.writeFileSync(tempPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
            fileSystem.renameSync(tempPath, pathApi.join(metadataRoot, 'site.json'));
            return { ...manifest, template_name: template.name, template_status: 'available', root_path: siteRoot };
        } catch (cause) {
            try { fileSystem.rmSync(siteRoot, { recursive: true, force: true }); } catch (_cleanupError) { }
            const error = new Error('사이트를 만들지 못했습니다.');
            error.code = cause?.code || 'SITE_HOSTING_SITE_CREATE_FAILED';
            error.status = Number.isInteger(cause?.status) ? cause.status : 500;
            error.cause = cause;
            throw error;
        }
    }

    function recordDeployment(projectId, siteId, deployment) {
        const site = readSite(projectId, siteId);
        if (!site) {
            const error = new Error('사이트를 찾을 수 없습니다.');
            error.code = 'SITE_HOSTING_SITE_NOT_FOUND';
            error.status = 404;
            throw error;
        }
        const manifestPath = pathApi.join(site.root_path, '.bloggenius', 'site.json');
        const manifest = JSON.parse(String(fileSystem.readFileSync(manifestPath, 'utf8') || ''));
        const updated = {
            ...manifest,
            deployment: {
                provider: 'cloudflare',
                worker_name: String(deployment.worker_name || ''),
                url: String(deployment.url || ''),
                deployment_id: String(deployment.deployment_id || ''),
                version_id: String(deployment.version_id || ''),
                deployed_at: String(deployment.deployed_at || '')
            },
            updated_at: String(deployment.deployed_at || manifest.updated_at || '')
        };
        const tempPath = pathApi.join(pathApi.dirname(manifestPath), `.site.json.${process.pid}.${Date.now()}.tmp`);
        fileSystem.writeFileSync(tempPath, `${JSON.stringify(updated, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
        fileSystem.renameSync(tempPath, manifestPath);
        return readSite(projectId, siteId);
    }

    return { list, get, create, recordDeployment };
}

module.exports = { SITE_SCHEMA_VERSION, safeSiteId, createSiteHostingSiteRepository };
