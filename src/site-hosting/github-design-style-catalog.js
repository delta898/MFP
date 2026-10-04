'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DESIGN_STYLE_REQUIRED_TOKENS, DESIGN_STYLE_CONTRACT_VERSION } = require('../../ui/scripts/foundation/design-style-token-contract');
const { isCompatibleWithBlogGenius } = require('./bloggenius-compatibility');

const DEFAULT_CATALOG_URL = 'https://raw.githubusercontent.com/delta898/Amade/main/amade/catalog/index.json';
const DEVELOPMENT_CATALOG_URL = 'https://raw.githubusercontent.com/delta898/Amade/dev/amade/catalog/index.json';
const MAX_CATALOG_BYTES = 1024 * 1024;
const MAX_STYLE_BYTES = 256 * 1024;
const STYLE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TOKEN_VALUE_UNSAFE = /[;{}<>]|\b(?:url|expression|image-set|cross-fade|element|paint)\s*\(|@import|javascript:|data:|https?:\/\//i;

function createGitHubDesignStyleCatalog(options = {}) {
    const fileSystem = options.fs || fs;
    const pathApi = options.path || path;
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    const workspaceDir = String(options.workspaceDir || '').trim();
    const cacheFile = options.cacheFile || (workspaceDir ? pathApi.join(workspaceDir, 'site-hosting', 'design-style-cache.json') : '');
    const environment = String(options.environment || process.env.BLOGGENIUS_ENV || '').trim().toLowerCase();
    const isSupportedByBlogGenius = (compatibility) => isCompatibleWithBlogGenius(
        compatibility,
        options.bloggeniusVersion ? { appVersion: options.bloggeniusVersion } : {}
    );
    const branchUrl = ['local', 'development'].includes(environment) ? DEVELOPMENT_CATALOG_URL : DEFAULT_CATALOG_URL;
    const catalogUrl = String(options.catalogUrl || process.env.BLOGGENIUS_UI_STYLE_CATALOG_URL || branchUrl);
    if (typeof fetchImpl !== 'function') throw new Error('HTTPS fetch를 사용할 수 없습니다.');

    function fail(code, message, status = 502, cause) {
        const error = new Error(message);
        error.code = code;
        error.status = status;
        if (cause) error.cause = cause;
        return error;
    }

    function safeRelativePath(value) {
        const normalized = String(value || '').replaceAll('\\', '/');
        if (!normalized || normalized.startsWith('/') || normalized.includes('\0')
            || normalized.split('/').some((part) => !part || part === '.' || part === '..')) return '';
        return normalized;
    }

    async function fetchJson(url, maxBytes, code) {
        let response;
        try { response = await fetchImpl(url, { headers: { Accept: 'application/json' } }); }
        catch (cause) { throw fail(code, 'Amade UI Style catalog에 연결할 수 없습니다.', 502, cause); }
        if (!response?.ok) throw fail(code, `Amade UI Style 파일을 가져오지 못했습니다 (HTTP ${response?.status || 0}).`);
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length > maxBytes) throw fail('BLOGGENIUS_UI_STYLE_TOO_LARGE', 'UI Style 파일이 크기 제한을 넘었습니다.', 413);
        try { return JSON.parse(buffer.toString('utf8')); }
        catch (cause) { throw fail('BLOGGENIUS_UI_STYLE_INVALID', 'Amade UI Style JSON 형식이 올바르지 않습니다.', 502, cause); }
    }

    function getCatalogLocation() {
        const match = catalogUrl.match(/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/);
        if (!match) throw fail('BLOGGENIUS_UI_STYLE_CATALOG_INVALID', 'Amade catalog URL을 확인할 수 없습니다.');
        return { owner: match[1], repo: match[2], ref: match[3], path: safeRelativePath(match[4]) };
    }

    async function resolveRevision() {
        if (typeof options.revisionResolver === 'function') {
            const revision = String(await options.revisionResolver(getCatalogLocation()) || '');
            if (/^[a-f0-9]{40}$/.test(revision)) return revision;
            throw fail('BLOGGENIUS_UI_STYLE_CATALOG_INVALID', 'Amade catalog revision이 올바르지 않습니다.');
        }
        const location = getCatalogLocation();
        const url = `https://api.github.com/repos/${encodeURIComponent(location.owner)}/${encodeURIComponent(location.repo)}/commits/${encodeURIComponent(location.ref)}`;
        const commit = await fetchJson(url, MAX_CATALOG_BYTES, 'BLOGGENIUS_UI_STYLE_CATALOG_UNAVAILABLE');
        if (!/^[a-f0-9]{40}$/.test(String(commit?.sha || ''))) throw fail('BLOGGENIUS_UI_STYLE_CATALOG_INVALID', 'Amade catalog revision이 올바르지 않습니다.');
        return commit.sha;
    }

    function rawUrl(revision, filePath) {
        const safePath = safeRelativePath(filePath);
        if (!/^[a-f0-9]{40}$/.test(revision) || !safePath) throw fail('BLOGGENIUS_UI_STYLE_CATALOG_INVALID', 'Amade UI Style 경로 또는 revision이 올바르지 않습니다.');
        const location = getCatalogLocation();
        return `https://raw.githubusercontent.com/${location.owner}/${location.repo}/${revision}/${safePath.split('/').map(encodeURIComponent).join('/')}`;
    }

    function validateCatalog(catalog) {
        if (catalog?.spec_version !== '0.1.0' || catalog.status !== 'experimental' || !Array.isArray(catalog.styles)) {
            throw fail('BLOGGENIUS_UI_STYLE_CATALOG_INVALID', 'Amade 0.1 UI Style catalog 형식이 올바르지 않습니다.');
        }
        const seen = new Set();
        return catalog.styles.map((item) => {
            const styleId = String(item?.style_id || '');
            const manifest = safeRelativePath(item?.manifest);
            if (!STYLE_ID_PATTERN.test(styleId) || seen.has(styleId) || manifest !== `amade/styles/${styleId}/style.json`) {
                throw fail('BLOGGENIUS_UI_STYLE_CATALOG_INVALID', 'Amade UI Style reference가 올바르지 않습니다.');
            }
            seen.add(styleId);
            return { style_id: styleId, manifest };
        });
    }

    function validateStyle(style, expectedId) {
        if (style?.spec_version !== '0.1.0' || style.style_id !== expectedId
            || !['active', 'deprecated', 'withdrawn'].includes(style.status)
            || typeof style.name !== 'string' || !style.name.trim()
            || typeof style.description !== 'string' || !style.description.trim()
            || typeof style.author !== 'string' || !style.author.trim()
            || !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(String(style.version || ''))
            || typeof style.license !== 'string' || !style.license.trim()
            || !Array.isArray(style.categories) || !style.categories.length
            || !Array.isArray(style.tags) || !safeRelativePath(style.preview)
            || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(String(style.compatibility?.min_bloggenius_version || ''))
            || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(style.compatibility?.contract?.id || ''))
            || !/^\d+\.\d+(?:\.\d+)?$/.test(String(style.compatibility?.contract?.version || ''))) {
            throw fail('BLOGGENIUS_UI_STYLE_INVALID', 'Amade UI Style manifest가 0.1 규격에 맞지 않습니다.');
        }
        if (style.compatibility.contract.id !== 'bloggenius-ui-style-tokens'
            || style.compatibility.contract.version !== DESIGN_STYLE_CONTRACT_VERSION
            || !isSupportedByBlogGenius(style.compatibility)) {
            throw fail('BLOGGENIUS_UI_STYLE_INCOMPATIBLE', '이 BlogGenius 버전에서 지원하지 않는 UI Style 호환성 계약입니다.', 422);
        }
        const tokens = style.tokens;
        if (!tokens || typeof tokens !== 'object' || Array.isArray(tokens)) throw fail('BLOGGENIUS_UI_STYLE_INVALID', 'UI Style token 데이터가 없습니다.');
        const tokenNames = Object.keys(tokens);
        if (tokenNames.length !== DESIGN_STYLE_REQUIRED_TOKENS.length
            || DESIGN_STYLE_REQUIRED_TOKENS.some((name) => !Object.prototype.hasOwnProperty.call(tokens, name))) {
            throw fail('BLOGGENIUS_UI_STYLE_INVALID', 'UI Style token 집합이 현재 BlogGenius 계약과 일치하지 않습니다.');
        }
        for (const [name, rawValue] of Object.entries(tokens)) {
            const value = String(rawValue || '').trim();
            if (!DESIGN_STYLE_REQUIRED_TOKENS.includes(name) || !value || value.length > 500 || TOKEN_VALUE_UNSAFE.test(value)) {
                throw fail('BLOGGENIUS_UI_STYLE_INVALID', `허용되지 않은 UI Style token 값입니다: ${name}`);
            }
        }
        return {
            id: style.style_id,
            label: style.name.trim().slice(0, 120),
            blurb: style.description.trim().slice(0, 1000),
            author: style.author.trim().slice(0, 120),
            version: style.version,
            categories: style.categories,
            tags: style.tags,
            preview: style.preview,
            compatibility: style.compatibility,
            contractVersion: DESIGN_STYLE_CONTRACT_VERSION,
            selectable: style.status === 'active',
            tokens
        };
    }

    function readCache() {
        if (!cacheFile || !fileSystem.existsSync(cacheFile)) return [];
        try {
            const cache = JSON.parse(fileSystem.readFileSync(cacheFile, 'utf8'));
            if (cache?.token_contract !== `bloggenius-style-tokens-${DESIGN_STYLE_CONTRACT_VERSION}` || !Array.isArray(cache.styles)) return [];
            return cache.styles.map((item) => validateStyle({
                spec_version: '0.1.0', style_id: item.id, name: item.label, description: item.blurb,
                author: item.author || 'Amade', version: item.version || '0.1.0', license: item.license || 'MIT',
                categories: item.categories || ['BlogGenius UI'], tags: item.tags || [], preview: item.preview || 'preview.svg',
                status: 'active', compatibility: item.compatibility, tokens: item.tokens
            }, item.id));
        } catch (_error) { return []; }
    }

    function writeCache(styles) {
        if (!cacheFile) return;
        fileSystem.mkdirSync(pathApi.dirname(cacheFile), { recursive: true });
        const temporary = `${cacheFile}.${process.pid}.tmp`;
        fileSystem.writeFileSync(temporary, `${JSON.stringify({ token_contract: `bloggenius-style-tokens-${DESIGN_STYLE_CONTRACT_VERSION}`, styles }, null, 2)}\n`, { mode: 0o600 });
        fileSystem.renameSync(temporary, cacheFile);
    }

    async function list() {
        try {
            const revision = await resolveRevision();
            const catalog = await fetchJson(rawUrl(revision, getCatalogLocation().path), MAX_CATALOG_BYTES, 'BLOGGENIUS_UI_STYLE_CATALOG_UNAVAILABLE');
            const references = validateCatalog(catalog);
            const styles = [];
            for (const reference of references) {
                const manifest = await fetchJson(rawUrl(revision, reference.manifest), MAX_STYLE_BYTES, 'BLOGGENIUS_UI_STYLE_UNAVAILABLE');
                if (manifest.status !== 'active') continue;
                try { styles.push(validateStyle(manifest, reference.style_id)); }
                catch (error) {
                    if (error.code === 'BLOGGENIUS_UI_STYLE_INCOMPATIBLE') continue;
                    throw error;
                }
            }
            writeCache(styles);
            return { styles, source: 'amade', revision };
        } catch (error) {
            const cached = readCache();
            if (cached.length) return { styles: cached, source: 'cache', warning: error.message };
            throw error;
        }
    }

    return { list };
}

module.exports = { DEFAULT_CATALOG_URL, DEVELOPMENT_CATALOG_URL, createGitHubDesignStyleCatalog };
