'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createSiteHostingProjectRepository } = require('./project-repository');
const { createSiteHostingSiteRepository } = require('./site-repository');
const { SITE_HOSTING_CONTRACT_VERSION } = require('../../../applications/site-hosting/domain/compatibility');
const { createFixtureSiteTemplateCatalog } = require('../../../../test/fixtures/site-hosting/template-catalog');

test('site repository materializes selected Astro files and keeps BlogGenius metadata separate', () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-hosting-site-'));
    try {
        const projectRepository = createSiteHostingProjectRepository({ fs, path, workspaceDir });
        projectRepository.create({ id: 'project-1', name: '개인 사이트' });
        const repository = createSiteHostingSiteRepository({
            fs, path, projectRepository, templates: createFixtureSiteTemplateCatalog({ fs, path })
        });
        const site = repository.create('project-1', {
            id: 'site-1', name: '개인 블로그', template_id: 'minimal-homepage',
            created_at: '2026-10-02T00:00:00.000Z', updated_at: '2026-10-02T00:00:00.000Z'
        });
        const siteRoot = path.join(workspaceDir, 'site-hosting', 'sites', 'site-1');
        const metadata = JSON.parse(fs.readFileSync(path.join(siteRoot, '.bloggenius', 'site.json'), 'utf8'));

        assert.equal(fs.existsSync(path.join(siteRoot, 'src', 'pages', 'index.astro')), true);
        assert.equal(metadata.id, 'site-1');
        assert.equal(metadata.name, '개인 블로그');
        assert.deepEqual(metadata.template, { id: 'minimal-homepage', version: '0.1.0' });
        assert.equal(site.project_id, 'project-1');
        assert.equal(site.template_name, '간단한 홈페이지');
        assert.deepEqual(repository.list('project-1').map(({ id, name }) => ({ id, name })), [{ id: 'site-1', name: '개인 블로그' }]);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('imported Astro settings update the declared shared config and keep project data intact', () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-hosting-import-settings-'));
    try {
        const projectRepository = createSiteHostingProjectRepository({ fs, path, workspaceDir });
        projectRepository.create({ id: 'project-1', name: '개인 사이트' });
        const sourceRoot = path.join(workspaceDir, 'source');
        fs.mkdirSync(path.join(sourceRoot, 'site-data'), { recursive: true });
        fs.mkdirSync(path.join(sourceRoot, 'public'), { recursive: true });
        fs.writeFileSync(path.join(sourceRoot, 'package.json'), '{"dependencies":{"astro":"^7.3.0"},"scripts":{"build":"astro build"}}');
        const originalProjectData = { tagline: '프로젝트 소유 문구', about: { paragraphs: ['유지되어야 하는 내용'] } };
        fs.writeFileSync(path.join(sourceRoot, 'site-data', 'site.json'), JSON.stringify({
            displayName: '원래 이름', seoDescription: '원래 설명', searchEngineIndexing: true,
            navigation: [{ id: 'home', label: '홈', path: '/' }, { id: 'posts', label: '기록', path: '/blog/' }],
            logo: '', shareImage: '', favicon: '', project: originalProjectData
        }));
        const integration = {
            descriptor_valid: true, settings_valid: true,
            capabilities: { site_identity: true, navigation: true, logo: true, favicon: true, share_image: true }
        };
        const repository = createSiteHostingSiteRepository({ fs, path, projectRepository, templates: createFixtureSiteTemplateCatalog({ fs, path }) });
        const imported = repository.importAstroProject('project-1', {
            id: 'site-1', name: '새 이름', archive_name: 'site.zip', integration,
            customization: {
                site_description: '새 설명', search_engine_indexing: false,
                navigation: [{ id: 'home', label: '처음', href: '/' }, { id: 'posts', label: '소식', href: '/news/' }],
                logo: { extension: 'png', content: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]) }
            }
        }, sourceRoot);
        const configPath = path.join(imported.root_path, 'site-data', 'site.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        assert.equal(config.displayName, '새 이름');
        assert.equal(config.seoDescription, '새 설명');
        assert.equal(config.searchEngineIndexing, false);
        assert.deepEqual(config.navigation, [
            { id: 'home', label: '처음', path: '/' }, { id: 'posts', label: '소식', path: '/news/' }
        ]);
        assert.deepEqual(config.project, originalProjectData);
        assert.equal(config.logo, '/bloggenius-logo.png');
        assert.equal(fs.existsSync(path.join(imported.root_path, 'public', 'bloggenius-logo.png')), true);
        assert.deepEqual(imported.integration.capabilities, integration.capabilities);

        repository.updateSettings('project-1', 'site-1', {
            name: '세 번째 이름', customization: { site_description: '세 번째 설명', search_engine_indexing: true,
                navigation: [{ id: 'home', label: '홈', href: '/' }, { id: 'posts', label: '뉴스', href: '/news/' }] }
        });
        const updated = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        assert.equal(updated.displayName, '세 번째 이름');
        assert.equal(updated.seoDescription, '세 번째 설명');
        assert.equal(updated.searchEngineIndexing, true);
        assert.equal(updated.navigation[1].id, 'posts');
        assert.equal(updated.navigation[1].path, '/news/');
        assert.deepEqual(updated.project, originalProjectData);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('site repository rejects unsafe and duplicate IDs without replacing an existing site', () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-hosting-site-id-'));
    try {
        const projectRepository = createSiteHostingProjectRepository({ fs, path, workspaceDir });
        projectRepository.create({ id: 'project-1', name: '개인 사이트' });
        const repository = createSiteHostingSiteRepository({
            fs, path, projectRepository, templates: createFixtureSiteTemplateCatalog({ fs, path })
        });
        assert.throws(() => repository.create('project-1', { id: '../outside', name: '잘못된 ID', template_id: 'minimal-homepage' }), { code: 'SITE_HOSTING_SITE_ID_INVALID' });
        repository.create('project-1', { id: 'site-1', name: '첫 사이트', template_id: 'minimal-homepage' });
        assert.throws(() => repository.create('project-1', { id: 'site-1', name: '덮어쓰기', template_id: 'minimal-homepage' }), { code: 'SITE_HOSTING_SITE_ALREADY_EXISTS' });
        assert.equal(repository.get('project-1', 'site-1').name, '첫 사이트');
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('existing family site stays available when its shared template package is not cached', () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-hosting-installed-template-'));
    try {
        const projectRepository = createSiteHostingProjectRepository({ fs, path, workspaceDir });
        projectRepository.create({ id: 'project-1', name: '개인 사이트' });
        const template = {
            id: 'digital-garden-explorer-left', version: '0.1.3', name: '디지털 가든',
            family_id: 'digital-garden', package_ready: true,
            resource: {
                spec_version: SITE_HOSTING_CONTRACT_VERSION,
                family: { content_types: [] },
                family_seed_site: { displayName: '', navigation: [{ id: 'home', label: '홈', path: '/' }] }
            },
            source_root: '', family_data_root: ''
        };
        const templates = {
            get: () => template,
            copySource: (_id, destination) => {
                fs.mkdirSync(path.join(destination, 'template', 'astro'), { recursive: true });
                fs.writeFileSync(path.join(destination, 'template', 'astro', 'package.json'), '{}');
                fs.mkdirSync(path.join(destination, 'site-data'), { recursive: true });
                fs.writeFileSync(path.join(destination, 'site-data', 'site.json'), '{"navigation":[{"id":"home","label":"홈","path":"/"}]}');
                return { id: template.id, version: template.version, source_revision: 'd'.repeat(40) };
            },
            copyPreview: () => ''
        };
        const repository = createSiteHostingSiteRepository({ fs, path, projectRepository, templates });
        repository.create('project-1', {
            id: 'site-1', name: '기존 사이트', template_id: template.id,
            customization: { navigation: [{ id: 'home', label: '홈', href: '/' }] }
        });

        template.package_ready = false;
        const existingSite = repository.get('project-1', 'site-1');
        assert.equal(existingSite.template_status, 'available');
        assert.equal(existingSite.template_update_available, false);

        fs.rmSync(path.join(existingSite.root_path, 'template', 'astro'), { recursive: true, force: true });
        assert.equal(repository.get('project-1', 'site-1').template_status, 'unavailable');
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('site repository archives a site intact and removes it from the active site list', () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-hosting-site-archive-'));
    try {
        const projectRepository = createSiteHostingProjectRepository({ fs, path, workspaceDir });
        projectRepository.create({ id: 'project-1', name: '개인 사이트' });
        const repository = createSiteHostingSiteRepository({ fs, path, projectRepository, templates: createFixtureSiteTemplateCatalog({ fs, path }) });
        repository.create('project-1', { id: 'site-1', name: '보관할 사이트', template_id: 'minimal-homepage' });
        const archived = repository.archive('project-1', 'site-1', '2026-10-06T12:00:00.000Z');
        assert.equal(archived.archived, true);
        assert.equal(path.dirname(archived.archived_path), path.join(workspaceDir, 'site-hosting', 'archive'));
        assert.equal(fs.existsSync(path.join(archived.archived_path, '.bloggenius', 'site.json')), true);
        assert.deepEqual(repository.list('project-1'), []);
        assert.equal(projectRepository.get('project-1').site_count, 0);
        assert.throws(() => repository.archive('project-1', 'site-1'), { code: 'SITE_HOSTING_SITE_NOT_FOUND' });
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('site repository persists its selected Cloudflare account independently of deployment state', () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-hosting-cloudflare-account-'));
    try {
        const projectRepository = createSiteHostingProjectRepository({ fs, path, workspaceDir });
        projectRepository.create({ id: 'project-1', name: '개인 사이트' });
        const repository = createSiteHostingSiteRepository({ fs, path, projectRepository, templates: createFixtureSiteTemplateCatalog({ fs, path }) });
        repository.create('project-1', { id: 'site-1', name: '계정 연결 사이트', template_id: 'minimal-homepage' });
        const selected = repository.recordCloudflareAccount('project-1', 'site-1', { id: 'account-id', name: 'Blog Account' }, '2026-10-11T00:00:00Z');
        assert.deepEqual(selected.cloudflare_account, { id: 'account-id', name: 'Blog Account' });
        assert.equal(selected.deployment, undefined);
        assert.throws(() => repository.recordCloudflareAccount('project-1', 'site-1', { id: '', name: 'Invalid' }), { code: 'SITE_HOSTING_CLOUDFLARE_ACCOUNT_INVALID' });
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('site repository creates a customized preview draft outside the persistent site list and removes it', () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-hosting-draft-preview-'));
    try {
        const projectRepository = createSiteHostingProjectRepository({ fs, path, workspaceDir });
        projectRepository.create({ id: 'project-1', name: '개인 사이트' });
        const repository = createSiteHostingSiteRepository({
            fs, path, projectRepository, templates: createFixtureSiteTemplateCatalog({ fs, path }), temporaryRoot: workspaceDir
        });
        const draft = repository.createPreviewDraft('project-1', {
            id: 'draft-one', name: '임시 사이트', template_id: 'minimal-homepage',
            customization: { navigation: [{ label: '홈', href: '/' }] }
        });

        assert.equal(fs.existsSync(path.join(draft.root_path, 'package.json')), true);
        assert.deepEqual(repository.list('project-1'), []);
        assert.equal(repository.removePreviewDraft(draft), true);
        assert.equal(fs.existsSync(draft.root_path), false);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('site repository applies declared template defaults and records the immutable source revision', () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-hosting-customization-'));
    try {
        const projectRepository = createSiteHostingProjectRepository({ fs, path, workspaceDir });
        projectRepository.create({ id: 'project-1', name: '개인 사이트' });
        const resource = {
            site_hosting: {
                customization: { fields: [
                { key: 'site_name', type: 'string', default: '기본 이름', target: { file: 'src/site-config.json', path: 'name' } },
                { key: 'navigation', type: 'navigation', default: [{ label: '홈', href: '/' }], target: { file: 'src/site-config.json', path: 'navigation' } }
                ] },
                pages: { schema_version: 1, mode: 'static_placeholders', max_items: 5, reserved_slugs: [], target: { file: 'src/site-config.json', path: 'pages' } },
                publishing: { schema_version: 2, routes: { listing: '/blog/', detail: '/blog/{slug}/' } }
            }
        };
        const templates = {
            get: () => ({ id: 'external-home', version: '1.2.0', name: '외부 템플릿', source_root: '', resource }),
            copySource: (_id, destination) => {
                fs.mkdirSync(path.join(destination, 'src'), { recursive: true });
                fs.writeFileSync(path.join(destination, 'src', 'site-config.json'), '{"name":"template","navigation":[]}\n');
                return { id: 'external-home', version: '1.2.0', source_revision: 'c'.repeat(40) };
            },
            copyPreview: () => ''
        };
        const repository = createSiteHostingSiteRepository({ fs, path, projectRepository, templates });
        const created = repository.create('project-1', {
            id: 'site-1', name: 'My Site', template_id: 'external-home',
            customization: {
                navigation: [{ label: '홈', href: '/' }, { label: '이야기', href: '/stories/' }],
                publishing: { listing_route: '/stories/', detail_route: '/stories/{slug}/', post_list_navigation_index: 1 }
            }
        });
        const siteRoot = path.join(workspaceDir, 'site-hosting', 'sites', 'site-1');
        const siteConfig = JSON.parse(fs.readFileSync(path.join(siteRoot, 'src', 'site-config.json'), 'utf8'));
        const manifest = JSON.parse(fs.readFileSync(path.join(siteRoot, '.bloggenius', 'site.json'), 'utf8'));
        assert.equal(siteConfig.name, 'My Site');
        assert.deepEqual(siteConfig.navigation, [{ label: '홈', href: '/' }, { label: '이야기', href: '/stories/' }]);
        assert.equal(manifest.template.source_revision, 'c'.repeat(40));
        assert.equal(manifest.customization.site_name, 'My Site');
        assert.deepEqual(manifest.customization.publishing, { listing_route: '/stories/', detail_route: '/stories/{slug}/', post_list_navigation_index: 1 });
        assert.equal(created.template_name, '외부 템플릿');
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('site repository materializes template seed separately and pins the selected Content Model', () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-hosting-family-materialization-'));
    try {
        const projectRepository = createSiteHostingProjectRepository({ fs, path, workspaceDir });
        projectRepository.create({ id: 'project-1', name: '개인 사이트' });
        const familySeed = { displayName: '기본 이름', logo: '/logo.svg', seoDescription: '', searchEngineIndexing: true, navigation: [
            { id: 'about', label: '소개', path: '/about/team/' }, { id: 'posts', label: '글', path: '/blog/' }
        ] };
        const template = {
            id: 'personal-post-list', version: '0.1.0', name: '글 목록형', family_id: 'personal-homepage', package_ready: true,
            resource: {
                spec_version: SITE_HOSTING_CONTRACT_VERSION,
                family: { family_id: 'personal-homepage', name: '개인 홈페이지' },
                content_model: {
                    spec_version: SITE_HOSTING_CONTRACT_VERSION,
                    model_id: 'personal-homepage-content', model_version: '0.1.0',
                    site_profile: { fields: { logo: {}, seoDescription: {}, shareImage: {}, favicon: {}, searchEngineIndexing: {} } },
                    content_types: [{ kind: 'post', listing_route: '/blog/', detail_route: '/blog/{slug}/' }]
                },
                template: {
                    status: 'active',
                    content_model: { model_id: 'personal-homepage-content', model_version: '0.1.0' }
                },
                template_seed_site: familySeed
            }
        };
        const templates = {
            get: () => template,
            copySource: (_id, destination) => {
                fs.mkdirSync(path.join(destination, 'template', 'astro', 'src'), { recursive: true });
                fs.writeFileSync(path.join(destination, 'template', 'astro', 'package.json'), '{}');
                fs.mkdirSync(path.join(destination, 'site-data', 'data', 'posts'), { recursive: true });
                fs.mkdirSync(path.join(destination, 'site-data', 'data', 'pages'), { recursive: true });
                fs.mkdirSync(path.join(destination, 'site-data', 'public'), { recursive: true });
                fs.writeFileSync(path.join(destination, 'site-data', 'site.json'), `${JSON.stringify(familySeed)}\n`);
                fs.writeFileSync(path.join(destination, 'site-data', 'data', 'posts', 'first.md'), 'seed');
                fs.writeFileSync(path.join(destination, 'site-data', 'data', 'pages', 'about.md'), '---\nkind: page\ntitle: 소개\npath: "/about/team/"\nis_public: true\n---\n소개 내용');
                return { id: template.id, version: template.version, source_revision: 'd'.repeat(40) };
            },
            copyPreview: () => ''
        };
        const repository = createSiteHostingSiteRepository({ fs, path, projectRepository, templates });
        const created = repository.create('project-1', {
            id: 'site-1', name: '내 사이트', template_id: template.id,
            setup_inputs: {
                knowledge_collection_root: '/Users/test/Vault',
                publication_filter: { field: 'is_public', value: 'true' }
            },
            customization: {
                site_description: '사이트 소개 문구',
                search_engine_indexing: false,
                logo: { extension: 'png', content: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]) },
                share_image: { extension: 'jpg', content: Buffer.from([255, 216, 255]) },
                favicon: { extension: 'webp', content: Buffer.from('RIFF0000WEBP') },
                navigation: [
                    { id: 'about', label: '소개', href: '/story/' },
                    { id: 'posts', label: '이야기', href: '/stories/' },
                    { label: '가이드', href: '/guide/first-steps/' },
                    { label: '외부', href: 'https://example.com/' }
                ],
                custom_pages: [{ label: '가이드', path: '/guide/first-steps/', slug: 'custom-guide-first-steps' }],
                publishing: { listing_route: '/stories/', detail_route: '/stories/{slug}/', post_list_navigation_index: 1 }
            }
        });
        const root = created.root_path;
        const siteData = JSON.parse(fs.readFileSync(path.join(root, 'site-data', 'site.json'), 'utf8'));
        const manifest = JSON.parse(fs.readFileSync(path.join(root, '.bloggenius', 'site.json'), 'utf8'));
        assert.equal(fs.existsSync(path.join(root, 'template', 'astro', 'package.json')), true);
        assert.equal(siteData.displayName, '내 사이트');
        assert.equal(siteData.seoDescription, '사이트 소개 문구');
        assert.equal(siteData.searchEngineIndexing, false);
        assert.equal(siteData.logo, '/bloggenius-logo.png');
        assert.equal(siteData.shareImage, '/bloggenius-share-image.jpg');
        assert.equal(siteData.favicon, '/bloggenius-favicon.webp');
        assert.equal(fs.existsSync(path.join(root, 'site-data', 'public', 'bloggenius-logo.png')), true);
        assert.equal(fs.existsSync(path.join(root, 'site-data', 'public', 'bloggenius-share-image.jpg')), true);
        assert.equal(fs.existsSync(path.join(root, 'site-data', 'public', 'bloggenius-favicon.webp')), true);
        assert.deepEqual(siteData.navigation, [
            { id: 'about', label: '소개', path: '/story/' }, { id: 'posts', label: '이야기', path: '/stories/' },
            { id: 'menu-3', label: '가이드', path: '/guide/first-steps/' }, { id: 'menu-4', label: '외부', path: 'https://example.com/' }
        ]);
        assert.ok(fs.readFileSync(path.join(root, 'site-data', 'data', 'pages', 'about.md'), 'utf8').includes('path: "/story/"'));
        assert.ok(fs.readFileSync(path.join(root, 'site-data', 'data', 'pages', 'custom-guide-first-steps.md'), 'utf8').includes('path: "/guide/first-steps/"'));
        assert.equal(fs.existsSync(path.join(root, 'site-data', 'data', 'pages', 'custom-https-example-com.md')), false);
        assert.equal(fs.existsSync(path.join(root, 'site-data', 'data', 'posts', 'first.md')), true);
        assert.equal(manifest.template.family_id, 'personal-homepage');
        assert.equal(manifest.template.contract_version, SITE_HOSTING_CONTRACT_VERSION);
        assert.deepEqual(manifest.template.content_model, { model_id: 'personal-homepage-content', model_version: '0.1.0' });
        assert.deepEqual(manifest.setup_inputs, {
            knowledge_collection_root: '/Users/test/Vault',
            publication_filter: { field: 'is_public', value: 'true' }
        });
        assert.deepEqual(manifest.customization.publishing, { listing_route: '/stories/', detail_route: '/stories/{slug}/', post_list_navigation_index: 1 });
        const siteDataPath = path.join(root, 'site-data', 'site.json');
        const legacySiteData = JSON.parse(fs.readFileSync(siteDataPath, 'utf8'));
        legacySiteData.publishing = manifest.customization.publishing;
        fs.writeFileSync(siteDataPath, `${JSON.stringify(legacySiteData, null, 2)}\n`);
        const updated = repository.updateSettings('project-1', 'site-1', {
            name: '변경된 사이트', updated_at: '2026-10-06T00:00:00.000Z',
            setup_inputs: { publication_filter: { mode: 'all' } },
            customization: {
                site_description: '바뀐 소개', search_engine_indexing: true,
                logo: { extension: 'png', content: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]) },
                navigation: [{ id: 'about', label: '회사 소개', href: '/company/' }, { id: 'posts', label: '글', href: '/blog/' }]
            }
        });
        const updatedSiteData = JSON.parse(fs.readFileSync(path.join(root, 'site-data', 'site.json'), 'utf8'));
        assert.equal(Object.hasOwn(updatedSiteData, 'publishing'), false);
        assert.equal(updated.name, '변경된 사이트');
        assert.equal(updatedSiteData.displayName, '변경된 사이트');
        assert.equal(updatedSiteData.seoDescription, '바뀐 소개');
        assert.equal(updatedSiteData.searchEngineIndexing, true);
        assert.equal(updatedSiteData.logo, '/bloggenius-logo.png');
        assert.deepEqual(updatedSiteData.navigation, [
            { id: 'about', label: '회사 소개', path: '/company/' }, { id: 'posts', label: '글', path: '/blog/' }
        ]);
        assert.equal(fs.existsSync(path.join(root, 'site-data', 'public', 'bloggenius-share-image.jpg')), false);
        assert.equal(fs.existsSync(path.join(root, 'site-data', 'public', 'bloggenius-favicon.webp')), false);
        assert.deepEqual(updated.setup_inputs, { publication_filter: { mode: 'all' } });
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('site repository preserves valid external and multi-segment menu destinations', () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-hosting-menu-security-'));
    try {
        const projectRepository = createSiteHostingProjectRepository({ fs, path, workspaceDir });
        projectRepository.create({ id: 'project-1', name: '개인 사이트' });
        const resource = { site_hosting: { customization: { fields: [
            { key: 'navigation', type: 'navigation', default: [{ label: '홈', href: '/' }], target: { file: 'src/site-config.json', path: 'navigation' } }
        ] } } };
        const templates = {
            get: () => ({ id: 'strict-template', version: '1.0.0', name: 'Strict', source_root: '', resource }),
            copySource: (_id, destination) => {
                fs.mkdirSync(path.join(destination, 'src'), { recursive: true });
                fs.writeFileSync(path.join(destination, 'src', 'site-config.json'), '{"navigation":[]}\n');
                return { id: 'strict-template', version: '1.0.0', source_revision: 'd'.repeat(40) };
            },
            copyPreview: () => ''
        };
        const repository = createSiteHostingSiteRepository({ fs, path, projectRepository, templates });
        for (const [index, href] of ['https://example.com/path', '/about/team/', '/about/?draft=1'].entries()) {
            const site = repository.create('project-1', {
                id: `site-${index + 1}`, name: 'Valid', template_id: 'strict-template', customization: { navigation: [{ label: '페이지', href }] }
            });
            assert.equal(site.customization.navigation[0].href, href);
        }
        assert.throws(() => repository.create('project-1', {
            id: 'unsafe-site', name: 'Malformed', template_id: 'strict-template',
            customization: { navigation: [{ label: '페이지', href: 'javascript:alert(1)' }] }
        }), { status: 400 });
        assert.throws(() => repository.create('project-1', {
            id: 'extra-site', name: 'Extra', template_id: 'strict-template',
            customization: { navigation: [{ label: '페이지', href: '/about/', target: '_blank' }] }
        }), { status: 400 });
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});
