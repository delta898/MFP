'use strict';

const fsApi = require('node:fs');
const pathApi = require('node:path');
const { normalizeMenuDestination } = require('./navigation-contract');

const SOURCE_EXTENSIONS = new Set(['.astro', '.html', '.md', '.mdx']);
const IGNORED_DIRECTORIES = new Set(['.git', '.astro', 'dist', 'node_modules']);

function safeReadJson(fileSystem, filePath) {
    try { return JSON.parse(fileSystem.readFileSync(filePath, 'utf8')); }
    catch (_error) { return null; }
}

function walkFiles(fileSystem, pathModule, root, relative = '') {
    const directory = pathModule.join(root, relative);
    let entries;
    try { entries = fileSystem.readdirSync(directory, { withFileTypes: true }); }
    catch (_error) { return []; }
    const files = [];
    for (const entry of entries) {
        if (entry.isSymbolicLink?.()) continue;
        const child = relative ? pathModule.join(relative, entry.name) : entry.name;
        if (entry.isDirectory()) {
            if (!IGNORED_DIRECTORIES.has(entry.name)) files.push(...walkFiles(fileSystem, pathModule, root, child));
        } else if (entry.isFile() && SOURCE_EXTENSIONS.has(pathModule.extname(entry.name).toLowerCase())) {
            files.push(child);
        }
    }
    return files;
}

function routeFromPagePath(relativePath) {
    let route = `/${relativePath.replace(/\\/gu, '/')}`;
    route = route.replace(/\.(?:astro|html|md|mdx)$/iu, '');
    if (/(?:^|\/)index$/iu.test(route)) route = route.replace(/index$/iu, '');
    else if (!route.endsWith('/')) route += '/';
    if (!route.startsWith('/')) route = `/${route}`;
    return route || '/';
}

