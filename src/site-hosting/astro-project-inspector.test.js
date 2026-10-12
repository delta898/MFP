'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { inspectAstroProject } = require('./astro-project-inspector');

test('inspects a plain Astro project and suggests its title, description, pages, and navigation', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-project-inspector-'));
    try {
        fs.mkdirSync(path.join(root, 'src', 'pages', 'about'), { recursive: true });
        fs.mkdirSync(path.join(root, 'src', 'layouts'), { recursive: true });
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
            name: 'quiet-notes', description: '생각을 기록하는 공간', dependencies: { astro: '^5.4.0' }, scripts: { build: 'astro build' }
        }));
        fs.writeFileSync(path.join(root, 'src', 'pages', 'index.astro'), '<title>담백한 기록</title><meta name="description" content="차분한 기록 공간"><h1>담백한 기록</h1>');
        fs.writeFileSync(path.join(root, 'src', 'pages', 'about', 'index.astro'), '<h1>소개</h1>');
        fs.writeFileSync(path.join(root, 'src', 'layouts', 'Base.astro'), '<nav><a href="/">홈</a><a href="/about/">소개</a></nav>');

        const result = inspectAstroProject({ fs, path, root });
        assert.equal(result.suggested.name, '담백한 기록');
        assert.equal(result.suggested.name_source, '페이지 제목');
        assert.equal(result.suggested.description, '생각을 기록하는 공간');
        assert.deepEqual(result.suggested.navigation.map(({ label, href }) => ({ label, href })), [
            { label: '홈', href: '/' }, { label: '소개', href: '/about/' }
        ]);
        assert.equal(result.project.page_count, 2);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('salvages valid fields from incomplete BlogGenius metadata and falls back to Astro files', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-project-inspector-meta-'));
    try {
        fs.mkdirSync(path.join(root, '.bloggenius'), { recursive: true });
        fs.mkdirSync(path.join(root, 'src', 'pages'), { recursive: true });
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies: { astro: '^5.0.0' }, scripts: { build: 'astro build' } }));
        fs.writeFileSync(path.join(root, '.bloggenius', 'site.json'), JSON.stringify({
            name: '메타 기록', customization: { site_description: '저장된 설명', search_engine_indexing: false,
                navigation: [{ label: '기록', href: '/entries/' }, { label: '', href: '/invalid/' }] }
        }));
        fs.writeFileSync(path.join(root, 'src', 'pages', 'index.astro'), '<h1>실제 프로젝트 제목</h1>');
        fs.writeFileSync(path.join(root, 'src', 'pages', 'entries.astro'), '<h1>Entries</h1>');

        const result = inspectAstroProject({ fs, path, root });
        assert.equal(result.suggested.name, '메타 기록');
        assert.equal(result.suggested.description, '저장된 설명');
        assert.equal(result.suggested.search_engine_indexing, false);
        assert.deepEqual(result.suggested.navigation, [{ label: '기록', href: '/entries/', source: '.bloggenius/site.json' }]);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('recognizes declared Astro site-data settings and uses its navigation as the menu source', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astro-project-inspector-contract-'));
    try {
        fs.mkdirSync(path.join(root, 'bloggenius'), { recursive: true });
        fs.mkdirSync(path.join(root, 'site-data'), { recursive: true });
        fs.mkdirSync(path.join(root, 'src', 'pages'), { recursive: true });
        fs.mkdirSync(path.join(root, 'src', 'lib'), { recursive: true });
        fs.mkdirSync(path.join(root, 'public', 'images'), { recursive: true });
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
            name: 'mentivenus', dependencies: { astro: '^7.3.7' }, scripts: { build: 'astro build' }
        }));
        fs.writeFileSync(path.join(root, 'bloggenius', 'project.json'), JSON.stringify({
            format: 'bloggenius-astro-project', schema_version: 1,
            settings_support: { site_identity: true, navigation: true, logo: true, favicon: true, share_image: true }
        }));
        fs.writeFileSync(path.join(root, 'site-data', 'site.json'), JSON.stringify({
            displayName: 'mentivenus', seoDescription: 'AI 솔루션 회사', searchEngineIndexing: true,
            navigation: [
                { id: 'home', label: '홈', path: '/' },
                { id: 'about', label: '회사 소개', path: '/about/' },
                { id: 'posts', label: '뉴스', path: '/blog/' }
            ], logo: '/images/brand.png', shareImage: '', favicon: '', project: { tagline: '프로젝트 전용 설정' }
        }));
        fs.writeFileSync(path.join(root, 'public', 'images', 'brand.png'), Buffer.from('iVBORw0KGgo=', 'base64'));
        fs.writeFileSync(path.join(root, 'src', 'lib', 'site.ts'), "path.join(process.cwd(), 'site-data', 'site.json')");
        fs.writeFileSync(path.join(root, 'src', 'pages', 'index.astro'), '<h1>mentivenus</h1>');
        fs.writeFileSync(path.join(root, 'src', 'pages', '[...slug].astro'), "getCollection('posts');");

        const result = inspectAstroProject({ fs, path, root });
        assert.equal(result.suggested.name, 'mentivenus');
        assert.equal(result.suggested.description, 'AI 솔루션 회사');
        assert.deepEqual(result.suggested.navigation.map(({ id, label, href }) => ({ id, label, href })), [
            { id: 'home', label: '홈', href: '/' },
            { id: 'about', label: '회사 소개', href: '/about/' },
            { id: 'posts', label: '뉴스', href: '/blog/' }
        ]);
        assert.equal(result.suggested.post_list_navigation_index, 2);
        assert.equal(result.suggested.logo, '/images/brand.png');
        assert.equal(result.suggested.logo_preview, 'data:image/png;base64,iVBORw0KGgo=');
        assert.deepEqual(result.integration.capabilities, {
            site_identity: true, navigation: true, logo: true, favicon: true, share_image: true
        });
        assert.equal(Object.hasOwn(result.integration, 'settings'), false, 'project data stays out of analysis responses');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
