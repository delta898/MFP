'use strict';

const crypto = require('node:crypto');
const { domainToASCII } = require('node:url');
const net = require('node:net');
const { createSiteHostingProjectRepository } = require('../../site-hosting/project-repository');
const { createSiteHostingSiteRepository } = require('../../site-hosting/site-repository');
const { normalizeMenuDestination, normalizeMenuLabel: validateMenuLabel, normalizeNavigationItems, internalPathSegment } = require('../../site-hosting/navigation-contract');
const { createGitHubSiteTemplateCatalog } = require('../../site-hosting/github-site-template-catalog');
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
    const templates = deps.templates || createGitHubSiteTemplateCatalog({
        fs: deps.fs,
        path: deps.path,
        cacheRoot: deps.templateCacheRoot || pathApi.join(String(deps.workspaceDir || ''), 'site-hosting', 'template-cache'),
        catalogUrl: deps.templateCatalogUrl,
        environment: deps.runtimeEnvironment,
        fetchImpl: deps.fetchImpl
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
        fetchImpl: deps.fetchImpl,
        logger: deps.Logger
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

    function createSite(projectId, name, templateId, id = createId(), customization = {}) {
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
        const created = repository.create(project.id, { id, name, template_id: templateId, customization, created_at: timestamp, updated_at: timestamp });
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

    async function listTemplates() {
        const items = await templates.list();
        return items.map((template) => {
            const resource = templates.get(template.id)?.resource;
            const siteHosting = resource?.site_hosting;
            const fields = siteHosting?.customization?.fields;
            const customization = Array.isArray(fields) ? fields
                .filter((field) => ['site_name', 'logo', 'navigation'].includes(field?.key))
                .map((field) => ({ key: field.key, type: field.type, label: String(field.label || ''), default: field.default })) : [];
            const publishing = normalizePublishingCapability(siteHosting?.publishing);
            return {
                ...template,
                author: String(resource?.author || resource?.maintainer || template.author || '').trim().slice(0, 100),
                homepage_url: normalizeHomepageUrl(resource?.homepage || template.homepage_url),
                customization,
                pages: normalizePageCapability(siteHosting?.pages),
                ...(publishing ? { publishing } : {}),
                preview_url: template.preview_url || `/api/v1/site-hosting/templates/${encodeURIComponent(template.id)}/preview`
            };
        });
    }

    async function list(projectId) {
        let sites = repository.list(projectId);
        if (projectId === 'default' && !sites.some((site) => site.id === 'default')) {
            try {
                await templates.prepare?.('astro-homepage');
                const defaultTemplateId = templates.get('astro-homepage') ? 'astro-homepage' : 'minimal-homepage';
                createSite('default', '나의 첫 사이트', defaultTemplateId, 'default');
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

    async function create(projectId, payload = {}) {
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)
            || Object.keys(payload).some((key) => !['name', 'template_id', 'customization'].includes(key))) {
            throw siteInputError('사이트 생성 요청에 허용되지 않은 항목이 포함되어 있습니다.', 'SITE_HOSTING_CREATE_INPUT_INVALID');
        }
        if (!projectRepository.get(projectId)) {
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
        await templates.prepare?.(templateId);
        const customization = normalizeSiteCustomization(templates.get(templateId), payload.customization || {});
        return createSite(projectId, name, templateId, createId(), customization);
    }

    function normalizeSiteCustomization(template, input) {
        if (!input || typeof input !== 'object' || Array.isArray(input)) {
            throw siteInputError('사이트 설정 형식이 올바르지 않습니다.', 'SITE_HOSTING_NAVIGATION_INVALID');
        }
        const siteHosting = template?.resource?.site_hosting;
        const fields = siteHosting?.customization?.fields;
        if (!Array.isArray(fields)) return {};
        const output = {};
        const declared = new Map(fields.map((field) => [field.key, field]));
        const allowedInputKeys = new Set([...declared.keys(), 'publishing']);
        if (Object.keys(input).some((key) => !allowedInputKeys.has(key))) {
            throw siteInputError('사이트 설정에 허용되지 않은 항목이 포함되어 있습니다.', 'SITE_HOSTING_NAVIGATION_INVALID');
        }
        if (input.publishing && (typeof input.publishing !== 'object' || Array.isArray(input.publishing)
            || Object.keys(input.publishing).some((key) => key !== 'post_list_navigation_index'))) {
            throw siteInputError('글 목록 메뉴 설정에 허용되지 않은 항목이 포함되어 있습니다.', 'SITE_HOSTING_POST_LIST_MENU_INVALID');
        }
        const pageCapability = normalizePageCapability(siteHosting.pages);
        const publishing = normalizePublishingCapability(siteHosting.publishing);
        const postListIndex = input.publishing?.post_list_navigation_index;
        if (declared.has('navigation')) {
            const defaults = Array.isArray(declared.get('navigation').default) ? declared.get('navigation').default : [];
            const requestedNavigation = Array.isArray(input.navigation) ? input.navigation : defaults;
            const maxMenuItems = 50;
            if (!requestedNavigation.length || requestedNavigation.length > maxMenuItems) {
                throw siteInputError('메뉴는 1개 이상, 템플릿이 지원하는 개수 이내로 입력해 주세요.', 'SITE_HOSTING_NAVIGATION_INVALID');
            }
            const normalizedInput = requestedNavigation.map((entry, index) => {
                if (!entry || typeof entry !== 'object' || Array.isArray(entry)
                    || Object.keys(entry).some((key) => key !== 'label' && key !== 'href')) {
                    throw siteInputError('메뉴에는 이름과 주소만 지정할 수 있습니다.', 'SITE_HOSTING_NAVIGATION_INVALID');
                }
                const label = validateMenuLabel(entry?.label);
                const fallbackHref = defaults[index]?.href || `/${encodeURIComponent(createPageSlug(label))}/`;
                return { label, href: String(entry?.href || '').trim() || fallbackHref };
            });
            let navigation;
            try { navigation = normalizeNavigationItems(normalizedInput, { maxItems: maxMenuItems }); }
            catch (cause) { throw siteInputError(cause.message, cause.code || 'SITE_HOSTING_NAVIGATION_INVALID'); }
            output.navigation = navigation;
            const defaultPaths = new Set(defaults.map((entry) => normalizeMenuDestination(entry.href)));
            const publishingPath = postListIndex !== undefined ? navigation[postListIndex]?.href : '';
            const reserved = new Set(pageCapability?.reserved_slugs || []);
            if (pageCapability) {
                const customPages = navigation
                    .filter(({ href }) => !defaultPaths.has(href) && href !== publishingPath && internalPathSegment(href))
                    .map(({ label, href }) => ({ label, slug: internalPathSegment(href) }))
                    .filter(({ slug }) => !reserved.has(slug.toLocaleLowerCase('en-US')))
                    .slice(0, pageCapability.max_items);
                if (customPages.length) output.custom_pages = customPages;
            }
        }
        if (postListIndex !== undefined && !publishing) {
            throw siteInputError('이 템플릿은 글 목록 메뉴 연결을 지원하지 않습니다.', 'SITE_HOSTING_PUBLISHING_UNSUPPORTED');
        }
        if (publishing) {
            const navigation = output.navigation;
            if (!declared.has('navigation') || !Array.isArray(navigation)
                || !Number.isInteger(postListIndex) || postListIndex < 0 || postListIndex >= navigation.length) {
                throw siteInputError('글 목록에 연결할 메뉴를 선택해 주세요.', 'SITE_HOSTING_POST_LIST_MENU_REQUIRED');
            }
            const listingRoute = navigation[postListIndex].href;
            const detailRoute = publishing.routes.detail.replace(publishing.routes.listing, listingRoute);
            output.publishing = {
                listing_route: listingRoute,
                detail_route: detailRoute,
                post_list_navigation_index: postListIndex
            };
        }
        if (declared.has('logo') && input.logo) output.logo = normalizeLogo(input.logo);
        return output;
    }

    function normalizePublishingCapability(value) {
        if (!value || value.schema_version !== 2 || value.format !== 'markdown'
            || !value.routes || typeof value.routes.listing !== 'string' || typeof value.routes.detail !== 'string') return null;
        const listing = value.routes.listing;
        const detail = value.routes.detail;
        if (!internalPathSegment(listing) || detail !== `${listing}{slug}/`) return null;
        return { routes: { listing, detail } };
    }

    function normalizePageCapability(value) {
        if (!value || value.schema_version !== 1 || value.mode !== 'static_placeholders'
            || !Number.isInteger(value.max_items) || value.max_items < 1 || value.max_items > 20
            || value.route_pattern !== '/{slug}/' || !value.target || typeof value.target.file !== 'string'
            || !/^src\/[A-Za-z0-9._/-]+\.json$/.test(value.target.file) || value.target.file.split('/').includes('..')
            || typeof value.target.path !== 'string' || !/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(value.target.path)) return null;
        return {
            max_items: value.max_items,
            route_pattern: value.route_pattern,
            target: { file: value.target.file, path: value.target.path },
            reserved_slugs: ['blog', 'index', ...(Array.isArray(value.reserved_slugs) ? value.reserved_slugs.map((slug) => createPageSlug(slug)).filter(Boolean) : [])]
        };
    }

    function createPageSlug(value) {
        return String(value || '').normalize('NFKC').trim().toLocaleLowerCase('en-US')
            .replace(/[\s_]+/g, '-')
            .replace(/[^\p{L}\p{N}-]/gu, '')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 48)
            .replace(/-$/g, '');
    }

    function normalizeMenuLabel(value) {
        try { return validateMenuLabel(value); }
        catch (cause) { throw siteInputError('메뉴 이름은 1~30자 이내로 입력해 주세요.', cause.code || 'SITE_HOSTING_NAVIGATION_INVALID'); }
    }

    function normalizeLogo(value) {
        const match = String(value || '').match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
        if (!match) throw siteInputError('로고는 PNG, JPG 또는 WebP 이미지로 선택해 주세요.', 'SITE_HOSTING_LOGO_INVALID');
        const bytes = Buffer.from(match[2], 'base64');
        if (!bytes.length || bytes.length > 1024 * 1024) throw siteInputError('로고 이미지는 1MB 이하로 선택해 주세요.', 'SITE_HOSTING_LOGO_TOO_LARGE');
        const signatures = { png: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), jpeg: Buffer.from([0xff, 0xd8, 0xff]), webp: Buffer.from('RIFF') };
        if (!bytes.subarray(0, signatures[match[1]].length).equals(signatures[match[1]])
            || (match[1] === 'webp' && bytes.toString('ascii', 8, 12) !== 'WEBP')) {
            throw siteInputError('이미지 형식이 올바르지 않습니다.', 'SITE_HOSTING_LOGO_INVALID');
        }
        return { extension: match[1] === 'jpeg' ? 'jpg' : match[1], content: bytes };
    }

    function siteInputError(message, code) {
        const error = new Error(message);
        error.code = code;
        error.status = 400;
        return error;
    }

    function normalizeHomepageUrl(value) {
        try {
            const parsed = new URL(String(value || '').trim());
            return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.href : '';
        } catch (_error) {
            return '';
        }
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
        getTemplatePreview: (id) => templates.getPreview?.(String(id || '').trim()) || null,
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
        async deploy(projectId, siteId, context = {}) {
            const site = repository.get(projectId, siteId);
            if (!site) {
                const error = new Error('사이트를 찾을 수 없습니다.');
                error.code = 'SITE_HOSTING_SITE_NOT_FOUND';
                error.status = 404;
                throw error;
            }
            const credentials = await getCloudflareDeploymentCredentials();
            const buildResult = await astroRuntime.build(projectId, siteId);
            const deployed = await cloudflareDeployer.deploy(site, credentials, context);
            const deployedAt = now();
            repository.recordDeployment(projectId, siteId, { ...deployed, deployed_at: deployedAt });
            return { ...deployed, deployed_at: deployedAt, screenshot: buildResult?.screenshot || null, screenshot_error: buildResult?.screenshot_error || '' };
        }
    };
}

module.exports = { createSiteHostingSiteService };