function decodeHtml(value) {
    return String(value || '').replace(/&amp;/giu, '&').replace(/&quot;/giu, '"')
        .replace(/&#39;|&apos;/giu, "'").replace(/&lt;/giu, '<').replace(/&gt;/giu, '>')
        .replace(/&#(\d+);/gu, (_match, code) => String.fromCodePoint(Number(code)));
}

function cleanLabel(value) {
    return decodeHtml(String(value || '').replace(/\{[^{}]*\}/gu, ' ').replace(/<[^>]*>/gu, ' ')
        .replace(/\s+/gu, ' ').trim()).slice(0, 30);
}

function readProjectImagePreview(fileSystem, pathModule, root, value) {
    const publicPath = String(value || '');
    if (!publicPath.startsWith('/') || publicPath.startsWith('//') || /[?#\\%]/u.test(publicPath)) return '';
    const segments = publicPath.slice(1).split('/');
    if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return '';
    const extensions = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
    const mime = extensions[pathModule.extname(publicPath).toLowerCase()];
    if (!mime) return '';
    try {
        const publicRoot = fileSystem.realpathSync(pathModule.join(root, 'public'));
        const assetPath = fileSystem.realpathSync(pathModule.join(publicRoot, ...segments));
        if (!assetPath.startsWith(`${publicRoot}${pathModule.sep}`)) return '';
        const stat = fileSystem.statSync(assetPath);
        if (!stat.isFile() || stat.size > 1024 * 1024) return '';
        return `data:${mime};base64,${fileSystem.readFileSync(assetPath).toString('base64')}`;
    } catch (_error) { return ''; }
}

function routeLabel(source, relativePath, pathModule) {
    const title = source.match(/^\s*title\s*:\s*["']([^"']+)["']/mu)?.[1]
        || source.match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu)?.[1]
        || source.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/iu)?.[1];
    const label = cleanLabel(title);
    if (label) return label;
    const base = pathModule.basename(relativePath).replace(/\.(?:astro|html|md|mdx)$/iu, '');
    const segment = base === 'index' ? pathModule.basename(pathModule.dirname(relativePath)) : base;
    return segment && segment !== '.' && segment !== 'pages' ? segment.replace(/[-_]+/gu, ' ').slice(0, 30) : '홈';
}

function projectMetadata(fileSystem, pathModule, root, packageJson, sources) {
    const meta = safeReadJson(fileSystem, pathModule.join(root, '.bloggenius', 'site.json')) || {};
    const customization = meta.customization && typeof meta.customization === 'object' ? meta.customization : {};
    const packageName = String(packageJson.name || '').trim();
    const sourceText = sources.map(({ source }) => source).join('\n');
    const title = sourceText.match(/<title\b[^>]*>([\s\S]*?)<\/title>/iu)?.[1];
    const descriptionTag = sourceText.match(/<meta\b[^>]*(?:name|property)=["'](?:description|og:description)["'][^>]*content=["']([^"']+)["'][^>]*>/iu)?.[1]
        || sourceText.match(/<meta\b[^>]*content=["']([^"']+)["'][^>]*(?:name|property)=["'](?:description|og:description)["'][^>]*>/iu)?.[1];
    const inferredName = String(meta.name || '').trim() || cleanLabel(title)
        || packageName.replace(/^@[^/]+\//u, '').replace(/[-_]+/gu, ' ').replace(/\b\w/gu, (letter) => letter.toUpperCase());
    const inferredDescription = String(customization.site_description || meta.site_description || packageJson.description || descriptionTag || '').trim().slice(0, 300);
    const metadataNavigation = Array.isArray(customization.navigation) ? customization.navigation
        : Array.isArray(meta.navigation) ? meta.navigation : [];
    const validMetadataNavigation = metadataNavigation.map((item) => {
        const label = cleanLabel(item?.label);
        const href = String(item?.href || item?.path || '').trim();
        if (!label || !href) return null;
        try { normalizeMenuDestination(href); } catch (_error) { return null; }
        return { label, href, source: '.bloggenius/site.json' };
    }).filter(Boolean).slice(0, 50);
    return {
        meta,
        suggestedName: inferredName.slice(0, 80),
        nameSource: String(meta.name || '').trim() ? '.bloggenius/site.json' : title ? '페이지 제목' : packageName ? 'package.json' : '',
        suggestedDescription: inferredDescription,
        descriptionSource: String(customization.site_description || meta.site_description || '').trim()
            ? '.bloggenius/site.json' : packageJson.description ? 'package.json' : descriptionTag ? '페이지 메타 정보' : '',
        metadataNavigation: validMetadataNavigation,
        searchEngineIndexing: customization.search_engine_indexing !== false
    };
}

function inspectProjectSettingsContract(fileSystem, pathModule, root) {
    const descriptorPath = pathModule.join(root, 'bloggenius', 'project.json');
    const settingsPath = pathModule.join(root, 'site-data', 'site.json');
    const descriptor = safeReadJson(fileSystem, descriptorPath);
    const settings = safeReadJson(fileSystem, settingsPath);
    const runtimePath = pathModule.join(root, 'src', 'lib', 'site.ts');
    let runtimeSource = '';
    try { runtimeSource = fileSystem.readFileSync(runtimePath, 'utf8'); } catch (_error) { }
    const supportedKeys = ['site_identity', 'navigation', 'logo', 'favicon', 'share_image'];
    const declared = descriptor?.settings_support;
    const descriptorValid = descriptor?.format === 'bloggenius-astro-project'
        && descriptor.schema_version === 1
        && declared && typeof declared === 'object' && !Array.isArray(declared)
        && Object.keys(declared).every((key) => supportedKeys.includes(key))
        && Object.values(declared).every((value) => typeof value === 'boolean');
    const capabilities = Object.fromEntries(supportedKeys.map((key) => [key, Boolean(descriptorValid && declared?.[key])]));
    const issues = [];
    if (descriptor && !descriptorValid) issues.push('BlogGenius 연동 선언 형식이 올바르지 않습니다.');
    if (descriptorValid && !settings) issues.push('site-data/site.json 설정 파일을 읽지 못했습니다.');
    if (descriptorValid && settings) {
        if (capabilities.site_identity && (typeof settings.displayName !== 'string'
            || typeof settings.seoDescription !== 'string' || typeof settings.searchEngineIndexing !== 'boolean')) {
            capabilities.site_identity = false;
            issues.push('사이트 기본 정보 연동에 필요한 필드가 site-data/site.json에 없습니다.');
        }
        if (capabilities.navigation && (!Array.isArray(settings.navigation)
            || settings.navigation.some((item) => !item || typeof item.id !== 'string'
                || typeof item.label !== 'string' || typeof item.path !== 'string'))) {
            capabilities.navigation = false;
            issues.push('메뉴 연동에 필요한 navigation 항목이 올바르지 않습니다.');
        }
        for (const [key, field] of [['logo', 'logo'], ['favicon', 'favicon'], ['share_image', 'shareImage']]) {
            if (capabilities[key] && typeof settings[field] !== 'string') {
                capabilities[key] = false;
                issues.push(`${field} 이미지 연동 필드가 site-data/site.json에 없습니다.`);
            }
        }
    }
    const validSettingsObject = Boolean(settings && typeof settings === 'object' && !Array.isArray(settings));
    if (descriptorValid && !validSettingsObject) {
        for (const key of supportedKeys) capabilities[key] = false;
        issues.push('site-data/site.json이 JSON 객체가 아닙니다.');
    }
    if (descriptorValid && validSettingsObject && (!/site-data/u.test(runtimeSource) || !/site\.json/u.test(runtimeSource))) {
        for (const key of supportedKeys) capabilities[key] = false;
        issues.push('Astro 프로젝트에서 site-data/site.json을 읽는 연동 코드를 확인하지 못했습니다.');
    }
    const enabled = Object.values(capabilities).some(Boolean);
    return {
        descriptor_valid: Boolean(descriptorValid),
        settings_valid: validSettingsObject,
        capabilities,
        settings,
        issues,
        enabled,
        source: { descriptor: 'bloggenius/project.json', settings: 'site-data/site.json' }
    };
}

function inspectAstroProject(options = {}) {
    const fileSystem = options.fs || fsApi;
    const pathModule = options.path || pathApi;
    const root = options.root;
    const packageJson = safeReadJson(fileSystem, pathModule.join(root, 'package.json'));
    if (!packageJson || !packageJson.scripts?.build || !(packageJson.dependencies?.astro || packageJson.devDependencies?.astro)) {
        const error = new Error('Astro 의존성과 build 스크립트가 있는 프로젝트가 필요합니다.');
        error.code = 'SITE_HOSTING_ASTRO_PROJECT_REQUIRED';
        error.status = 400;
        throw error;
    }
    const pagesRoot = pathModule.join(root, 'src', 'pages');
    const pageFiles = walkFiles(fileSystem, pathModule, pagesRoot);
    const sources = pageFiles.map((relativePath) => ({
        relativePath,
        route: routeFromPagePath(relativePath),
        source: (() => {
            try { return fileSystem.readFileSync(pathModule.join(pagesRoot, relativePath), 'utf8').slice(0, 256 * 1024); }
            catch (_error) { return ''; }
        })()
    }));
    const metadata = projectMetadata(fileSystem, pathModule, root, packageJson, sources);
    const settingsContract = inspectProjectSettingsContract(fileSystem, pathModule, root);
    const { settings: projectSettings, ...integration } = settingsContract;
    const staticPages = sources.filter(({ route }) => !/\[[^/]+\]/u.test(route))
        .map(({ route, source, relativePath }) => ({ href: route === '' ? '/' : route, label: routeLabel(source, relativePath, pathModule), relativePath, source }));
    const pageRoutes = new Set(staticPages.map(({ href }) => href));
    const candidates = new Map();
    if (settingsContract.capabilities.navigation) {
        for (const item of projectSettings.navigation) {
            const label = cleanLabel(item.label);
            const href = String(item.path || '').trim();
            if (!label || !href) continue;
            try { normalizeMenuDestination(href); } catch (_error) { continue; }
            candidates.set(`${label}\n${href}`, { id: item.id, label, href, source: 'site-data/site.json' });
        }
    }
    for (const item of metadata.metadataNavigation) candidates.set(`${item.label}\n${item.href}`, { label: item.label, href: item.href, source: item.source });

    const sourceRoot = pathModule.join(root, 'src');
    const searchableFiles = walkFiles(fileSystem, pathModule, sourceRoot);
    for (const relativePath of searchableFiles) {
        let source = '';
        try { source = fileSystem.readFileSync(pathModule.join(sourceRoot, relativePath), 'utf8').slice(0, 256 * 1024); }
        catch (_error) { continue; }
        for (const navMatch of source.matchAll(/<nav\b[^>]*>([\s\S]*?)<\/nav>/giu)) {
            for (const anchorMatch of navMatch[1].matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/giu)) {
                const href = anchorMatch[1].match(/\bhref\s*=\s*(["'])(.*?)\1/iu)?.[2]?.trim() || '';
                const label = cleanLabel(anchorMatch[2]) || cleanLabel(anchorMatch[1].match(/\baria-label\s*=\s*(["'])(.*?)\1/iu)?.[2]);
                if (!href || !label || href.startsWith('#') || /^javascript:/iu.test(href)) continue;
                let destination = href;
                if (!/^(?:https?:|mailto:|tel:|\/\/)/iu.test(href)) {
                    const sourceRoute = routeFromPagePath(relativePath.replace(/^pages\//u, ''));
                    const base = sourceRoute.endsWith('/') ? sourceRoute : `${sourceRoute}/`;
                    try { destination = new URL(href, `https://bloggenius.invalid${base}`).pathname; } catch (_error) { continue; }
                }
                if (destination.startsWith('/')) {
                    if (!pageRoutes.has(destination) && ![...pageRoutes].some((route) => route === `${destination}/` || route.replace(/\/$/u, '') === destination)) continue;
                    destination = [...pageRoutes].find((route) => route === destination || route === `${destination}/` || route.replace(/\/$/u, '') === destination) || destination;
                }
                try { normalizeMenuDestination(destination); } catch (_error) { continue; }
                candidates.set(`${label}\n${destination}`, { label, href: destination, source: 'Astro 내비게이션' });
            }
        }
    }
    if (!candidates.size) {
        for (const page of staticPages) {
            if (page.href === '/') continue;
            candidates.set(`${page.label}\n${page.href}`, { label: page.label, href: page.href, source: `src/pages/${page.relativePath}` });
        }
    }
    const navigation = [...candidates.values()].slice(0, 50);
    const blogListing = sources.find(({ route, source }) => {
        const isContentListing = /getCollection\s*\(|getEntry\s*\(|paginate\s*\(/u.test(source);
        const hasPosts = /\[[^/]*(?:slug|id|...)[^/]*\]/iu.test(source)
            || sources.some((item) => /\[[^/]*(?:slug|id|...)[^/]*\]/iu.test(item.relativePath));
        return isContentListing && hasPosts && pageRoutes.has(route);
    });
    const listPathFromMeta = String(metadata.meta.customization?.publishing?.listing_route
        || metadata.meta.publishing?.listing_route || '').trim();
    const postsNavigationIndex = settingsContract.capabilities.navigation
        ? settingsContract.settings.navigation.findIndex((item) => item?.id === 'posts')
        : -1;
    const postListPath = listPathFromMeta || blogListing?.route || '';
    const postListIndex = postListPath ? navigation.findIndex((item) => item.href === postListPath) : -1;
    return {
        project: {
            astro_version: String(packageJson.dependencies?.astro || packageJson.devDependencies?.astro || '').replace(/^[^\d]*/u, ''),
            package_name: String(packageJson.name || ''),
            page_count: staticPages.length,
            page_routes: staticPages.map(({ href, label, relativePath }) => ({ href, label, source: `src/pages/${relativePath}` }))
        },
        integration,
        suggested: {
            name: settingsContract.capabilities.site_identity ? projectSettings.displayName : metadata.suggestedName,
            name_source: settingsContract.capabilities.site_identity ? 'site-data/site.json' : metadata.nameSource,
            description: settingsContract.capabilities.site_identity ? projectSettings.seoDescription : metadata.suggestedDescription,
            description_source: settingsContract.capabilities.site_identity ? 'site-data/site.json' : metadata.descriptionSource,
            search_engine_indexing: settingsContract.capabilities.site_identity
                ? projectSettings.searchEngineIndexing : metadata.searchEngineIndexing,
            navigation,
            post_list_navigation_index: postsNavigationIndex >= 0 ? postsNavigationIndex : postListIndex >= 0 ? postListIndex : null,
            logo: settingsContract.capabilities.logo ? projectSettings.logo : '',
            favicon: settingsContract.capabilities.favicon ? projectSettings.favicon : '',
            share_image: settingsContract.capabilities.share_image ? projectSettings.shareImage : '',
            logo_preview: settingsContract.capabilities.logo ? readProjectImagePreview(fileSystem, pathModule, root, projectSettings.logo) : '',
            favicon_preview: settingsContract.capabilities.favicon ? readProjectImagePreview(fileSystem, pathModule, root, projectSettings.favicon) : '',
            share_image_preview: settingsContract.capabilities.share_image ? readProjectImagePreview(fileSystem, pathModule, root, projectSettings.shareImage) : ''
        },
        notes: [
            metadata.nameSource ? '' : '프로젝트에서 사이트 이름을 찾지 못했습니다. 직접 입력해 주세요.',
            navigation.length ? `사이트 메뉴 후보 ${navigation.length}개를 찾았습니다.` : '메뉴 후보를 찾지 못했습니다. 필요하면 직접 추가할 수 있습니다.',
            postListPath ? '글 목록으로 보이는 주소를 찾았습니다. 실제 글 목록인지 확인해 주세요.' : '',
            ...settingsContract.issues
        ].filter(Boolean)
    };
}

module.exports = { inspectAstroProject };
