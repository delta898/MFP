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

    const projectsRoot = pathApi.join(workspaceDir, 'site-hosting', 'projects');

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
                site_count: fileSystem.existsSync(pathApi.join(projectRoot, 'sites'))
                    ? fileSystem.readdirSync(pathApi.join(projectRoot, 'sites'), { withFileTypes: true }).filter((entry) => entry.isDirectory()).length
                    : 0
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
            fileSystem.mkdirSync(pathApi.join(projectRoot, 'sites'));
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

    return { projectsRoot, getProjectRoot, list, get, create };
}

module.exports = { PROJECT_SCHEMA_VERSION, safeProjectId, createSiteHostingProjectRepository };
