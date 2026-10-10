'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createSiteHostingProjectRepository } = require('../../site-hosting/project-repository');
const { createSiteHostingSiteRepository } = require('../../site-hosting/site-repository');
const { createSiteTemplateCatalog } = require('../../site-hosting/site-template-catalog');
const { SITE_HOSTING_CONTRACT_VERSION } = require('../../site-hosting/bloggenius-compatibility');
const { createSiteHostingSiteService } = require('./site-hosting-site.service');

function localTemplates() {
    return createSiteTemplateCatalog({ fs, path });
}

test('site service lists templates and creates a named site without Cloudflare details', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-hosting-site-service-'));
    try {
        const projectRepository = createSiteHostingProjectRepository({ fs, path, workspaceDir });
        projectRepository.create({ id: 'project-1', name: '개인 사이트' });
        const service = createSiteHostingSiteService({
            fs, path, workspaceDir, projectRepository, templates: localTemplates(),
            createId: () => 'site-1', now: () => '2026-10-02T00:00:00.000Z'
        });
        assert.equal((await service.listTemplates())[0].id, 'minimal-homepage');
        const created = await service.create('project-1', { name: '  개인 블로그  ', template_id: 'minimal-homepage' });
        assert.equal(created.name, '개인 블로그');
        assert.equal(created.hostname, '');
        assert.deepEqual(created.template, { id: 'minimal-homepage', version: '0.1.0' });
        const listed = await service.list('project-1');
        assert.deepEqual(listed.map(({ id, name }) => ({ id, name })), [{ id: 'site-1', name: '개인 블로그' }]);
        assert.match(listed[0].screenshot_url, /sites\/site-1\/screenshot$/);
        assert.equal(service.getScreenshot('project-1', 'site-1').contentType, 'image/svg+xml');
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('Blog Beta recognizes an installed Digital Garden as a posting target without a cached template package', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-hosting-dg-package-cache-'));
    const templatesRoot = path.join(workspaceDir, 'template-cache');
    const templateRoot = path.join(templatesRoot, 'digital-garden-explorer-left');
    const vaultRoot = path.join(workspaceDir, 'vault');
    try {
        const projectRepository = createSiteHostingProjectRepository({ fs, path, workspaceDir });
        projectRepository.create({ id: 'project-1', name: '개인 사이트' });
        fs.mkdirSync(templateRoot, { recursive: true });
        fs.mkdirSync(path.join(vaultRoot), { recursive: true });
        const resource = {
            spec_version: SITE_HOSTING_CONTRACT_VERSION,
            family: { content_contract_version: SITE_HOSTING_CONTRACT_VERSION, content_types: [] },
            template: {
                compatibility: { contract: { version: SITE_HOSTING_CONTRACT_VERSION } },
                setup_inputs: [
                    { id: 'knowledge_collection_root', type: 'directory', purpose: 'knowledge_collection' },
                    { id: 'publication_filter', type: 'frontmatter_match', purpose: 'publication_filter' }
                ]
            }
        };
        fs.writeFileSync(path.join(templateRoot, 'template.json'), `${JSON.stringify({
            id: 'digital-garden-explorer-left', version: '0.1.3', name: '디지털 가든',
            source_directory: 'package/0.1.3/astro', family_data_directory: 'package/0.1.3/site-data',
            family_id: 'digital-garden', package_ready: false, resource
        })}\n`);

        const siteRoot = path.join(workspaceDir, 'site-hosting', 'sites', 'dg1');
        fs.mkdirSync(path.join(siteRoot, '.bloggenius'), { recursive: true });
        fs.mkdirSync(path.join(siteRoot, 'template', 'astro'), { recursive: true });
        fs.writeFileSync(path.join(siteRoot, 'template', 'astro', 'package.json'), '{}');
        fs.writeFileSync(path.join(siteRoot, '.bloggenius', 'site.json'), `${JSON.stringify({
            schema_version: 1, id: 'dg1', project_id: 'project-1', name: 'DG1',
            template: { id: 'digital-garden-explorer-left', version: '0.1.3', family_id: 'digital-garden' },
            setup_inputs: { knowledge_collection_root: vaultRoot, publication_filter: { mode: 'all' } }
        })}\n`);

        const service = createSiteHostingSiteService({
            fs, path, workspaceDir, projectRepository,
            templates: createSiteTemplateCatalog({ fs, path, templatesRoot })
        });
        const [site] = await service.list('project-1');
        assert.equal(site.template_status, 'available');
        assert.deepEqual(site.posting_target, { eligible: true, kind: 'vault' });
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('site service validates the project, name, and selected template', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-hosting-site-validation-'));
    try {
        const projectRepository = createSiteHostingProjectRepository({ fs, path, workspaceDir });
        projectRepository.create({ id: 'project-1', name: '개인 사이트' });
        const service = createSiteHostingSiteService({ fs, path, workspaceDir, projectRepository, templates: localTemplates(), createId: () => 'site-1' });
        await assert.rejects(service.create('missing', { name: '사이트', template_id: 'minimal-homepage' }), { code: 'SITE_HOSTING_PROJECT_NOT_FOUND' });
        await assert.rejects(service.create('project-1', { name: ' ', template_id: 'minimal-homepage' }), { code: 'SITE_HOSTING_SITE_NAME_REQUIRED' });
        await assert.rejects(service.create('project-1', { name: '사이트', template_id: 'missing' }), { code: 'SITE_HOSTING_TEMPLATE_REQUIRED' });
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('site deletion confirms a read-only plan, archives local files, and leaves no active site', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-hosting-delete-'));
    try {
        const projectRepository = createSiteHostingProjectRepository({ fs, path, workspaceDir });
        projectRepository.create({ id: 'project-1', name: '개인 사이트' });
        const templates = localTemplates();
        const repository = createSiteHostingSiteRepository({ fs, path, projectRepository, templates });
        let id = 0;
        const service = createSiteHostingSiteService({ fs, path, workspaceDir, projectRepository, repository, templates, createId: () => `plan-${++id}`, now: () => '2026-10-06T12:00:00.000Z' });
        repository.create('project-1', { id: 'site-1', name: '삭제 대상', template_id: 'minimal-homepage' });
        const plan = await service.prepareSiteDeletion('project-1', 'site-1');
        assert.equal(plan.ready, true);
        assert.deepEqual(plan.steps.map((step) => step.kind), ['archive']);
        assert.equal(repository.list('project-1').length, 1, 'planning must not mutate the site');
        await assert.rejects(service.deleteSite('project-1', 'site-1', { confirmed: true }), { code: 'SITE_HOSTING_DELETE_CONFIRMATION_REQUIRED' });
        const result = await service.deleteSite('project-1', 'site-1', { confirmed: true, plan_id: plan.id });
        assert.equal(result.completed, true);
        assert.equal(fs.existsSync(path.join(result.archived_path, '.bloggenius', 'site.json')), true);
        assert.deepEqual(repository.list('project-1'), []);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('site deletion refuses to plan removal when Worker ownership cannot be verified', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-hosting-delete-ownership-'));
    try {
        const projectRepository = createSiteHostingProjectRepository({ fs, path, workspaceDir });
        projectRepository.create({ id: 'project-1', name: '개인 사이트' });
        const templates = localTemplates();
        const repository = createSiteHostingSiteRepository({ fs, path, projectRepository, templates });
        const service = createSiteHostingSiteService({ fs, path, workspaceDir, projectRepository, repository, templates, createId: () => 'plan-1' });
        repository.create('project-1', { id: 'site-1', name: '삭제 대상', template_id: 'minimal-homepage' });
        repository.recordDeployment('project-1', 'site-1', { worker_name: 'bg-site-1', url: 'https://bg-site-1.workers.dev', managed_by_app: false });
        await assert.rejects(service.prepareSiteDeletion('project-1', 'site-1'), { code: 'SITE_HOSTING_WORKER_OWNERSHIP_UNVERIFIED' });
        assert.equal(repository.get('project-1', 'site-1').name, '삭제 대상');
        assert.equal(fs.existsSync(path.join(workspaceDir, 'site-hosting', 'sites', 'site-1')), true);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('site deletion detaches the recorded custom domain before deleting its verified Worker', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-hosting-delete-remote-'));
    try {
        const projectRepository = createSiteHostingProjectRepository({ fs, path, workspaceDir });
        projectRepository.create({ id: 'project-1', name: '개인 사이트' });
        const templates = localTemplates();
        const repository = createSiteHostingSiteRepository({ fs, path, projectRepository, templates });
        repository.create('project-1', { id: 'site-1', name: '연결된 사이트', template_id: 'minimal-homepage' });
        repository.recordDeployment('project-1', 'site-1', {
            worker_name: 'bg-site-1', url: 'https://bg-site-1.workers.dev', deployment_id: 'deployment-1', version_id: 'version-1',
            worker_account_id: 'account-1', worker_created_on: '2026-10-06T00:00:00Z', managed_by_app: true, deployed_at: '2026-10-06T00:01:00Z'
        });
        repository.recordCustomDomainBinding('project-1', 'site-1', {
            id: 'binding-1', hostname: 'blog.example.com', site_hostname: 'blog', domain: 'example.com', zone_id: 'zone-1', zone_name: 'example.com', connected_at: '2026-10-06T00:02:00Z'
        });
        let bindingPresent = true;
        let dnsPresent = true;
        let workerPresent = true;
        const calls = [];
        const binding = { id: 'binding-1', hostname: 'blog.example.com', service: 'bg-site-1', zone_id: 'zone-1', environment: 'production' };
        const adapter = {
            listZones: async () => [{ id: 'zone-1', name: 'example.com', status: 'active' }],
            listWorkerDomains: async ({ hostname } = {}) => bindingPresent && (!hostname || hostname === binding.hostname) ? [{ ...binding }] : [],
            listDnsRecords: async () => dnsPresent ? [{ id: 'dns-1', type: 'AAAA', name: 'blog.example.com', content: '100::', proxied: true, ttl: 1 }] : [],
            listWorkerScripts: async () => workerPresent ? [{ id: 'bg-site-1', created_on: '2026-10-06T00:00:00Z' }] : [],
            listDeployments: async () => [{ id: 'deployment-1', versions: [{ version_id: 'version-1', percentage: 100 }] }],
            detachWorkerDomain: async () => { calls.push('domain'); bindingPresent = false; dnsPresent = false; },
            deleteWorker: async () => { calls.push('worker'); workerPresent = false; }
        };
        let id = 0;
        const service = createSiteHostingSiteService({
            fs, path, workspaceDir, projectRepository, repository, templates,
            getCloudflareDeploymentCredentials: async () => ({ accessToken: 'test-token', account: { id: 'account-1' } }),
            createCloudflareSdkAdapter: () => adapter,
            createId: () => `plan-${++id}`,
            now: () => '2026-10-06T12:00:00.000Z',
            sleep: async () => {}
        });
        const plan = await service.prepareSiteDeletion('project-1', 'site-1');
        assert.deepEqual(plan.steps.map((step) => step.kind), ['custom_domain', 'worker', 'archive']);
        const result = await service.deleteSite('project-1', 'site-1', { confirmed: true, plan_id: plan.id });
        assert.deepEqual(calls, ['domain', 'worker']);
        assert.equal(bindingPresent, false);
        assert.equal(dnsPresent, false);
        assert.equal(workerPresent, false);
        assert.equal(fs.existsSync(path.join(result.archived_path, '.bloggenius', 'site.json')), true);
        assert.deepEqual(repository.list('project-1'), []);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('site service exposes Amade 0.1 family metadata and normalizes its shared menu and publishing contract', async () => {
    const template = {
        id: 'personal-post-list', version: '0.1.0', name: '글 목록형', description: '소개', family_id: 'personal-homepage', family_name: '개인 홈페이지',
        resource: {
            spec_version: SITE_HOSTING_CONTRACT_VERSION,
            family: { family_id: 'personal-homepage', site_profile: { fields: {
                logo: { type: 'public-url-path', required: false },
                seoDescription: { type: 'string', required: false, maxLength: 300 },
                shareImage: { type: 'public-url-path', required: false },
                favicon: { type: 'public-url-path', required: false },
                searchEngineIndexing: { type: 'boolean', required: false, default: true }
            } }, content_types: [{ kind: 'page' }, { kind: 'post', listing_route: '/blog/', detail_route: '/blog/{slug}/' }] },
            template: { author: 'amadejjs', homepage: 'https://www.bloggenius.kr', categories: ['Blog'], tags: ['List'], status: 'active' },
            family_seed_site: { displayName: '기본 사이트', navigation: [{ id: 'posts', label: '글', path: '/blog/' }] }
        }
    };
    let created;
    const service = createSiteHostingSiteService({
        projectRepository: { get: (id) => id === 'project-1' ? { id } : null },
        templates: { list: async () => [{ id: template.id, version: template.version, family_id: template.family_id, family_name: template.family_name }], get: () => template, prepare: async () => {} },
        repository: { create: (_projectId, site) => { created = site; return { ...site, project_id: 'project-1', template: { id: template.id, version: template.version } }; } },
        createId: () => 'site-1'
    });
    const [listed] = await service.listTemplates();
    assert.equal(listed.family_name, '개인 홈페이지');
    assert.equal(listed.version, '0.1.0');
    assert.equal(listed.author, 'amadejjs');
    assert.equal(listed.homepage_url, 'https://www.bloggenius.kr/');
    assert.deepEqual(listed.tags, ['List']);
    assert.deepEqual(listed.customization[0].default, [{ id: 'posts', label: '글', href: '/blog/' }]);
    await service.create('project-1', {
        name: '내 사이트', template_id: template.id,
        customization: {
            site_description: '작은 시도와 배움을 기록합니다.', search_engine_indexing: false,
            logo: 'data:image/png;base64,iVBORw0KGgo=', share_image: 'data:image/png;base64,iVBORw0KGgo=', favicon: 'data:image/png;base64,iVBORw0KGgo=',
            navigation: [{ label: '이야기', href: '/stories/' }], publishing: { post_list_navigation_index: 0 }
        }
    });
    assert.deepEqual(created.customization, {
        site_description: '작은 시도와 배움을 기록합니다.',
        search_engine_indexing: false,
        logo: { extension: 'png', content: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]) },
        share_image: { extension: 'png', content: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]) },
        favicon: { extension: 'png', content: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]) },
        navigation: [{ id: 'posts', label: '이야기', href: '/stories/' }],
        publishing: { listing_route: '/stories/', detail_route: '/stories/{slug}/', post_list_navigation_index: 0 }
    });
    await service.create('project-1', { name: '기본 노출', template_id: template.id, customization: {} });
    assert.equal(created.customization.search_engine_indexing, true);
    await assert.rejects(service.create('project-1', {
        name: '긴 설명', template_id: template.id, customization: { site_description: 'x'.repeat(301) }
    }), { code: 'SITE_HOSTING_SITE_DESCRIPTION_INVALID' });
    await service.create('project-1', {
        name: '내 사이트', template_id: template.id,
        customization: { navigation: [{ label: '외부', href: 'https://example.com/' }] }
    });
});

test('site service builds a temporary customized preview without adding a Site and cleans it on close', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-hosting-preview-draft-service-'));
    let draftRoot = '';
    try {
        const projectRepository = createSiteHostingProjectRepository({ fs, path, workspaceDir });
        projectRepository.create({ id: 'project-1', name: '개인 사이트' });
        const calls = [];
        const service = createSiteHostingSiteService({
            fs, path, workspaceDir, projectRepository, templates: localTemplates(), createId: () => 'preview-one',
            astroRuntime: {
                startDraftPreview: async (draft) => {
                    calls.push(['start', draft.id, draft.name]);
                    draftRoot = draft.root_path;
                    return {
                        url: 'http://127.0.0.1:43210/',
                        knowledge_collection: { published_note_count: 2, excluded_note_count: 1 }
                    };
                },
                stopDraftPreview: async (_projectId, id) => { calls.push(['stop', id]); return { stopped: true }; }
            }
        });
        const preview = await service.previewDraft('project-1', {
            template_id: 'minimal-homepage', customization: {}
        });
        assert.deepEqual(preview, {
            id: 'draft_preview-one', url: 'http://127.0.0.1:43210/',
            knowledge_collection: { published_note_count: 2, excluded_note_count: 1 }
        });
        assert.equal((await service.list('project-1')).length, 0);
        assert.equal(fs.existsSync(draftRoot), true);
        assert.deepEqual(await service.stopDraftPreview('project-1', preview.id), { stopped: true });
        assert.equal(fs.existsSync(draftRoot), false);
        assert.deepEqual(calls, [['start', preview.id, '미리보기'], ['stop', preview.id]]);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('site settings preserve the existing template, rebuild locally, and refresh the screenshot', async () => {
    const template = {
        id: 'personal-homepage-test', version: '1.0.0', name: 'Personal',
        resource: {
            spec_version: SITE_HOSTING_CONTRACT_VERSION,
            family: { site_profile: { fields: {
                seoDescription: { type: 'string', required: false, maxLength: 300 },
                searchEngineIndexing: { type: 'boolean', required: false, default: true }
            } }, content_types: [] },
            template: { setup_inputs: [] },
            family_seed_site: { displayName: 'Starter', navigation: [{ id: 'home', label: 'Home', path: '/' }] }
        }
    };
    const current = {
        id: 'site-1', project_id: 'project-1', name: 'Before', template: { id: template.id, version: '1.0.0' },
        customization: { navigation: [{ id: 'home', label: 'Home', href: '/' }] }, setup_inputs: {}
    };
    const repositoryCalls = [];
    const runtimeCalls = [];
    const service = createSiteHostingSiteService({
        projectRepository: { get: (id) => id === 'project-1' ? { id } : null },
        templates: { get: (id) => id === template.id ? template : null, prepare: async () => {} },
        repository: {
            get: () => ({ ...current }),
            updateSettings: (_projectId, _siteId, patch) => { repositoryCalls.push(patch); Object.assign(current, patch, { name: patch.name }); return { ...current }; }
        },
        astroRuntime: { build: async (...args) => { runtimeCalls.push(args); return { screenshot: { build_id: 'build-2' } }; } },
        now: () => '2026-10-06T00:00:00.000Z'
    });
    assert.deepEqual(service.getSettings('project-1', 'site-1'), {
        id: 'site-1', name: 'Before', template_id: template.id,
        customization: { navigation: [{ id: 'home', label: 'Home', href: '/' }] }, setup_inputs: {}
    });
    const result = await service.applySettings('project-1', 'site-1', {
        name: 'After', template_id: template.id,
        customization: { site_description: 'Changed', search_engine_indexing: false, navigation: [{ id: 'home', label: 'Start', href: '/' }] },
        setup_inputs: {}
    });
    assert.equal(result.build_error, '');
    assert.deepEqual(result.screenshot, { build_id: 'build-2' });
    assert.deepEqual(runtimeCalls, [['project-1', 'site-1']]);
    assert.equal(repositoryCalls[0].name, 'After');
    await assert.rejects(service.applySettings('project-1', 'site-1', { name: 'After', template_id: 'other', customization: {}, setup_inputs: {} }), {
        code: 'SITE_HOSTING_TEMPLATE_CHANGE_NOT_ALLOWED'
    });
});

test('site creation accepts editable internal menu paths and binds publishing to the selected menu', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-hosting-menu-contract-'));
    try {
        const template = {
            id: 'studio-journal', version: '1.3.0', name: 'Studio Journal',
            resource: { site_hosting: {
                customization: { fields: [{ key: 'navigation', type: 'navigation', default: [
                    { label: 'Home', href: '/' }, { label: 'Blog', href: '/blog/' }
                ] }] },
                pages: { schema_version: 1, mode: 'static_placeholders', max_items: 5, route_pattern: '/{slug}/', target: { file: 'src/site-config.json', path: 'pages' } },
                publishing: { schema_version: 2, format: 'markdown', routes: { listing: '/blog/', detail: '/blog/{slug}/' } }
            } }
        };
        let createdSite;
        const service = createSiteHostingSiteService({
            fs, path, workspaceDir,
            projectRepository: { get: (id) => id === 'project-1' ? { id } : null },
            templates: { get: (id) => id === template.id ? template : null, prepare: async () => {} },
            repository: { create: (_projectId, input) => { createdSite = input; return { ...input, project_id: 'project-1', template: { id: template.id, version: template.version } }; } },
            createId: () => 'site-1'
        });
        await service.create('project-1', {
            name: 'Stories', template_id: template.id,
            customization: {
                navigation: [{ label: 'Home', href: '/' }, { label: 'Stories', href: '/stories/' }],
                publishing: { post_list_navigation_index: 1 }
            }
        });
        assert.deepEqual(createdSite.customization.navigation, [
            { label: 'Home', href: '/' }, { label: 'Stories', href: '/stories/' }
        ]);
        assert.deepEqual(createdSite.customization.publishing, {
            listing_route: '/stories/', detail_route: '/stories/{slug}/', post_list_navigation_index: 1
        });
        for (const href of ['https://example.com/articles/', '/about/team/', '../about/team', '/blog/?draft=1', '/blog/#section']) {
            await service.create('project-1', {
                name: 'Valid destination', template_id: template.id,
                customization: {
                    navigation: [{ label: 'Home', href: '/' }, { label: 'Posts', href: '/stories/' }, { label: 'Destination', href }],
                    publishing: { post_list_navigation_index: 1 }
                }
            });
            assert.equal(createdSite.customization.navigation[2].href, href);
        }
        await assert.rejects(service.create('project-1', {
            name: 'External post list', template_id: template.id,
            customization: { navigation: [{ label: 'Home', href: '/' }, { label: 'External', href: 'https://example.com/' }], publishing: { post_list_navigation_index: 1 } }
        }), { code: 'SITE_HOSTING_POST_LIST_MENU_INVALID' });
        await service.create('project-1', {
            name: 'Internal custom page', template_id: template.id,
            customization: {
                navigation: [{ label: 'Home', href: '/' }, { label: 'Posts', href: '/blog/' }, { label: 'Guide', href: '/guide/' }, { label: 'Guide duplicate', href: '/guide/' }, { label: 'External', href: 'https://example.com/' }],
                publishing: { post_list_navigation_index: 1 }
            }
        });
        assert.equal(createdSite.customization.custom_pages.length, 1);
        assert.equal(createdSite.customization.custom_pages[0].slug, 'guide');
        for (const href of ['javascript:alert(1)', 'https://[bad-host/', '/bad%zz/']) {
            await assert.rejects(service.create('project-1', {
                name: 'Malformed', template_id: template.id,
                customization: { navigation: [{ label: 'Home', href: '/' }, { label: 'Malformed', href }], publishing: { post_list_navigation_index: 1 } }
            }), { code: 'SITE_HOSTING_MENU_PATH_INVALID' }, href);
        }
        await assert.rejects(service.create('project-1', {
            name: 'Unsafe', template_id: template.id,
            customization: { navigation: [{ label: 'Home', href: '/', target: '_blank' }, { label: 'Blog', href: '/blog/' }] }
        }), { code: 'SITE_HOSTING_NAVIGATION_INVALID' });
        await assert.rejects(service.create('project-1', {
            name: 'Unsafe', template_id: template.id,
            customization: { navigation: [{ label: 'Home', href: '/' }, { label: 'Blog', href: '/blog/' }], unknown: 'ignored?' }
        }), { code: 'SITE_HOSTING_NAVIGATION_INVALID' });
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('site service leaves empty projects empty instead of materializing a starter Site', async () => {
    let templateListCalls = 0;
    let createCalls = 0;
    const templates = {
        list: async () => { templateListCalls += 1; return [{ id: 'personal-post-list' }]; },
        get: () => ({ id: 'personal-post-list' }),
        prepare: async () => { throw new Error('empty project listing must not prepare templates'); }
    };
    const service = createSiteHostingSiteService({
        projectRepository: { get: (id) => ({ id }) },
        templates,
        repository: {
            list: () => [],
            create: () => { createCalls += 1; throw new Error('empty project listing must not create a Site'); },
            get: () => null
        }
    });

    assert.deepEqual(await service.list('default'), []);
    assert.deepEqual(await service.list('other-project'), []);
    assert.equal(templateListCalls, 0);
    assert.equal(createCalls, 0);
});

test('site creation requires and stores a declared frontmatter publication match without treating an empty rule as all', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-hosting-frontmatter-setup-'));
    const vaultRoot = path.join(workspaceDir, 'vault');
    fs.mkdirSync(vaultRoot);
    try {
        const template = {
            id: 'digital-garden-explorer-left', version: '0.1.0',
            resource: {
                spec_version: SITE_HOSTING_CONTRACT_VERSION,
                family: { content_contract_version: SITE_HOSTING_CONTRACT_VERSION, site_profile: { fields: {
                    displayName: { type: 'string', required: true },
                    logo: { type: 'public-url-path', required: false },
                    seoDescription: { type: 'string', required: false, maxLength: 300 },
                    shareImage: { type: 'public-url-path', required: false },
                    favicon: { type: 'public-url-path', required: false },
                    searchEngineIndexing: { type: 'boolean', required: false, default: true }
                } } },
                template: {
                    compatibility: { contract: { version: SITE_HOSTING_CONTRACT_VERSION } },
                    setup_inputs: [
                        { id: 'knowledge_collection_root', type: 'directory', purpose: 'knowledge_collection', label: 'Obsidian Vault root', required: true },
                        { id: 'publication_filter', type: 'frontmatter_match', purpose: 'publication_filter', label: '공개 노트 기준', required: true }
                    ]
                },
                family_seed_site: { navigation: [{ id: 'home', label: '홈', path: '/' }] }
            }
        };
        let created;
        const service = createSiteHostingSiteService({
            fs, path, workspaceDir,
            projectRepository: { get: (id) => id === 'project-1' ? { id } : null },
            templates: { get: () => template, prepare: async () => {} },
            repository: { create: (_projectId, site) => { created = site; return site; } },
            createId: () => 'site-1'
        });
        await assert.rejects(service.create('project-1', {
            name: '정원', template_id: template.id,
            setup_inputs: { knowledge_collection_root: vaultRoot }
        }), { code: 'SITE_HOSTING_SETUP_INPUT_REQUIRED' });
        await service.create('project-1', {
            name: '정원', template_id: template.id,
            customization: { search_engine_indexing: true },
            setup_inputs: {
                knowledge_collection_root: vaultRoot,
                publication_filter: { field: 'is_public', value: 'true' }
            }
        });
        assert.deepEqual(created.setup_inputs, {
            knowledge_collection_root: fs.realpathSync(vaultRoot),
            publication_filter: { field: 'is_public', value: 'true' }
        });
        assert.equal(created.customization.search_engine_indexing, true);
        await assert.rejects(service.create('project-1', {
            name: '잘못된 기준', template_id: template.id,
            setup_inputs: {
                knowledge_collection_root: vaultRoot,
                publication_filter: { field: 'is_public', value: '' }
            }
        }), { code: 'SITE_HOSTING_SETUP_INPUT_REQUIRED' });
        await service.create('project-1', {
            name: '전체 노트', template_id: template.id,
            setup_inputs: {
                knowledge_collection_root: vaultRoot,
                publication_filter: { mode: 'all' }
            }
        });
        assert.deepEqual(created.setup_inputs.publication_filter, { mode: 'all' });
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('site setup directory picker returns the validated Vault root selected by the native dialog', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-hosting-vault-picker-'));
    const vaultRoot = path.join(workspaceDir, 'vault');
    fs.mkdirSync(vaultRoot);
    try {
        const template = {
            id: 'digital-garden-explorer-left',
            resource: { template: { setup_inputs: [
                { id: 'knowledge_collection_root', type: 'directory', purpose: 'knowledge_collection', label: 'Obsidian Vault root', required: true },
                { id: 'publication_filter', type: 'frontmatter_match', purpose: 'publication_filter', label: '공개 노트 기준', required: true }
            ] } }
        };
        const service = createSiteHostingSiteService({
            fs, path, workspaceDir,
            templates: { get: (id) => id === template.id ? template : null, prepare: async () => {} },
            dialog: { showOpenDialog: async (options) => {
                assert.deepEqual(options.properties, ['openDirectory']);
                assert.equal(options.defaultPath, os.homedir());
                return { canceled: false, filePaths: [vaultRoot] };
            } }
        });

        assert.deepEqual(await service.selectSetupDirectory(template.id, 'knowledge_collection_root'), {
            cancelled: false, path: fs.realpathSync(vaultRoot), name: 'vault'
        });
        await assert.rejects(service.selectSetupDirectory(template.id, 'unknown'), { code: 'SITE_HOSTING_SETUP_INPUT_UNSUPPORTED' });
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('site draft stores its first image block as the optional cover frontmatter field', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-hosting-cover-frontmatter-'));
    try {
        const siteRoot = path.join(workspaceDir, 'site');
        fs.mkdirSync(path.join(siteRoot, 'site-data'), { recursive: true });
        const template = {
            resource: {
                spec_version: SITE_HOSTING_CONTRACT_VERSION,
                family: { content_contract_version: SITE_HOSTING_CONTRACT_VERSION, content_types: [{ kind: 'post', source: 'posts/{slug}/index.md', listing_route: '/blog/', detail_route: '/blog/{slug}/' }] },
                template: { compatibility: { contract: { version: SITE_HOSTING_CONTRACT_VERSION } } }
            }
        };
        const pngBytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
        const manuscript = '# 테스트 글\n\n도입 문단\n\n[[IMAGE_1\ntitle: 본문 첫 이미지\nprompt: 바다\n]]\n\n[[IMAGE_0\ntitle: 두번째 이미지\nprompt: 하늘\n]]\n\n본문';
        const service = createSiteHostingSiteService({
            fs, path, workspaceDir,
            repository: { get: () => ({
                root_path: siteRoot,
                template_status: 'available',
                template: { id: 'template-1' },
                customization: {
                    navigation: [{ label: '블로그', href: '/blog/' }],
                    publishing: { listing_route: '/blog/', detail_route: '/blog/{slug}/', post_list_navigation_index: 0 }
                }
            }) },
            templates: { get: () => template },
            createId: () => 'abc12345',
            now: () => '2026-10-05T12:30:00.000Z',
            manuscriptDraftService: { buildPublishPayload: () => ({ selectedFiles: [
                { name: 'contents.md', textContent: manuscript },
                { name: '00_first.png', base64Data: `data:image/png;base64,${pngBytes.toString('base64')}` },
                { name: '01_second.png', base64Data: `data:image/png;base64,${pngBytes.toString('base64')}` }
            ] }) }
        });
        const result = await service.postMarkdown('project-1', 'site-1', { draftId: 'draft-1', revision: 1, postStatus: 'draft' });
        assert.equal(result.publication, 'none');
        const postRoot = path.join(siteRoot, 'site-data', 'posts', result.post_id);
        const markdown = fs.readFileSync(path.join(postRoot, 'index.md'), 'utf8');
        assert.match(markdown, /^cover: "\.\/images\/image-1\.png"$/mu);
        assert.match(markdown, /^cover_alt: "본문 첫 이미지"$/mu);
        assert.match(markdown, /!\[본문 첫 이미지\]\(\.\/images\/image-1\.png\)/u);
        assert.equal(fs.existsSync(path.join(postRoot, 'images', 'image-0.png')), true);
        assert.equal(fs.existsSync(path.join(postRoot, 'images', 'image-1.png')), true);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('site public publishing falls back to a draft when an image prompt has no generated image', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-hosting-unresolved-image-draft-'));
    try {
        const siteRoot = path.join(workspaceDir, 'site');
        fs.mkdirSync(path.join(siteRoot, 'site-data'), { recursive: true });
        const template = {
            resource: {
                spec_version: SITE_HOSTING_CONTRACT_VERSION,
                family: { content_contract_version: SITE_HOSTING_CONTRACT_VERSION, content_types: [{ kind: 'post', source: 'posts/{slug}/index.md', listing_route: '/blog/', detail_route: '/blog/{slug}/' }] },
                template: { compatibility: { contract: { version: SITE_HOSTING_CONTRACT_VERSION } } }
            }
        };
        const manuscript = '# 테스트 글\n\n도입 문단\n\n[[IMAGE_0\ntitle: 본문 이미지\nprompt: 생성하지 못한 이미지\n]]\n\n본문';
        const deployCalls = [];
        const service = createSiteHostingSiteService({
            fs, path, workspaceDir,
            repository: { get: () => ({
                root_path: siteRoot,
                template_status: 'available',
                template: { id: 'template-1' },
                customization: { navigation: [{ label: '블로그', href: '/blog/' }], publishing: { listing_route: '/blog/', detail_route: '/blog/{slug}/', post_list_navigation_index: 0 } }
            }) },
            templates: { get: () => template },
            cloudflareDeployer: { deploy: async () => { deployCalls.push('deploy'); return { url: 'https://example.com/' }; } },
            getCloudflareDeploymentCredentials: async () => ({ accessToken: 'test', account: { id: 'a'.repeat(32) } }),
            createId: () => 'abc12345',
            now: () => '2026-10-09T12:30:00.000Z',
            manuscriptDraftService: { buildPublishPayload: () => ({ selectedFiles: [
                { name: 'contents.md', textContent: manuscript }
            ] }) }
        });

        const result = await service.postMarkdown('project-1', 'site-1', { draftId: 'draft-1', revision: 1, postStatus: 'publish' });

        assert.equal(result.postStatus, 'draft');
        assert.equal(result.publication, 'none');
        assert.equal(result.forcedDraft, true);
        assert.match(result.warning, /이미지 1번/);
        assert.deepEqual(deployCalls, []);
        const savedMarkdown = fs.readFileSync(path.join(siteRoot, 'site-data', 'posts', result.post_id, 'index.md'), 'utf8');
        assert.match(savedMarkdown, /^editorial_status: "draft"$/mu);
        assert.match(savedMarkdown, /^publication: "none"$/mu);
        assert.doesNotMatch(savedMarkdown, /^published_at:/mu);
        assert.match(savedMarkdown, /\[\[IMAGE_0\ntitle: 본문 이미지\nprompt: 생성하지 못한 이미지\n\]\]/u);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('site service opens the built output folder and requests preview when it is missing', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-hosting-open-build-folder-'));
    try {
        const projectRepository = createSiteHostingProjectRepository({ fs, path, workspaceDir });
        projectRepository.create({ id: 'project-1', name: '개인 사이트' });
        const opened = [];
        const service = createSiteHostingSiteService({
            fs, path, workspaceDir, projectRepository, templates: localTemplates(), createId: () => 'site-1',
            openPath: async (targetPath) => { opened.push(targetPath); return ''; }
        });
        await service.create('project-1', { name: '개인 블로그', template_id: 'minimal-homepage' });
        await assert.rejects(service.openBuildFolder('project-1', 'site-1'), { code: 'SITE_HOSTING_BUILD_REQUIRED', status: 409 });
        const distPath = path.join(workspaceDir, 'site-hosting', 'sites', 'site-1', 'dist');
        fs.mkdirSync(distPath);
        assert.deepEqual(await service.openBuildFolder('project-1', 'site-1'), { opened: true });
        assert.deepEqual(opened, [distPath]);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('site deploy rebuilds the site and saves the Cloudflare workers.dev result', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-hosting-site-deploy-'));
    try {
        const projectRepository = createSiteHostingProjectRepository({ fs, path, workspaceDir });
        projectRepository.create({ id: 'project-1', name: '개인 사이트' });
        const calls = [];
        const service = createSiteHostingSiteService({
            fs, path, workspaceDir, projectRepository, templates: localTemplates(),
            createId: () => 'site-1', now: () => '2026-10-02T00:00:00.000Z',
            astroRuntime: { build: async () => { calls.push('build'); return { screenshot: { path: '.bloggenius/build-build1.jpg', build_id: 'build1' } }; } },
            getCloudflareDeploymentCredentials: async () => ({ accessToken: 'secret', account: { id: 'a'.repeat(32) } }),
            cloudflareDeployer: { deploy: async (_site, credentials) => {
                calls.push('deploy');
                assert.equal(credentials.account.id, 'a'.repeat(32));
                return { worker_name: 'bg-site-1', url: 'https://bg-site-1.example.workers.dev/', deployment_id: 'deployment-1', version_id: 'version-1' };
            } }
        });
        await service.create('project-1', { name: '개인 블로그', template_id: 'minimal-homepage' });
        const result = await service.deploy('project-1', 'site-1');
        assert.deepEqual(calls, ['build', 'deploy']);
        assert.equal(result.url, 'https://bg-site-1.example.workers.dev/');
        assert.equal(result.screenshot.build_id, 'build1');
        assert.equal((await service.list('project-1'))[0].deployment.worker_name, 'bg-site-1');
        assert.deepEqual((await service.list('project-1'))[0].cloudflare_account, { id: 'a'.repeat(32), name: '이름 없는 계정' });
        assert.deepEqual(result.cloudflare_account, { id: 'a'.repeat(32), name: '이름 없는 계정' });
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('site deployment validates and saves an explicit Cloudflare account before building, then reuses the binding', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-hosting-account-selection-'));
    try {
        const projectRepository = createSiteHostingProjectRepository({ fs, path, workspaceDir });
        projectRepository.create({ id: 'project-1', name: '개인 사이트' });
        const repository = createSiteHostingSiteRepository({ fs, path, projectRepository, templates: localTemplates() });
        const calls = [];
        const service = createSiteHostingSiteService({
            fs, path, workspaceDir, projectRepository, repository, templates: localTemplates(), createId: () => 'site-1',
            astroRuntime: { build: async () => { calls.push('build'); return {}; } },
            getCloudflareDeploymentCredentials: async (accountId) => {
                calls.push(['credentials', accountId]);
                if (!accountId) throw Object.assign(new Error('select an account'), { apiCode: 'CLOUDFLARE_ACCOUNT_SELECTION_REQUIRED' });
                if (accountId !== 'account-second') throw Object.assign(new Error('not accessible'), { apiCode: 'CLOUDFLARE_ACCOUNT_NOT_ACCESSIBLE' });
                return { accessToken: 'test-token', account: { id: accountId, name: 'Second account' } };
            },
            cloudflareDeployer: { deploy: async (site, credentials) => {
                calls.push(['deploy', site.cloudflare_account.id]);
                assert.equal(credentials.account.id, 'account-second');
                return { worker_name: 'bg-site-1', url: 'https://bg-site-1.example.workers.dev/', worker_account_id: credentials.account.id };
            } }
        });
        await service.create('project-1', { name: '계정 선택 사이트', template_id: 'minimal-homepage' });
        await assert.rejects(service.deploy('project-1', 'site-1'), { apiCode: 'CLOUDFLARE_ACCOUNT_SELECTION_REQUIRED' });
        await assert.rejects(service.deploy('project-1', 'site-1', { account_id: 'account-first' }), { apiCode: 'CLOUDFLARE_ACCOUNT_NOT_ACCESSIBLE' });
        assert.deepEqual(calls, [['credentials', ''], ['credentials', 'account-first']]);
        assert.deepEqual((await service.list('project-1'))[0].cloudflare_account, undefined);

        await service.deploy('project-1', 'site-1', { account_id: 'account-second' });
        assert.deepEqual(calls.slice(2), [['credentials', 'account-second'], 'build', ['deploy', 'account-second']]);
        const site = (await service.list('project-1'))[0];
        assert.deepEqual(site.cloudflare_account, { id: 'account-second', name: 'Second account' });
        assert.equal(site.deployment.worker_account_id, 'account-second');
        await service.deploy('project-1', 'site-1');
        assert.deepEqual(calls.slice(5), [['credentials', 'account-second'], 'build', ['deploy', 'account-second']]);
        await assert.rejects(service.deploy('project-1', 'site-1', { account_id: 'account-first' }), { code: 'SITE_HOSTING_CLOUDFLARE_ACCOUNT_CHANGE_UNSUPPORTED' });
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('site deployment keeps the selected Cloudflare account if the local build fails', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-hosting-account-build-failure-'));
    try {
        const projectRepository = createSiteHostingProjectRepository({ fs, path, workspaceDir });
        projectRepository.create({ id: 'project-1', name: '개인 사이트' });
        const repository = createSiteHostingSiteRepository({ fs, path, projectRepository, templates: localTemplates() });
        const service = createSiteHostingSiteService({
            fs, path, workspaceDir, projectRepository, repository, templates: localTemplates(), createId: () => 'site-1',
            astroRuntime: { build: async () => { throw new Error('local build failed'); } },
            getCloudflareDeploymentCredentials: async (accountId) => ({ accessToken: 'test-token', account: { id: accountId, name: 'Selected account' } }),
            cloudflareDeployer: { deploy: async () => assert.fail('Cloudflare must not be called after a failed build') }
        });
        await service.create('project-1', { name: '계정 선택 사이트', template_id: 'minimal-homepage' });
        await assert.rejects(service.deploy('project-1', 'site-1', { account_id: 'selected-account' }), /local build failed/u);
        const site = (await service.list('project-1'))[0];
        assert.deepEqual(site.cloudflare_account, { id: 'selected-account', name: 'Selected account' });
        assert.equal(site.deployment, undefined);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('Worker disconnect requires app ownership and removes only a verified standalone Worker', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-hosting-worker-disconnect-'));
    try {
        const projectRepository = createSiteHostingProjectRepository({ fs, path, workspaceDir });
        projectRepository.create({ id: 'project-1', name: '개인 사이트' });
        const templates = localTemplates();
        const repository = createSiteHostingSiteRepository({ fs, path, projectRepository, templates });
        let workerPresent = true;
        let deletionCalls = 0;
        const adapter = {
            listWorkerScripts: async () => workerPresent ? [{ id: 'bg-site-1', created_on: '2026-10-06T00:00:00Z' }] : [],
            listWorkerDomains: async () => [],
            listDeployments: async () => [{ id: 'deployment-1', versions: [{ version_id: 'version-1', percentage: 100 }] }],
            deleteWorker: async ({ workerName }) => {
                assert.equal(workerName, 'bg-site-1');
                deletionCalls += 1;
                workerPresent = false;
            }
        };
        const service = createSiteHostingSiteService({
            fs, path, workspaceDir, projectRepository, repository, templates, createId: () => 'site-1',
            now: () => '2026-10-06T00:00:00.000Z', astroRuntime: { build: async () => ({}) },
            cloudflareDeployer: { deploy: async () => ({
                worker_name: 'bg-site-1', url: 'https://bg-site-1.example.workers.dev/', deployment_id: 'deployment-1',
                version_id: 'version-1', worker_account_id: 'a'.repeat(32), worker_created_on: '2026-10-06T00:00:00Z', managed_by_app: true
            }) },
            getCloudflareDeploymentCredentials: async () => ({ accessToken: 'test-token', account: { id: 'a'.repeat(32) } }),
            createCloudflareSdkClient: () => ({}), createCloudflareSdkAdapter: () => adapter
        });
        await service.create('project-1', { name: '내 사이트', template_id: 'minimal-homepage' });
        await service.deploy('project-1', 'site-1');
        await assert.rejects(service.disconnectWorker('project-1', 'site-1'), { code: 'SITE_HOSTING_WORKER_DISCONNECT_CONFIRMATION_REQUIRED' });
        repository.recordDeployment('project-1', 'site-1', {
            ...repository.get('project-1', 'site-1').deployment, managed_by_app: false, deployed_at: '2026-10-06T00:00:00Z'
        });
        await assert.rejects(service.disconnectWorker('project-1', 'site-1', { confirmed: true }), { code: 'SITE_HOSTING_WORKER_OWNERSHIP_UNVERIFIED' });
        assert.equal(deletionCalls, 0);
        repository.recordDeployment('project-1', 'site-1', {
            ...repository.get('project-1', 'site-1').deployment, managed_by_app: true, deployed_at: '2026-10-06T00:00:00Z'
        });
        const result = await service.disconnectWorker('project-1', 'site-1', { confirmed: true });
        assert.deepEqual(result, { worker_name: 'bg-site-1', deployment: null, disconnected: true });
        assert.equal(deletionCalls, 1);
        const [site] = await service.list('project-1');
        assert.equal(site.deployment, undefined);
        assert.equal(fs.existsSync(path.join(workspaceDir, 'site-hosting', 'sites', 'site-1', '.bloggenius', 'site.json')), true, 'Worker disconnect must retain local Site files');
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('Worker disconnect blocks custom domains, unverified current deployments, and remote bindings before deletion', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-hosting-worker-disconnect-preflight-'));
    try {
        const projectRepository = createSiteHostingProjectRepository({ fs, path, workspaceDir });
        projectRepository.create({ id: 'project-1', name: '개인 사이트' });
        const templates = localTemplates();
        const repository = createSiteHostingSiteRepository({ fs, path, projectRepository, templates });
        let bindings = [];
        let activeVersionId = 'version-1';
        let connectedAccountId = 'a'.repeat(32);
        let deletionCalls = 0;
        const adapter = {
            listWorkerScripts: async () => [{ id: 'bg-site-1', created_on: '2026-10-06T00:00:00Z' }],
            listWorkerDomains: async () => bindings,
            listDeployments: async () => [{ id: 'deployment-1', versions: [{ version_id: activeVersionId, percentage: 100 }] }],
            deleteWorker: async () => { deletionCalls += 1; }
        };
        const service = createSiteHostingSiteService({
            fs, path, workspaceDir, projectRepository, repository, templates, createId: () => 'site-1',
            astroRuntime: { build: async () => ({}) },
            cloudflareDeployer: { deploy: async () => ({
                worker_name: 'bg-site-1', url: 'https://bg-site-1.example.workers.dev/', deployment_id: 'deployment-1',
                version_id: 'version-1', worker_account_id: 'a'.repeat(32), worker_created_on: '2026-10-06T00:00:00Z', managed_by_app: true
            }) },
            getCloudflareDeploymentCredentials: async () => ({ accessToken: 'test-token', account: { id: connectedAccountId } }),
            createCloudflareSdkClient: () => ({}), createCloudflareSdkAdapter: () => adapter
        });
        await service.create('project-1', { name: '내 사이트', template_id: 'minimal-homepage' });
        await service.deploy('project-1', 'site-1');
        await repository.recordCustomDomainBinding('project-1', 'site-1', {
            id: 'binding-local', hostname: 'blog.example.com', zone_id: 'zone-1', zone_name: 'example.com'
        });
        await assert.rejects(service.disconnectWorker('project-1', 'site-1', { confirmed: true }), { code: 'SITE_HOSTING_CUSTOM_DOMAIN_MUST_BE_DISCONNECTED' });
        await repository.clearCustomDomainBinding('project-1', 'site-1');
        connectedAccountId = 'b'.repeat(32);
        await assert.rejects(service.disconnectWorker('project-1', 'site-1', { confirmed: true }), { code: 'SITE_HOSTING_WORKER_ACCOUNT_CHANGED' });
        connectedAccountId = 'a'.repeat(32);
        activeVersionId = 'external-version';
        await assert.rejects(service.disconnectWorker('project-1', 'site-1', { confirmed: true }), { code: 'SITE_HOSTING_WORKER_DEPLOYMENT_CHANGED' });
        activeVersionId = 'version-1';
        bindings = [{ id: 'binding-remote', hostname: 'other.example.com', service: 'bg-site-1', zone_id: 'zone-2' }];
        await assert.rejects(service.disconnectWorker('project-1', 'site-1', { confirmed: true }), { code: 'SITE_HOSTING_CUSTOM_DOMAIN_MUST_BE_DISCONNECTED' });
        assert.equal(deletionCalls, 0);
        assert.equal((await service.list('project-1'))[0].deployment.worker_name, 'bg-site-1');
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('custom domain disconnect verifies the Cloudflare binding and DNS before clearing only local binding state', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-hosting-domain-disconnect-'));
    try {
        const projectRepository = createSiteHostingProjectRepository({ fs, path, workspaceDir });
        projectRepository.create({ id: 'project-1', name: '개인 사이트' });
        let binding = null;
        let dnsRecords = [];
        let detachCalls = 0;
        const requestedAccountIds = [];
        const adapter = {
            listZones: async () => [{ id: 'zone-1', name: 'example.com', status: 'active' }],
            listWorkerDomains: async () => binding ? [{ ...binding }] : [],
            listDnsRecords: async () => dnsRecords.map((record) => ({ ...record })),
            attachWorkerDomain: async ({ hostname, workerName, zoneId }) => {
                binding = { id: 'binding-1', hostname, service: workerName, zone_id: zoneId };
                dnsRecords = [{ id: 'dns-1', type: 'AAAA', name: hostname, content: '100::', proxied: true, ttl: 1 }];
                return { ...binding };
            },
            detachWorkerDomain: async ({ bindingId }) => {
                detachCalls += 1;
                assert.equal(bindingId, 'binding-1');
                binding = null;
                dnsRecords = [];
            }
        };
        const service = createSiteHostingSiteService({
            fs, path, workspaceDir, projectRepository, templates: localTemplates(),
            createId: () => 'site-1', now: () => '2026-10-06T00:00:00.000Z',
            astroRuntime: { build: async () => ({}) },
            cloudflareDeployer: { deploy: async () => ({ worker_name: 'bg-site-1', url: 'https://bg-site-1.example.workers.dev/' }) },
            getCloudflareDeploymentCredentials: async (accountId) => {
                requestedAccountIds.push(accountId);
                return { accessToken: 'test-token', account: { id: accountId || 'a'.repeat(32) } };
            },
            createCloudflareSdkClient: () => ({}), createCloudflareSdkAdapter: () => adapter,
            sleep: async () => {}
        });
        await service.create('project-1', { name: '내 사이트', template_id: 'minimal-homepage' });
        await service.deploy('project-1', 'site-1');
        requestedAccountIds.length = 0;
        assert.deepEqual(await service.listCloudflareZones('project-1', 'site-1'), [{ id: 'zone-1', name: 'example.com', status: 'active' }]);
        await service.connectCustomDomain('project-1', 'site-1', { zone_id: 'zone-1', hostname: 'blog' });
        await assert.rejects(service.disconnectCustomDomain('project-1', 'site-1'), { code: 'SITE_HOSTING_CUSTOM_DOMAIN_CONFIRMATION_REQUIRED' });
        assert.ok(binding, 'a missing confirmation must not call Cloudflare');
        binding.service = 'unexpected-worker';
        await assert.rejects(service.disconnectCustomDomain('project-1', 'site-1', { confirmed: true }), { code: 'SITE_HOSTING_CUSTOM_DOMAIN_PREFLIGHT_FAILED' });
        assert.equal(detachCalls, 0, 'a binding mismatch must stop before the destructive API call');
        binding.service = 'bg-site-1';

        const result = await service.disconnectCustomDomain('project-1', 'site-1', { confirmed: true });
        assert.deepEqual(result, { hostname: 'blog.example.com', custom_domain_binding: null, disconnected: true });
        assert.equal(binding, null);
        assert.deepEqual(dnsRecords, []);
        const [site] = await service.list('project-1');
        assert.equal(site.custom_domain_binding, null);
        assert.equal(site.deployment.worker_name, 'bg-site-1');
        assert.equal(site.hostname, 'blog');
        assert.equal(site.domain, 'example.com');
        assert.ok(requestedAccountIds.length >= 4);
        assert.ok(requestedAccountIds.every((accountId) => accountId === 'a'.repeat(32)), 'zone lookup, connect, and disconnect must stay pinned to the site deployment account');
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('custom domain disconnect keeps local binding when Cloudflare leaves the managed DNS record behind', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-hosting-domain-disconnect-dns-'));
    try {
        const projectRepository = createSiteHostingProjectRepository({ fs, path, workspaceDir });
        projectRepository.create({ id: 'project-1', name: '개인 사이트' });
        let binding = null;
        const record = { id: 'dns-1', type: 'AAAA', name: 'blog.example.com', content: '100::', proxied: true, ttl: 1 };
        let dnsRecords = [];
        const adapter = {
            listZones: async () => [{ id: 'zone-1', name: 'example.com', status: 'active' }],
            listWorkerDomains: async () => binding ? [{ ...binding }] : [],
            listDnsRecords: async () => dnsRecords.map((item) => ({ ...item })),
            attachWorkerDomain: async ({ hostname, workerName, zoneId }) => {
                binding = { id: 'binding-1', hostname, service: workerName, zone_id: zoneId };
                dnsRecords = [{ ...record }];
                return { ...binding };
            },
            detachWorkerDomain: async () => { binding = null; }
        };
        const service = createSiteHostingSiteService({
            fs, path, workspaceDir, projectRepository, templates: localTemplates(), createId: () => 'site-1',
            astroRuntime: { build: async () => ({}) },
            cloudflareDeployer: { deploy: async () => ({ worker_name: 'bg-site-1', url: 'https://bg-site-1.example.workers.dev/' }) },
            getCloudflareDeploymentCredentials: async () => ({ accessToken: 'test-token', account: { id: 'a'.repeat(32) } }),
            createCloudflareSdkClient: () => ({}), createCloudflareSdkAdapter: () => adapter,
            sleep: async () => {}
        });
        await service.create('project-1', { name: '내 사이트', template_id: 'minimal-homepage' });
        await service.deploy('project-1', 'site-1');
        await service.connectCustomDomain('project-1', 'site-1', { zone_id: 'zone-1', hostname: 'blog' });
        await assert.rejects(service.disconnectCustomDomain('project-1', 'site-1', { confirmed: true }), {
            code: 'SITE_HOSTING_CUSTOM_DOMAIN_DNS_REMAINS', status: 409
        });
        assert.equal(binding, null, 'the API detach can succeed while DNS verification fails');
        assert.equal((await service.list('project-1'))[0].custom_domain_binding.hostname, 'blog.example.com', 'keep the local record for safe recovery/inspection');
        dnsRecords = [];
        const recovered = await service.disconnectCustomDomain('project-1', 'site-1', { confirmed: true });
        assert.equal(recovered.already_detached, true, 'a retry should reconcile local metadata without repeating Cloudflare mutation');
        assert.equal((await service.list('project-1'))[0].custom_domain_binding, null);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});
