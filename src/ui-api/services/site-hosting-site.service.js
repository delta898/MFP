'use strict';

const crypto = require('node:crypto');
const { domainToASCII } = require('node:url');
const net = require('node:net');
const { createSiteHostingProjectRepository } = require('../../site-hosting/project-repository');
const { createSiteHostingSiteRepository } = require('../../site-hosting/site-repository');
const { createSiteTemplateCatalog } = require('../../site-hosting/site-template-catalog');
const { createAstroSiteRuntime } = require('../../site-hosting/astro-site-runtime');
const { createCloudflareStaticAssetsDeployer } = require('../../site-hosting/cloudflare-static-assets-deployer');

function createSiteHostingSiteService(deps = {}) {
    const fileSystem = deps.fs || require('node:fs');
    const pathApi = deps.path || require('node:path');
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
    const createCloudflareClient = deps.createCloudflareSdkClient || ((accessToken) => {
        const Cloudflare = require('cloudflare');
        return new Cloudflare({ apiToken: accessToken, maxRetries: 1 });
    });
    const createCloudflareAdapter = deps.createCloudflareSdkAdapter || require('../../site-hosting/cloudflare-static-assets-deployer').createCloudflareSdkAdapter;
    const now = deps.now || (() => new Date().toISOString());
    const createId = deps.createId || (() => crypto.randomUUID().replace(/-/g, ''));

    async function openPath(targetPath) {
        const electron = require('electron');
        if (!electron?.shell?.openPath) throw new Error('시스템 파일 탐색기를 실행할 수 없습니다.');
        return electron.shell.openPath(targetPath);
    }

    function createSite(projectId, name, templateId, id = createId()) {
        const project = projectRepository.get(projectId);
        if (!project) {
            const error = new Error('프로젝트를 찾을 수 없습니다.');
            error.code = 'SITE_HOSTING_PROJECT_NOT_FOUND';
            error.status = 404;
            throw error;
        }
        if (!templates.get(templateId)) {
            const error = new Error('사용할 템플릿을 선택해 주세요.');
            error.code = 'SITE_HOSTING_TEMPLATE_REQUIRED';
            error.status = 400;
            throw error;
        }
        const timestamp = now();
        const created = repository.create(project.id, { id, name, template_id: templateId, created_at: timestamp, updated_at: timestamp });
        return {
            id: created.id,
            project_id: created.project_id,
            name: created.name,
            template: created.template,
            template_name: created.template_name,
            template_status: created.template_status,
            hostname: created.hostname,
            domain: created.domain || '',
            custom_domain: formatCustomDomain(created.hostname, created.domain),
            created_at: created.created_at,
            updated_at: created.updated_at
        };
    }

    function listTemplates() {
        return templates.list();
    }

    function list(projectId) {
        let sites = repository.list(projectId);
        if (projectId === 'default' && !sites.some((site) => site.id === 'default')) {
            try {
                createSite('default', '나의 첫 사이트', 'minimal-homepage', 'default');
            } catch (error) {
                if (error?.code !== 'SITE_HOSTING_SITE_ALREADY_EXISTS' || !repository.get('default', 'default')) throw error;
            }
            sites = repository.list(projectId);
        }
        return sites.map(({ id, project_id, name, template, template_name, template_status, hostname, domain, deployment, custom_domain_binding, screenshot, last_build, created_at, updated_at }) => ({
            id, project_id, name, template, template_name, template_status, hostname, domain: domain || '',
            custom_domain: formatCustomDomain(hostname, domain), deployment, custom_domain_binding, screenshot, last_build,
            screenshot_url: screenshot?.latest_build?.path || screenshot?.template?.path
                ? `/api/v1/site-hosting/projects/${encodeURIComponent(project_id)}/sites/${encodeURIComponent(id)}/screenshot`
                : '',
            created_at, updated_at
        }));
    }

    function create(projectId, payload = {}) {
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
        return createSite(projectId, name, String(payload.template_id || '').trim());
    }

    function update(projectId, siteId, payload = {}) {
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
        const current = repository.get(projectId, siteId);
        if (!current) {
            const error = new Error('사이트를 찾을 수 없습니다.');
            error.code = 'SITE_HOSTING_SITE_NOT_FOUND';
            error.status = 404;
            throw error;
        }
        const hostname = Object.hasOwn(payload, 'hostname')
            ? normalizeDnsName(payload.hostname, '호스트 이름')
            : String(current.hostname || '');
        const domain = Object.hasOwn(payload, 'domain')
            ? normalizeDnsName(payload.domain, '도메인')
            : String(current.domain || '');
        if (hostname && !domain) {
            const error = new Error('호스트 이름을 사용하려면 도메인도 입력해 주세요.');
            error.code = 'SITE_HOSTING_DOMAIN_REQUIRED';
            error.status = 400;
            throw error;
        }
        if (domain && (domain.split('.').length < 2 || net.isIP(domain))) {
            const error = new Error('도메인은 example.com 형식으로 입력해 주세요.');
            error.code = 'SITE_HOSTING_DOMAIN_INVALID';
            error.status = 400;
            throw error;
        }
        const updated = repository.update(projectId, siteId, { name, hostname, domain, updated_at: now() });
        return {
            id: updated.id,
            project_id: updated.project_id,
            name: updated.name,
            template: updated.template,
            template_name: updated.template_name,
            template_status: updated.template_status,
            hostname: updated.hostname,
            domain: updated.domain || '',
            custom_domain: formatCustomDomain(updated.hostname, updated.domain),
            deployment: updated.deployment,
            custom_domain_binding: updated.custom_domain_binding,
            created_at: updated.created_at,
            updated_at: updated.updated_at
        };
    }

    function formatCustomDomain(hostname, domain) {
        const normalizedDomain = String(domain || '').trim();
        if (!normalizedDomain) return '';
        const normalizedHostname = String(hostname || '').trim();
        return normalizedHostname ? `${normalizedHostname}.${normalizedDomain}` : normalizedDomain;
    }

    function normalizeDnsName(value, label) {
        const raw = String(value || '').trim().replace(/\.$/, '');
        if (!raw) return '';
        const ascii = domainToASCII(raw).toLowerCase();
        const labels = ascii.split('.');
        if (!ascii || ascii.length > 253 || labels.some((part) => part.length < 1 || part.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(part))) {
            const error = new Error(`${label}을(를) 올바른 DNS 이름으로 입력해 주세요.`);
            error.code = label === '도메인' ? 'SITE_HOSTING_DOMAIN_INVALID' : 'SITE_HOSTING_HOSTNAME_INVALID';
            error.status = 400;
            throw error;
        }
        return ascii;
    }

    async function getCloudflareAdapter() {
        const credentials = await getCloudflareDeploymentCredentials();
        if (!credentials?.accessToken || !credentials?.account?.id) {
            const error = new Error('Cloudflare 계정 정보를 확인할 수 없습니다.');
            error.code = 'CLOUDFLARE_ACCOUNT_REQUIRED';
            error.status = 409;
            throw error;
        }
        return {
            credentials,
            adapter: createCloudflareAdapter({ client: createCloudflareClient(credentials.accessToken), fetchImpl: deps.fetchImpl })
        };
    }

    async function listCloudflareZones(projectId, siteId) {
        const site = repository.get(projectId, siteId);
        if (!site) {
            const error = new Error('사이트를 찾을 수 없습니다.');
            error.code = 'SITE_HOSTING_SITE_NOT_FOUND';
            error.status = 404;
            throw error;
        }
        const { credentials, adapter } = await getCloudflareAdapter();
        const accountId = String(credentials.account.id);
        const zones = await adapter.listZones(accountId);
        return zones
            .map((zone) => ({ id: String(zone.id || ''), name: String(zone.name || ''), status: String(zone.status || '') }))
            .filter((zone) => zone.id && zone.name && String(zone.status || '').toLowerCase() === 'active')
            .sort((left, right) => left.name.localeCompare(right.name));
    }

    async function connectCustomDomain(projectId, siteId, payload = {}) {
        const site = repository.get(projectId, siteId);
        if (!site) {
            const error = new Error('사이트를 찾을 수 없습니다.');
            error.code = 'SITE_HOSTING_SITE_NOT_FOUND';
            error.status = 404;
            throw error;
        }
        if (!site.deployment?.worker_name) {
            const error = new Error('먼저 사이트를 Cloudflare에 배포해 주세요.');
            error.code = 'SITE_HOSTING_DEPLOYMENT_REQUIRED';
            error.status = 409;
            throw error;
        }
        const subdomain = normalizeDnsName(payload.hostname, '호스트 이름');
        const { credentials, adapter } = await getCloudflareAdapter();
        const accountId = String(credentials.account.id);
        const zones = await adapter.listZones(accountId);
        const zone = zones.find((item) => String(item?.id || '') === String(payload.zone_id || '')
            && String(item?.status || '').toLowerCase() === 'active');
        if (!zone) {
            const error = new Error('활성 Cloudflare 도메인을 선택해 주세요.');
            error.code = 'CLOUDFLARE_ZONE_NOT_FOUND';
            error.status = 400;
            throw error;
        }
        const domain = String(zone.name || '').toLowerCase();
        const hostname = formatCustomDomain(subdomain, domain);
        try {
            const binding = await adapter.attachWorkerDomain({
                accountId,
                hostname,
                workerName: site.deployment.worker_name,
                zoneId: String(zone.id)
            });
            const connectedAt = now();
            repository.recordCustomDomainBinding(projectId, siteId, {
                id: binding?.id,
                hostname,
                site_hostname: subdomain,
                domain,
                zone_id: zone.id,
                zone_name: zone.name,
                connected_at: connectedAt
            });
            return { id: binding?.id, hostname, site_hostname: subdomain, domain, zone_id: zone.id, zone_name: zone.name, connected_at: connectedAt };
        } catch (cause) {
            const status = Number(cause?.status);
            const error = new Error(status === 401 || status === 403
                ? 'Cloudflare가 도메인 연결 권한을 거부했습니다. OAuth Client에 Zone Read와 Workers Routes Write 권한을 추가한 뒤 다시 연결해 주세요.'
                : String(cause?.message || 'Cloudflare에 도메인을 연결하지 못했습니다.'));
            error.code = status === 401 || status === 403 ? 'CLOUDFLARE_CUSTOM_DOMAIN_PERMISSION_DENIED' : (cause?.code || 'CLOUDFLARE_CUSTOM_DOMAIN_FAILED');
            error.status = cause?.status || 502;
            throw error;
        }
    }

    async function openBuildFolder(projectId, siteId) {
        const site = repository.get(projectId, siteId);
        if (!site) {
            const error = new Error('사이트를 찾을 수 없습니다.');
            error.code = 'SITE_HOSTING_SITE_NOT_FOUND';
            error.status = 404;
            throw error;
        }
        const outputPath = pathApi.join(site.root_path, 'dist');
        if (!fileSystem.existsSync(outputPath) || !fileSystem.statSync(outputPath).isDirectory()) {
            const error = new Error('빌드 결과가 없습니다. 먼저 미리보기를 실행해 주세요.');
            error.code = 'SITE_HOSTING_BUILD_REQUIRED';
            error.status = 409;
            throw error;
        }
        const openError = await (deps.openPath || openPath)(outputPath);
        if (openError) throw new Error(`빌드 폴더를 열지 못했습니다: ${openError}`);
        return { opened: true };
    }

    return {
        listTemplates,
        list,
        create,
        update,
        listCloudflareZones,
        connectCustomDomain,
        getScreenshot: (projectId, siteId) => repository.getScreenshot(projectId, siteId),
        openBuildFolder,
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
            const buildResult = await astroRuntime.build(projectId, siteId);
            const deployed = await cloudflareDeployer.deploy(site, credentials);
            const deployedAt = now();
            repository.recordDeployment(projectId, siteId, { ...deployed, deployed_at: deployedAt });
            return { ...deployed, deployed_at: deployedAt, screenshot: buildResult?.screenshot || null, screenshot_error: buildResult?.screenshot_error || '' };
        }
    };
}

module.exports = { createSiteHostingSiteService };
