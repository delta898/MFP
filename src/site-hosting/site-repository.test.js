'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createSiteHostingProjectRepository } = require('./project-repository');
const { createSiteHostingSiteRepository } = require('./site-repository');
const { createSiteTemplateCatalog } = require('./site-template-catalog');

test('site repository materializes selected Astro files and keeps BlogGenius metadata separate', () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-hosting-site-'));
    try {
        const projectRepository = createSiteHostingProjectRepository({ fs, path, workspaceDir });
        projectRepository.create({ id: 'project-1', name: '개인 사이트' });
        const repository = createSiteHostingSiteRepository({
            fs, path, projectRepository, templates: createSiteTemplateCatalog({ fs, path })
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

test('site repository rejects unsafe and duplicate IDs without replacing an existing site', () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-hosting-site-id-'));
    try {
        const projectRepository = createSiteHostingProjectRepository({ fs, path, workspaceDir });
        projectRepository.create({ id: 'project-1', name: '개인 사이트' });
        const repository = createSiteHostingSiteRepository({
            fs, path, projectRepository, templates: createSiteTemplateCatalog({ fs, path })
        });
        assert.throws(() => repository.create('project-1', { id: '../outside', name: '잘못된 ID', template_id: 'minimal-homepage' }), { code: 'SITE_HOSTING_SITE_ID_INVALID' });
        repository.create('project-1', { id: 'site-1', name: '첫 사이트', template_id: 'minimal-homepage' });
        assert.throws(() => repository.create('project-1', { id: 'site-1', name: '덮어쓰기', template_id: 'minimal-homepage' }), { code: 'SITE_HOSTING_SITE_ALREADY_EXISTS' });
        assert.equal(repository.get('project-1', 'site-1').name, '첫 사이트');
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
            fs, path, projectRepository, templates: createSiteTemplateCatalog({ fs, path }), temporaryRoot: workspaceDir
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

test('site repository materializes family data separately from replaceable Astro presentation', () => {
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
                spec_version: '0.1.0-dev2', family: { content_types: [{ kind: 'post', listing_route: '/blog/', detail_route: '/blog/{slug}/' }] },
                template: { status: 'active' }, family_seed_site: familySeed
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
        assert.deepEqual(manifest.customization.publishing, { listing_route: '/stories/', detail_route: '/stories/{slug}/', post_list_navigation_index: 1 });
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
