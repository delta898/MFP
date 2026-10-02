'use strict';

const crypto = require('node:crypto');
const { createSiteHostingProjectRepository } = require('../../site-hosting/project-repository');
const { createSiteHostingSiteRepository } = require('../../site-hosting/site-repository');
const { createSiteTemplateCatalog } = require('../../site-hosting/site-template-catalog');
const { createAstroSiteRuntime } = require('../../site-hosting/astro-site-runtime');
const { createCloudflareStaticAssetsDeployer } = require('../../site-hosting/cloudflare-static-assets-deployer');

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
    const getCloudflareDeploymentCredentials = deps.getCloudflareDeploymentCredentials || (async () => {
        const error = new Error('Cloudflare 배포 연결을 사용할 수 없습니다.');
        error.code = 'CLOUDFLARE_CONNECTION_REQUIRED';
        error.status = 409;
        throw error;
    });
    const astroRuntime = deps.astroRuntime || createAstroSiteRuntime({
        fs: deps.fs,
        path: deps.path,
        workspaceDir: deps.workspaceDir,
        templatesRoot: deps.templatesRoot,
        projectRepository,
        siteRepository: repository,
        templates,
        npmCliPath: deps.npmCliPath,
        spawn: deps.spawn,
        cacheRoot: deps.cacheRoot
    });
    const cloudflareDeployer = deps.cloudflareDeployer || createCloudflareStaticAssetsDeployer({
        fs: deps.fs,
        path: deps.path,
        getCredentials: getCloudflareDeploymentCredentials,
        createClient: deps.createCloudflareSdkClient,
        createAdapter: deps.createCloudflareSdkAdapter,
        fetchImpl: deps.fetchImpl
    });
    const now = deps.now || (() => new Date().toISOString());
    const createId = deps.createId || (() => crypto.randomUUID().replace(/-/g, ''));

    function listTemplates() {
        return templates.list();
    }

    function list(projectId) {
        return repository.list(projectId).map(({ id, project_id, name, template, template_name, template_status, hostname, deployment, created_at, updated_at }) => ({
            id, project_id, name, template, template_name, template_status, hostname, deployment, created_at, updated_at
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

    return {
        listTemplates,
        list,
        create,
        build: (projectId, siteId) => astroRuntime.build(projectId, siteId),
        getBuildStatus: (projectId, siteId) => astroRuntime.getBuildStatus(projectId, siteId),
        startPreview: (projectId, siteId) => astroRuntime.startPreview(projectId, siteId),
        stopPreview: (projectId, siteId) => astroRuntime.stopPreview(projectId, siteId),
        async deploy(projectId, siteId) {
            const site = repository.get(projectId, siteId);
            if (!site) {
                const error = new Error('사이트를 찾을 수 없습니다.');
                error.code = 'SITE_HOSTING_SITE_NOT_FOUND';
                error.status = 404;
                throw error;
            }
            const credentials = await getCloudflareDeploymentCredentials();
            await astroRuntime.build(projectId, siteId);
            const deployed = await cloudflareDeployer.deploy(site, credentials);
            const deployedAt = now();
            repository.recordDeployment(projectId, siteId, { ...deployed, deployed_at: deployedAt });
            return { ...deployed, deployed_at: deployedAt };
        }
    };
}

module.exports = { createSiteHostingSiteService };
