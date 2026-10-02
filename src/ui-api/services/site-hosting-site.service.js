'use strict';

const crypto = require('node:crypto');
const { createSiteHostingProjectRepository } = require('../../site-hosting/project-repository');
const { createSiteHostingSiteRepository } = require('../../site-hosting/site-repository');
const { createSiteTemplateCatalog } = require('../../site-hosting/site-template-catalog');

function createSiteHostingSiteService(deps = {}) {
    const projectRepository = deps.projectRepository || createSiteHostingProjectRepository({
        fs: deps.fs,
        path: deps.path,
        workspaceDir: deps.workspaceDir
    });
    const templates = deps.templates || createSiteTemplateCatalog({
        fs: deps.fs,
        path: deps.path,
        templatesRoot: deps.templatesRoot
    });
    const repository = deps.repository || createSiteHostingSiteRepository({
        fs: deps.fs,
        path: deps.path,
        projectRepository,
        templates
    });
    const now = deps.now || (() => new Date().toISOString());
    const createId = deps.createId || (() => crypto.randomUUID().replace(/-/g, ''));

    function listTemplates() {
        return templates.list();
    }

    function list(projectId) {
        return repository.list(projectId).map(({ id, project_id, name, template, template_name, template_status, hostname, created_at, updated_at }) => ({
            id, project_id, name, template, template_name, template_status, hostname, created_at, updated_at
        }));
    }

    function create(projectId, payload = {}) {
        const project = projectRepository.get(projectId);
        if (!project) {
            const error = new Error('프로젝트를 찾을 수 없습니다.');
            error.code = 'SITE_HOSTING_PROJECT_NOT_FOUND';
            error.status = 404;
            throw error;
        }
        const name = String(payload.name || '').trim();
        if (!name) {
            const error = new Error('사이트 이름을 입력해 주세요.');
            error.code = 'SITE_HOSTING_SITE_NAME_REQUIRED';
            error.status = 400;
            throw error;
        }
        if (name.length > 80) {
            const error = new Error('사이트 이름은 80자 이내로 입력해 주세요.');
            error.code = 'SITE_HOSTING_SITE_NAME_TOO_LONG';
            error.status = 400;
            throw error;
        }
        const templateId = String(payload.template_id || '').trim();
        if (!templates.get(templateId)) {
            const error = new Error('사용할 템플릿을 선택해 주세요.');
            error.code = 'SITE_HOSTING_TEMPLATE_REQUIRED';
            error.status = 400;
            throw error;
        }
        const timestamp = now();
        const created = repository.create(project.id, {
            id: createId(),
            name,
            template_id: templateId,
            created_at: timestamp,
            updated_at: timestamp
        });
        return {
            id: created.id,
            project_id: created.project_id,
            name: created.name,
            template: created.template,
            template_name: created.template_name,
            template_status: created.template_status,
            hostname: created.hostname,
            created_at: created.created_at,
            updated_at: created.updated_at
        };
    }

    return { listTemplates, list, create };
}

module.exports = { createSiteHostingSiteService };
