'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PROJECT_SCHEMA_VERSION = 1;

function safeProjectId(value) {
    const id = String(value || '').trim();
    return /^[a-zA-Z0-9_-]{1,100}$/.test(id) ? id : '';
}

function createSiteHostingProjectRepository(options = {}) {
    const fileSystem = options.fs || fs;
    const pathApi = options.path || path;
    const workspaceDir = pathApi.resolve(String(options.workspaceDir || '').trim());
    if (!String(options.workspaceDir || '').trim()) throw new Error('사이트 호스팅 작업 폴더가 필요합니다.');

    const siteHostingRoot = pathApi.join(workspaceDir, 'site-hosting');
    const projectsRoot = pathApi.join(siteHostingRoot, 'projects');
    const sitesRoot = pathApi.join(siteHostingRoot, 'sites');

    function countSites(projectId) {
        if (!fileSystem.existsSync(sitesRoot)) return 0;
        return fileSystem.readdirSync(sitesRoot, { withFileTypes: true })
            .filter((entry) => entry.isDirectory() && /^[a-zA-Z0-9_-]{1,100}$/.test(entry.name))
            .filter((entry) => {
                const manifestPath = pathApi.join(sitesRoot, entry.name, '.bloggenius', 'site.json');
                if (!fileSystem.existsSync(manifestPath)) return false;
                try {
                    const site = JSON.parse(String(fileSystem.readFileSync(manifestPath, 'utf8') || ''));
                    return site?.id === entry.name && site?.project_id === projectId;
                } catch (_error) {
                    return false;
                }
            }).length;
    }

    function getProjectRoot(id) {
        const safeId = safeProjectId(id);
        if (!safeId) {
            const error = new Error('프로젝트 ID가 올바르지 않습니다.');
            error.code = 'SITE_HOSTING_PROJECT_ID_INVALID';
            error.status = 400;
            throw error;
        }
        return pathApi.join(projectsRoot, safeId);
    }

    function readProject(id) {
        const projectRoot = getProjectRoot(id);
        const manifestPath = pathApi.join(projectRoot, 'project.json');
        if (!fileSystem.existsSync(manifestPath)) return null;
        try {
            const project = JSON.parse(String(fileSystem.readFileSync(manifestPath, 'utf8') || ''));
            if (project?.id !== id || project?.schema_version !== PROJECT_SCHEMA_VERSION || !String(project?.name || '').trim()) {
                throw new Error('Project manifest contract mismatch.');
            }
            return {
                ...project,
                root_path: projectRoot,
                site_count: countSites(id)
            };
        } catch (cause) {
            const error = new Error('프로젝트 정보를 읽지 못했습니다.');
            error.code = 'SITE_HOSTING_PROJECT_READ_FAILED';
            error.status = 500;
            error.cause = cause;
            throw error;
        }
    }

    function list() {
        if (!fileSystem.existsSync(projectsRoot)) return [];
        return fileSystem.readdirSync(projectsRoot, { withFileTypes: true })
            .filter((entry) => entry.isDirectory() && safeProjectId(entry.name))
            .map((entry) => readProject(entry.name))
            .filter(Boolean)
            .sort((left, right) => String(right.updated_at || '').localeCompare(String(left.updated_at || '')));
    }

    function get(id) {
        return readProject(String(id || '').trim());
    }

    function create(project) {
        const id = safeProjectId(project?.id);
        if (!id) {
            const error = new Error('프로젝트 ID가 올바르지 않습니다.');
            error.code = 'SITE_HOSTING_PROJECT_ID_INVALID';
            error.status = 400;
            throw error;
        }
        const projectRoot = getProjectRoot(id);
        fileSystem.mkdirSync(projectsRoot, { recursive: true });
        fileSystem.mkdirSync(sitesRoot, { recursive: true });
        try {
            fileSystem.mkdirSync(projectRoot, { recursive: false });
        } catch (cause) {
            const error = new Error(cause?.code === 'EEXIST' ? '이미 존재하는 프로젝트입니다.' : '프로젝트 폴더를 만들지 못했습니다.');
            error.code = cause?.code === 'EEXIST' ? 'SITE_HOSTING_PROJECT_ALREADY_EXISTS' : 'SITE_HOSTING_PROJECT_CREATE_FAILED';
            error.status = cause?.code === 'EEXIST' ? 409 : 500;
            error.cause = cause;
            throw error;
        }

        try {
            const manifest = {
                schema_version: PROJECT_SCHEMA_VERSION,
                id,
                name: String(project.name || '').trim(),
                root_domain: '',
                created_at: String(project.created_at || ''),
                updated_at: String(project.updated_at || '')
            };
            const tempPath = pathApi.join(projectRoot, `.project.json.${process.pid}.${Date.now()}.tmp`);
            fileSystem.writeFileSync(tempPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
            fileSystem.renameSync(tempPath, pathApi.join(projectRoot, 'project.json'));
            return { ...manifest, root_path: projectRoot, site_count: 0 };
        } catch (cause) {
            try { fileSystem.rmSync(projectRoot, { recursive: true, force: true }); } catch (_cleanupError) { }
            const error = new Error('프로젝트 정보를 저장하지 못했습니다.');
            error.code = 'SITE_HOSTING_PROJECT_CREATE_FAILED';
            error.status = 500;
            error.cause = cause;
            throw error;
        }
    }

    return { siteHostingRoot, projectsRoot, sitesRoot, getProjectRoot, list, get, create };
}

module.exports = { PROJECT_SCHEMA_VERSION, safeProjectId, createSiteHostingProjectRepository };
