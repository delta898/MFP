'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createSiteHostingProjectRepository } = require('../../site-hosting/project-repository');
const { createSiteTemplateCatalog } = require('../../site-hosting/site-template-catalog');
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

test('site service exposes Amade 0.1 family metadata and normalizes its shared menu and publishing contract', async () => {
    const template = {
        id: 'personal-post-list', version: '0.1.0', name: '글 목록형', description: '소개', family_id: 'personal-homepage', family_name: '개인 홈페이지',
        resource: {
            spec_version: '0.1.0',
            family: { family_id: 'personal-homepage', content_types: [{ kind: 'page' }, { kind: 'post', listing_route: '/blog/', detail_route: '/blog/{slug}/' }] },
            template: { author: 'amadejjs', homepage: 'https://www.bloggenius.kr', categories: ['Blog'], tags: ['List'], status: 'active' },
            family_seed_site: { displayName: '기본 사이트', navigation: [{ id: 'posts', label: '글', path: '/blog/' }] }
        }
    };
    let created;
    const service = createSiteHostingSiteService({
        projectRepository: { get: (id) => id === 'project-1' ? { id } : null },
        templates: { list: async () => [{ id: template.id, family_id: template.family_id, family_name: template.family_name }], get: () => template, prepare: async () => {} },
        repository: { create: (_projectId, site) => { created = site; return { ...site, project_id: 'project-1', template: { id: template.id, version: template.version } }; } },
        createId: () => 'site-1'
    });
    const [listed] = await service.listTemplates();
    assert.equal(listed.family_name, '개인 홈페이지');
    assert.deepEqual(listed.tags, ['List']);
    assert.deepEqual(listed.customization[0].default, [{ id: 'posts', label: '글', href: '/blog/' }]);
    await service.create('project-1', {
        name: '내 사이트', template_id: template.id,
        customization: { navigation: [{ label: '이야기', href: '/stories/' }], publishing: { post_list_navigation_index: 0 } }
    });
    assert.deepEqual(created.customization, {
        navigation: [{ id: 'posts', label: '이야기', href: '/stories/' }],
        publishing: { listing_route: '/stories/', detail_route: '/stories/{slug}/', post_list_navigation_index: 0 }
    });
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
                    return { url: 'http://127.0.0.1:43210/' };
                },
                stopDraftPreview: async (_projectId, id) => { calls.push(['stop', id]); return { stopped: true }; }
            }
        });
        const preview = await service.previewDraft('project-1', {
            template_id: 'minimal-homepage', customization: {}
        });
        assert.deepEqual(preview, { id: 'draft_preview-one', url: 'http://127.0.0.1:43210/' });
        assert.equal((await service.list('project-1')).length, 0);
        assert.equal(fs.existsSync(draftRoot), true);
        assert.deepEqual(await service.stopDraftPreview('project-1', preview.id), { stopped: true });
        assert.equal(fs.existsSync(draftRoot), false);
        assert.deepEqual(calls, [['start', preview.id, '미리보기'], ['stop', preview.id]]);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
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

test('site service materializes the default starter site only for the default project', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-hosting-default-site-'));
    try {
        const projectRepository = createSiteHostingProjectRepository({ fs, path, workspaceDir });
        projectRepository.create({ id: 'default', name: '내 사이트' });
        projectRepository.create({ id: 'other-project', name: '다른 프로젝트' });
        const service = createSiteHostingSiteService({ fs, path, workspaceDir, templates: localTemplates() });

        assert.deepEqual((await service.list('default')).map(({ id, name, template_name }) => ({ id, name, template_name })), [
            { id: 'default', name: '나의 첫 사이트', template_name: '간단한 홈페이지' }
        ]);
        assert.deepEqual((await service.list('default')).map(({ id }) => id), ['default']);
        assert.deepEqual(await service.list('other-project'), []);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('site service seeds the default project from the first active family template when the Amade catalog has no legacy starter', async () => {
    const template = {
        id: 'personal-post-list', version: '0.1.0', name: '글 목록형', family_id: 'personal-homepage',
        resource: { spec_version: '0.1.0', family: { content_types: [{ kind: 'post', listing_route: '/blog/', detail_route: '/blog/{slug}/' }] }, template: { status: 'active' }, family_seed_site: { navigation: [{ label: '글', path: '/blog/' }] } }
    };
    const created = [];
    const fakeTemplates = {
        list: async () => [{ id: template.id }],
        get: (id) => id === template.id ? template : null,
        prepare: async () => template
    };
    const service = createSiteHostingSiteService({
        projectRepository: { get: (id) => id === 'default' ? { id } : null },
        templates: fakeTemplates,
        repository: {
            list: () => [],
            create: (_projectId, site) => {
                created.push(site);
                return { ...site, project_id: 'default', template: { id: template.id, version: template.version } };
            },
            get: () => null
        },
        createId: () => 'default'
    });

    await service.list('default');
    assert.equal(created[0].template_id, 'personal-post-list');
    assert.deepEqual(created[0].customization.navigation, [{ label: '글', href: '/blog/' }]);
    assert.deepEqual(created[0].customization.publishing, {
        listing_route: '/blog/', detail_route: '/blog/{slug}/', post_list_navigation_index: 0
    });
});

test('site draft stores its first image block as the optional cover frontmatter field', async () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-hosting-cover-frontmatter-'));
    try {
        const siteRoot = path.join(workspaceDir, 'site');
        fs.mkdirSync(path.join(siteRoot, 'site-data'), { recursive: true });
        const template = {
            resource: {
                spec_version: '0.1.0',
                family: { content_contract_version: '0.7.1', content_types: [{ kind: 'post', source: 'posts/{slug}/index.md', listing_route: '/blog/', detail_route: '/blog/{slug}/' }] },
                template: { compatibility: { contract: { version: '0.7.1' } } }
            }
        };
        const pngBytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
        const manuscript = '# 테스트 글\n\n도입 문단\n\n[[IMAGE_1\ntitle: 본문 첫 이미지\nprompt: 바다\n]]\n\n[[IMAGE_0\ntitle: 두번째 이미지\nprompt: 하늘\n]]\n\n본문';
        const service = createSiteHostingSiteService({
            fs, path, workspaceDir,
            repository: { get: () => ({ root_path: siteRoot, template_status: 'available', template: { id: 'template-1' } }) },
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
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});
