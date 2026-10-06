'use strict';

const crypto = require('node:crypto');
const osApi = require('node:os');
const { domainToASCII } = require('node:url');
const net = require('node:net');
const { createSiteHostingProjectRepository } = require('../../site-hosting/project-repository');
const { createSiteHostingSiteRepository } = require('../../site-hosting/site-repository');
const { normalizeMenuDestination, normalizeMenuLabel: validateMenuLabel, normalizeNavigationItems, internalPathSegment, internalPathname } = require('../../site-hosting/navigation-contract');
const { replaceImageBlocks } = require('../../content/image-blocks');
const { createGitHubSiteTemplateCatalog } = require('../../site-hosting/github-site-template-catalog');
const { createAstroSiteRuntime } = require('../../site-hosting/astro-site-runtime');
const { createCloudflareStaticAssetsDeployer } = require('../../site-hosting/cloudflare-static-assets-deployer');
const { isSupportedSiteHostingContractVersion } = require('../../site-hosting/bloggenius-compatibility');

function createSiteHostingSiteService(deps = {}) {
    const fileSystem = deps.fs || require('node:fs');
    const pathApi = deps.path || require('node:path');
    const operatingSystem = deps.os || osApi;
    let lastSetupDirectory = '';
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
    const openExternal = deps.openExternal || (async (url) => {
        const electron = require('electron');
        if (!electron?.shell?.openExternal) throw new Error('시스템 브라우저를 실행할 수 없습니다.');
        await electron.shell.openExternal(url);
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
    const manuscriptDraftService = deps.manuscriptDraftService || null;
    const createCloudflareClient = deps.createCloudflareSdkClient || ((accessToken) => {
        const Cloudflare = require('cloudflare');
        return new Cloudflare({ apiToken: accessToken, maxRetries: 1 });
    });
    const createCloudflareAdapter = deps.createCloudflareSdkAdapter || require('../../site-hosting/cloudflare-static-assets-deployer').createCloudflareSdkAdapter;
    const now = deps.now || (() => new Date().toISOString());
    const createId = deps.createId || (() => crypto.randomUUID().replace(/-/g, ''));
    const draftPreviews = new Map();
    const siteDeletionPlans = new Map();

    function normalizeSetupInputs(template, requested = {}, { allowMissingRequired = false } = {}) {
        if (!requested || typeof requested !== 'object' || Array.isArray(requested)) {
            throw siteInputError('템플릿 입력 설정 형식이 올바르지 않습니다.', 'SITE_HOSTING_SETUP_INPUT_INVALID');
        }
        const declared = template?.resource?.template?.setup_inputs || [];
        if (!Array.isArray(declared)) throw siteInputError('템플릿 입력 규격을 읽지 못했습니다.', 'SITE_HOSTING_TEMPLATE_MANIFEST_INVALID');
        const allowed = new Set(declared.map((item) => item.id));
        if (Object.keys(requested).some((key) => !allowed.has(key))) {
            throw siteInputError('템플릿에서 요청하지 않은 설정 항목입니다.', 'SITE_HOSTING_SETUP_INPUT_INVALID');
        }
        const normalized = {};
        for (const input of declared) {
            if (input.type === 'directory' && input.purpose === 'knowledge_collection') {
                const value = String(requested[input.id] || '').trim();
                if (!value) {
                    if (input.required && !allowMissingRequired) {
                        throw siteInputError(`${input.label || '폴더'}를 선택해 주세요.`, 'SITE_HOSTING_SETUP_INPUT_REQUIRED');
                    }
                    continue;
                }
                if (!pathApi.isAbsolute(value)) throw siteInputError('선택한 폴더 경로가 올바르지 않습니다.', 'SITE_HOSTING_SETUP_INPUT_INVALID');
                let resolved;
                try {
                    resolved = fileSystem.realpathSync(value);
                    if (!fileSystem.statSync(resolved).isDirectory()) throw new Error('not a directory');
                } catch (_error) {
                    throw siteInputError('선택한 폴더를 찾을 수 없습니다. 다시 선택해 주세요.', 'SITE_HOSTING_SETUP_INPUT_INVALID');
                }
                normalized[input.id] = resolved;
                continue;
            }
            if (input.type === 'frontmatter_match' && input.purpose === 'publication_filter') {
                const supplied = requested[input.id];
                if (supplied === undefined) {
                    if (input.required && !allowMissingRequired) {
                        throw siteInputError('공개 노트 기준의 속성명과 일치값을 입력해 주세요.', 'SITE_HOSTING_SETUP_INPUT_REQUIRED');
                    }
                    continue;
                }
                if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied)
                    || Object.keys(supplied).some((key) => !['mode', 'field', 'value'].includes(key))) {
                    throw siteInputError('공개 노트 기준 형식이 올바르지 않습니다.', 'SITE_HOSTING_SETUP_INPUT_INVALID');
                }
                const mode = supplied.mode || 'frontmatter';
                if (mode === 'all') {
                    normalized[input.id] = { mode: 'all' };
                    continue;
                }
                if (mode !== 'frontmatter') {
                    throw siteInputError('공개 노트 기준 형식이 올바르지 않습니다.', 'SITE_HOSTING_SETUP_INPUT_INVALID');
                }
                if (typeof supplied.field !== 'string' || typeof supplied.value !== 'string') {
                    throw siteInputError('속성명과 일치값은 문자열로 입력해 주세요.', 'SITE_HOSTING_SETUP_INPUT_INVALID');
                }
                const field = supplied.field.trim();
                const value = supplied.value.trim();
                if (!field || !value) {
                    if (input.required && !allowMissingRequired) {
                        throw siteInputError('공개 노트 기준의 속성명과 일치값을 모두 입력해 주세요.', 'SITE_HOSTING_SETUP_INPUT_REQUIRED');
                    }
                    continue;
                }
                if (field.length > 128 || value.length > 256 || /[\u0000-\u001f\u007f]/u.test(field + value)) {
                    throw siteInputError('공개 노트 기준은 속성명 128자, 일치값 256자 이내로 입력해 주세요.', 'SITE_HOSTING_SETUP_INPUT_INVALID');
                }
                normalized[input.id] = supplied.mode === undefined
                    ? { field, value }
                    : { mode: 'frontmatter', field, value };
                continue;
            }
            throw siteInputError('BlogGenius가 지원하지 않는 템플릿 입력 형식입니다.', 'SITE_HOSTING_SETUP_INPUT_UNSUPPORTED');
        }
        return normalized;
    }

    async function selectSetupDirectory(templateId, inputId) {
        let template = templates.get(templateId);
        const declaredInputs = template?.resource?.template?.setup_inputs;
        let setupInput = declaredInputs?.find((item) => item.id === inputId);
        if (Array.isArray(declaredInputs) && !setupInput) {
            throw siteInputError('선택한 템플릿은 이 폴더 입력을 요청하지 않습니다.', 'SITE_HOSTING_SETUP_INPUT_UNSUPPORTED');
        }
        if (setupInput && (setupInput.type !== 'directory' || setupInput.purpose !== 'knowledge_collection')) {
            throw siteInputError('선택한 템플릿은 이 폴더 입력을 요청하지 않습니다.', 'SITE_HOSTING_SETUP_INPUT_UNSUPPORTED');
        }
        let nativeDialog = deps.dialog;
        if (!nativeDialog) {
            try { nativeDialog = require('electron').dialog; } catch (_error) { }
        }
        if (typeof nativeDialog?.showOpenDialog !== 'function') {
            throw siteInputError('시스템 폴더 선택 창을 사용할 수 없습니다.', 'SITE_HOSTING_DIRECTORY_PICKER_UNAVAILABLE');
        }
        const result = await nativeDialog.showOpenDialog({
            title: `${setupInput?.label || '폴더'} 선택`,
            defaultPath: lastSetupDirectory || operatingSystem.homedir(),
            properties: ['openDirectory']
        });
        if (result?.canceled || !result?.filePaths?.[0]) return { cancelled: true };
        // Open the native picker before any catalog refresh or package download. Some templates
        // are cold in the local cache, and preparing them can involve remote I/O.
        if (!setupInput) {
            await templates.prepare?.(templateId);
            template = templates.get(templateId);
            setupInput = template?.resource?.template?.setup_inputs?.find((item) => item.id === inputId);
        }
        if (!setupInput || setupInput.type !== 'directory' || setupInput.purpose !== 'knowledge_collection') {
            throw siteInputError('선택한 템플릿은 이 폴더 입력을 요청하지 않습니다.', 'SITE_HOSTING_SETUP_INPUT_UNSUPPORTED');
        }
        // Validate the selected directory now; other required setup fields are collected separately
        // and are validated together when the user creates the Site.
        const setupInputs = normalizeSetupInputs(template, { [inputId]: result.filePaths[0] }, { allowMissingRequired: true });
        lastSetupDirectory = setupInputs[inputId];
        return { cancelled: false, path: setupInputs[inputId], name: pathApi.basename(setupInputs[inputId]) };
    }

    function localDate(value) {
        const date = new Date(value);
        if (Number.isNaN(date.valueOf())) return new Date().toISOString().slice(0, 10);
        const pad = (part) => String(part).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }

    function parseManuscript(markdownText) {
        const source = String(markdownText || '').replace(/^\uFEFF/u, '').trim();
        if (!source) throw siteInputError('Markdown 원고를 입력해 주세요.', 'SITE_HOSTING_POST_CONTENT_REQUIRED');
        if (Buffer.byteLength(source, 'utf8') > 1024 * 1024) throw siteInputError('원고는 1MB 이하로 입력해 주세요.', 'SITE_HOSTING_POST_TOO_LARGE');
        const heading = source.match(/^\s*#\s+(.+?)\s*$/mu);
        const title = String(heading?.[1] || '').trim();
        if (!title) throw siteInputError('원고 맨 앞에 `# 제목`을 입력해 주세요.', 'SITE_HOSTING_POST_TITLE_REQUIRED');
        const body = source.replace(heading[0], '').trim();
        const descriptionSource = replaceImageBlocks(body, () => '');
        const description = descriptionSource.split(/\r?\n/u)
            .map((line) => line.trim())
            .find((line) => line && !/^#{1,6}\s/u.test(line) && !/^```/u.test(line) && !/^\s*</u.test(line))
            ?.replace(/\s+/gu, ' ')
            .replace(/(?:\*\*|__|~~|`)/gu, '')
            .slice(0, 240) || title;
        return { title, description, body };
    }

    function decodeDraftImage(entry, expectedIndex) {
        const fileName = String(entry?.name || '');
        const match = fileName.match(/^(\d{2})_.+\.(png|jpe?g|webp|avif)$/iu);
        if (!match || Number.parseInt(match[1], 10) !== expectedIndex || pathApi.basename(fileName) !== fileName) return null;
        const extension = match[2].toLowerCase();
        const encoded = String(entry?.base64Data || '').replace(/^data:[^;,]+;base64,/iu, '');
        if (!encoded) return null;
        const bytes = Buffer.from(encoded, 'base64');
        if (!bytes.length || bytes.length > 10 * 1024 * 1024) return null;
        const signatures = {
            png: bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
            jpg: bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
            jpeg: bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
            webp: bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP',
            avif: bytes.length >= 12 && bytes.toString('ascii', 4, 8) === 'ftyp' && /^(?:avif|avis)$/u.test(bytes.toString('ascii', 8, 12))
        };
        if (!signatures[extension]) return null;
        return { extension: extension === 'jpeg' ? 'jpg' : extension, bytes };
    }

    function markdownImageAlt(value, fallback) {
        return String(value || fallback).replace(/[\\\[\]]/gu, '\\$&').replace(/[\r\n]+/gu, ' ').trim();
    }

    function createPostSlug(title, date) {
        const base = String(title || '').normalize('NFKD').toLocaleLowerCase('en-US')
            .replace(/[^a-z0-9]+/gu, '-')
            .replace(/^-|-$/gu, '')
            .slice(0, 48)
            .replace(/-$/u, '') || 'post';
        const suffix = String(createId()).toLocaleLowerCase('en-US').replace(/[^a-f0-9]/gu, '').slice(0, 8)
            || crypto.randomUUID().replace(/-/gu, '').slice(0, 8);
        return `${base}-${date.replace(/-/gu, '')}-${suffix}`;
    }

    async function openPath(targetPath) {
        const electron = require('electron');
        if (!electron?.shell?.openPath) throw new Error('시스템 파일 탐색기를 실행할 수 없습니다.');
        return electron.shell.openPath(targetPath);
    }

    async function openSiteAddress(projectId, siteId, addressType) {
        const site = repository.get(projectId, siteId);
        if (!site) {
            const error = new Error('사이트를 찾을 수 없습니다.');
            error.code = 'SITE_HOSTING_SITE_NOT_FOUND';
            error.status = 404;
            throw error;
        }
        let address = '';
        if (addressType === 'worker') address = String(site.deployment?.url || '');
        else if (addressType === 'domain') {
            const hostname = String(site.custom_domain_binding?.hostname || '').trim();
            if (hostname && !/[\s/\\?#@]/u.test(hostname)) address = `https://${hostname}/`;
        }
        let url;
        try { url = new URL(address); }
        catch (_error) { url = null; }
        if (!url || url.protocol !== 'https:' || !url.hostname || url.username || url.password) {
            const error = new Error('열 수 있는 배포 주소가 없습니다. 사이트 배포와 도메인 연결 상태를 확인해 주세요.');
            error.code = 'SITE_HOSTING_ADDRESS_UNAVAILABLE';
            error.status = 409;
            throw error;
        }
        await openExternal(url.href);
        return { opened: true };
    }

    function knowledgeCollectionSetupInput(site) {
        const template = templates.get(site?.template?.id);
        return (template?.resource?.template?.setup_inputs || []).find((input) =>
            input?.type === 'directory' && input?.purpose === 'knowledge_collection'
        ) || null;
    }

    function knowledgeCollectionRoot(site) {
        const input = knowledgeCollectionSetupInput(site);
        return input ? String(site?.setup_inputs?.[input.id] || '').trim() : '';
    }

    async function openKnowledgeCollectionFolder(projectId, siteId) {
        const site = repository.get(projectId, siteId);
        if (!site) throw siteInputError('사이트를 찾을 수 없습니다.', 'SITE_HOSTING_SITE_NOT_FOUND', 404);
        const root = knowledgeCollectionRoot(site);
        let resolvedRoot = '';
        try {
            resolvedRoot = fileSystem.realpathSync(root);
            if (!root || !fileSystem.statSync(resolvedRoot).isDirectory()) throw new Error('not a directory');
        } catch (_error) {
            throw siteInputError('연결된 Vault 폴더를 찾을 수 없습니다.', 'SITE_HOSTING_KNOWLEDGE_COLLECTION_NOT_FOUND', 404);
        }
        const openError = await (deps.openPath || openPath)(resolvedRoot);
        if (openError) throw new Error(`Vault 폴더를 열지 못했습니다: ${openError}`);
        return { opened: true };
    }

    async function openSitePost(projectId, siteId, postId) {
        const site = repository.get(projectId, siteId);
        if (!site) throw siteInputError('사이트를 찾을 수 없습니다.', 'SITE_HOSTING_SITE_NOT_FOUND', 404);
        const slug = String(postId || '').trim();
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug)) {
            throw siteInputError('글 주소를 확인할 수 없습니다.', 'SITE_HOSTING_POST_ID_INVALID', 400);
        }
        const workerUrl = String(site.deployment?.url || '');
        let baseUrl;
        try { baseUrl = new URL(workerUrl); } catch (_error) { baseUrl = null; }
        if (!baseUrl || baseUrl.protocol !== 'https:' || !baseUrl.hostname || baseUrl.username || baseUrl.password) {
            throw siteInputError('배포된 사이트 주소가 없습니다.', 'SITE_HOSTING_ADDRESS_UNAVAILABLE', 409);
        }
        const resource = templates.get(site.template?.id)?.resource;
        const postType = (resource?.family?.content_types || []).find((item) => item?.kind === 'post');
        const routeSettings = site.customization?.publishing || {
            listing_route: postType?.listing_route,
            detail_route: postType?.detail_route
        };
        const listingRoute = String(routeSettings?.listing_route || '');
        const detailRoute = String(routeSettings?.detail_route || '');
        if (!internalPathname(listingRoute) || !listingRoute.endsWith('/')
            || detailRoute !== `${listingRoute}{slug}/`
            || !internalPathname(detailRoute.replace('{slug}', slug))) {
            throw siteInputError('이 사이트의 글 주소를 확인할 수 없습니다.', 'SITE_HOSTING_PUBLISHING_ROUTE_MISSING', 409);
        }
        const url = new URL(detailRoute.replace('{slug}', encodeURIComponent(slug)), baseUrl);
        if (url.origin !== baseUrl.origin || url.protocol !== 'https:') {
            throw siteInputError('글 주소가 배포 사이트를 벗어납니다.', 'SITE_HOSTING_POST_URL_INVALID', 409);
        }
        await openExternal(url.href);
        return { opened: true };
    }

    async function deploy(projectId, siteId, context = {}) {
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

    async function postMarkdown(projectId, siteId, payload = {}, context = {}) {
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)
            || Object.keys(payload).some((key) => !['markdownText', 'postStatus', 'draftId', 'revision'].includes(key))) {
            throw siteInputError('Site 포스팅 요청 형식이 올바르지 않습니다.', 'SITE_HOSTING_POST_INPUT_INVALID');
        }
        const draftId = String(payload.draftId || '').trim();
        const draftRevision = payload.revision === undefined ? null : Number(payload.revision);
        if ((draftId && (!Number.isInteger(draftRevision) || draftRevision < 1)) || (!draftId && payload.revision !== undefined)) {
            throw siteInputError('원고 버전을 확인하지 못했습니다. 미리보기를 새로고침해 주세요.', 'SITE_HOSTING_POST_DRAFT_INVALID', 409);
        }
        const postStatus = String(payload.postStatus || '').trim().toLowerCase();
        if (!['draft', 'publish'].includes(postStatus)) {
            throw siteInputError('사이트 포스팅은 임시 저장 또는 즉시 발행만 지원합니다.', 'SITE_HOSTING_POST_STATUS_UNSUPPORTED');
        }
        const site = repository.get(projectId, siteId);
        if (!site) {
            const error = new Error('사이트를 찾을 수 없습니다.');
            error.code = 'SITE_HOSTING_SITE_NOT_FOUND';
            error.status = 404;
            throw error;
        }
        if (site.template_status !== 'available') {
            throw siteInputError('이 사이트의 템플릿을 사용할 수 없어 글을 저장할 수 없습니다.', 'SITE_HOSTING_TEMPLATE_UNAVAILABLE', 409);
        }
        const template = templates.get(site.template?.id);
        const resource = template?.resource;
        const family = resource?.family;
        const postType = (family?.content_types || []).find((item) => item?.kind === 'post');
        if (!isSupportedSiteHostingContractVersion(resource?.spec_version) || family?.content_contract_version !== resource.spec_version
            || resource?.template?.compatibility?.contract?.version !== resource.spec_version
            || !postType || typeof postType.source !== 'string') {
            throw siteInputError('이 템플릿은 현재 Site Hosting 계약을 지원하지 않습니다.', 'SITE_HOSTING_POST_CONTRACT_UNSUPPORTED', 409);
        }
        const routeSettings = site.customization?.publishing || {
            listing_route: postType.listing_route,
            detail_route: postType.detail_route
        };
        const listingRoute = String(routeSettings.listing_route || '');
        const detailRoutePattern = String(routeSettings.detail_route || '');
        if (!internalPathname(listingRoute) || !listingRoute.endsWith('/')
            || detailRoutePattern !== `${listingRoute}{slug}/`
            || !internalPathname(detailRoutePattern.replace('{slug}', 'post-check'))) {
            throw siteInputError('이 사이트에서 글 목록과 상세 주소를 확인할 수 없습니다.', 'SITE_HOSTING_PUBLISHING_ROUTE_MISSING', 409);
        }
        const sourceMatch = postType.source.match(/^((?:[A-Za-z0-9_-]+\/)*)\{slug\}\/index\.md$/u);
        if (!sourceMatch) throw siteInputError('템플릿의 글 저장 경로가 올바르지 않습니다.', 'SITE_HOSTING_POST_CONTRACT_INVALID', 409);

        let publishDraft = null;
        if (draftId) {
            if (typeof manuscriptDraftService?.buildPublishPayload !== 'function') {
                throw siteInputError('원고 이미지 작업공간에 접근할 수 없습니다.', 'SITE_HOSTING_DRAFT_SERVICE_UNAVAILABLE', 503);
            }
            publishDraft = manuscriptDraftService.buildPublishPayload({ draftId, revision: draftRevision });
        }
        const draftMarkdown = publishDraft?.selectedFiles?.find((file) => /\.(?:md|markdown)$/iu.test(String(file?.name || '')))?.textContent;
        const manuscript = parseManuscript(draftMarkdown ?? payload.markdownText);
        const timestamp = now();
        const date = localDate(timestamp);
        const slug = createPostSlug(manuscript.title, date);
        const publication = postStatus === 'draft' ? 'none' : 'public';
        const editorialStatus = postStatus === 'draft' ? 'draft' : 'complete';
        const availableImages = new Map();
        for (const entry of publishDraft?.selectedFiles || []) {
            const match = String(entry?.name || '').match(/^(\d{2})_.+\.(?:png|jpe?g|webp|avif)$/iu);
            if (!match) continue;
            const index = Number.parseInt(match[1], 10);
            if (availableImages.has(index)) throw siteInputError(`이미지 ${index}번이 여러 개 연결되어 있습니다. 원고 미리보기를 새로고침해 주세요.`, 'SITE_HOSTING_IMAGE_MAPPING_AMBIGUOUS', 409);
            availableImages.set(index, entry);
        }
        const imageAssets = new Map();
        let coverImage = null;
        const body = replaceImageBlocks(manuscript.body, (block) => {
            const entry = availableImages.get(block.index);
            if (!entry) {
                if (publication === 'none') return block.fullTag;
                throw siteInputError(`이미지 ${block.index}번 파일을 찾지 못했습니다. 이미지가 준비된 뒤 발행해 주세요.`, 'SITE_HOSTING_IMAGE_MISSING', 409);
            }
            const image = decodeDraftImage(entry, block.index);
            if (!image) throw siteInputError(`이미지 ${block.index}번 파일을 읽을 수 없습니다. PNG, JPEG, WebP 또는 AVIF 이미지를 확인해 주세요.`, 'SITE_HOSTING_IMAGE_INVALID', 400);
            const fileName = `image-${block.index}.${image.extension}`;
            imageAssets.set(fileName, image.bytes);
            const alt = markdownImageAlt(block.title, `이미지 ${block.index + 1}`);
            if (!coverImage || block.start < coverImage.start) coverImage = { start: block.start, fileName, alt };
            return `![${alt}](./images/${fileName})`;
        });
        if (publication === 'public' && /\[\[IMAGE_\d+/u.test(body)) {
            throw siteInputError('이미지 자리표시자를 처리하지 못했습니다. 원고 미리보기를 새로고침한 뒤 다시 발행해 주세요.', 'SITE_HOSTING_IMAGE_MARKER_UNSUPPORTED', 409);
        }
        const frontmatter = [
            '---',
            'kind: post',
            `title: ${JSON.stringify(manuscript.title)}`,
            `description: ${JSON.stringify(manuscript.description)}`,
            ...(coverImage ? [`cover: ${JSON.stringify(`./images/${coverImage.fileName}`)}`, `cover_alt: ${JSON.stringify(coverImage.alt)}`] : []),
            `date: ${date}`,
            ...(publication === 'public' ? [`published_at: ${JSON.stringify(timestamp)}`] : []),
            `editorial_status: ${editorialStatus}`,
            `publication: ${publication}`,
            '---',
            body
        ].join('\n').trimEnd() + '\n';

        const siteRoot = pathApi.resolve(site.root_path);
        const siteDataRoot = pathApi.resolve(siteRoot, 'site-data');
        const postsRoot = pathApi.resolve(siteDataRoot, ...sourceMatch[1].split('/').filter(Boolean));
        const isWithin = (root, target) => {
            const relative = pathApi.relative(root, target);
            return relative === '' || (!relative.startsWith(`..${pathApi.sep}`) && relative !== '..' && !pathApi.isAbsolute(relative));
        };
        if (!isWithin(siteRoot, siteDataRoot) || !isWithin(siteDataRoot, postsRoot)) {
            throw siteInputError('템플릿의 글 저장 경로가 사이트 폴더를 벗어납니다.', 'SITE_HOSTING_POST_PATH_INVALID', 409);
        }
        fileSystem.mkdirSync(postsRoot, { recursive: true });
        const realSiteRoot = fileSystem.realpathSync(siteRoot);
        const realSiteDataRoot = fileSystem.realpathSync(siteDataRoot);
        const realPostsRoot = fileSystem.realpathSync(postsRoot);
        if (!isWithin(realSiteRoot, realSiteDataRoot) || !isWithin(realSiteDataRoot, realPostsRoot)) {
            throw siteInputError('글 저장 경로가 사이트 데이터 폴더를 벗어납니다.', 'SITE_HOSTING_POST_PATH_INVALID', 409);
        }
        const postDirectory = pathApi.join(realPostsRoot, slug);
        try {
            fileSystem.mkdirSync(postDirectory, { recursive: false, mode: 0o700 });
        } catch (cause) {
            if (cause?.code === 'EEXIST') throw siteInputError('같은 글 경로가 이미 있습니다. 원고를 다시 포스팅해 주세요.', 'SITE_HOSTING_POST_ALREADY_EXISTS', 409);
            throw cause;
        }
        try {
            if (imageAssets.size) {
                const imagesDirectory = pathApi.join(postDirectory, 'images');
                fileSystem.mkdirSync(imagesDirectory, { recursive: true, mode: 0o700 });
                for (const [fileName, bytes] of imageAssets) {
                    fileSystem.writeFileSync(pathApi.join(imagesDirectory, fileName), bytes, { flag: 'wx', mode: 0o600 });
                }
            }
            fileSystem.writeFileSync(pathApi.join(postDirectory, 'index.md'), frontmatter, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
        } catch (cause) {
            try { fileSystem.rmSync(postDirectory, { recursive: true, force: true }); } catch (_cleanupError) { }
            throw cause;
        }

        if (publication === 'none') {
            return { status: '사이트에 임시 저장했습니다.', postStatus: 'draft', post_id: slug, publication, date };
        }
        try {
            const deployed = await deploy(projectId, siteId, context);
            const detailRoute = String(routeSettings.detail_route).replace('{slug}', encodeURIComponent(slug));
            let postUrl = '';
            try { postUrl = deployed.url ? new URL(detailRoute, deployed.url).href : ''; } catch (_error) { }
            return {
                status: '사이트에 글을 발행하고 배포했습니다.',
                postStatus: 'publish',
                post_id: slug,
                publication,
                date,
                deployed_at: deployed.deployed_at,
                ...(postUrl ? { post_url: postUrl } : {}),
                ...(deployed.screenshot_error ? { screenshot_error: deployed.screenshot_error } : {})
            };
        } catch (cause) {
            const error = new Error(`글은 사이트에 저장했지만 빌드 또는 배포에 실패했습니다. 다시 배포하면 반영됩니다. (${cause?.message || '배포 오류'})`);
            error.code = 'SITE_HOSTING_POST_SAVED_DEPLOY_FAILED';
            error.status = Number.isInteger(cause?.status) ? cause.status : 502;
            error.cause = cause;
            throw error;
        }
    }

    function createSite(projectId, name, templateId, id = createId(), customization = {}, setupInputs = {}) {
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
        const created = repository.create(project.id, { id, name, template_id: templateId, customization, setup_inputs: setupInputs, created_at: timestamp, updated_at: timestamp });
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
            if (isSupportedSiteHostingContractVersion(resource?.spec_version)) {
                const seedSite = resource.family_seed_site || {};
                const postType = (resource.family?.content_types || []).find((type) => type.kind === 'post');
                const pageType = (resource.family?.content_types || []).find((type) => type.kind === 'page');
                const publishing = postType?.listing_route && postType?.detail_route
                    ? { routes: { listing: postType.listing_route, detail: postType.detail_route } }
                    : null;
                return {
                    ...template,
                    author: String(resource.template.author || '').trim().slice(0, 100),
                    homepage_url: normalizeHomepageUrl(resource.template.homepage),
                    categories: resource.template.categories,
                    tags: resource.template.tags,
                    status: resource.template.status,
                    setup_inputs: Array.isArray(resource.template.setup_inputs) ? resource.template.setup_inputs : [],
                    customization: [{ key: 'navigation', type: 'array', label: '사이트 메뉴', default: (seedSite.navigation || []).map((item) => ({ ...(item.id ? { id: item.id } : {}), label: item.label, href: item.path })) }],
                    ...(pageType ? { pages: { max_items: 20, route_pattern: '/{slug}/', reserved_slugs: ['blog', 'work', 'services'] } } : {}),
                    ...(publishing ? { publishing } : {}),
                    preview_url: template.preview_url || `/api/v1/site-hosting/templates/${encodeURIComponent(template.id)}/preview`
                };
            }
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
        const sites = repository.list(projectId);
        return sites.map((site) => {
            const { id, project_id, name, template, template_name, template_status, template_update_available, available_template_version, hostname, domain, deployment, custom_domain_binding, screenshot, last_build, created_at, updated_at } = site;
            const root = knowledgeCollectionRoot(site);
            return {
                id, project_id, name, template, template_name, template_status, template_update_available, available_template_version, hostname, domain: domain || '',
                custom_domain: formatCustomDomain(hostname, domain), deployment, custom_domain_binding, screenshot, last_build,
                knowledge_collection: root ? { name: pathApi.basename(root) || root } : null,
                screenshot_url: screenshot?.latest_build?.path || screenshot?.template?.path
                    ? `/api/v1/site-hosting/projects/${encodeURIComponent(project_id)}/sites/${encodeURIComponent(id)}/screenshot`
                    : '',
                created_at, updated_at
            };
        });
    }

    async function create(projectId, payload = {}) {
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)
            || Object.keys(payload).some((key) => !['name', 'template_id', 'customization', 'setup_inputs'].includes(key))) {
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
        const template = templates.get(templateId);
        const customization = normalizeSiteCustomization(template, payload.customization || {});
        const setupInputs = normalizeSetupInputs(template, payload.setup_inputs || {});
        return createSite(projectId, name, templateId, createId(), customization, setupInputs);
    }

    async function createAndBuild(projectId, payload = {}) {
        const site = await create(projectId, payload);
        let build = null;
        let build_error = '';
        try {
            build = await astroRuntime.build(projectId, site.id);
        } catch (error) {
            build_error = String(error?.message || '사이트 생성 후 자동 빌드에 실패했습니다.');
        }
        return {
            ...site,
            screenshot: build?.screenshot || null,
            screenshot_error: build?.screenshot_error || '',
            build_error
        };
    }

    async function previewDraft(projectId, payload = {}) {
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)
            || Object.keys(payload).some((key) => !['name', 'template_id', 'customization', 'setup_inputs'].includes(key))) {
            throw siteInputError('미리보기 요청에 허용되지 않은 항목이 포함되어 있습니다.', 'SITE_HOSTING_CREATE_INPUT_INVALID');
        }
        if (!projectRepository.get(projectId)) {
            const error = new Error('프로젝트를 찾을 수 없습니다.');
            error.code = 'SITE_HOSTING_PROJECT_NOT_FOUND';
            error.status = 404;
            throw error;
        }
        const requestedName = String(payload.name || '').trim();
        if (requestedName.length > 80) throw siteInputError('사이트 이름은 80자 이내로 입력해 주세요.', 'SITE_HOSTING_SITE_NAME_TOO_LONG');
        const templateId = String(payload.template_id || '').trim();
        await templates.prepare?.(templateId);
        const template = templates.get(templateId);
        const customization = normalizeSiteCustomization(template, payload.customization || {});
        const setupInputs = normalizeSetupInputs(template, payload.setup_inputs || {}, { allowMissingRequired: true });
        const name = requestedName || String(template?.resource?.family_seed_site?.displayName
            || template?.resource?.site_hosting?.customization?.fields?.find((field) => field.key === 'site_name')?.default
            || '미리보기').trim();
        const draft = repository.createPreviewDraft(projectId, {
            id: `draft_${createId()}`,
            name,
            template_id: templateId,
            customization,
            setup_inputs: setupInputs
        });
        try {
            const preview = await astroRuntime.startDraftPreview(draft);
            const timeout = setTimeout(() => { void stopDraftPreview(projectId, draft.id); }, 30 * 60 * 1000);
            timeout.unref?.();
            draftPreviews.set(draft.id, { project_id: projectId, draft, timeout });
            return { id: draft.id, url: preview.url, knowledge_collection: preview.knowledge_collection || null };
        } catch (error) {
            repository.removePreviewDraft(draft);
            throw error;
        }
    }

    function getSettings(projectId, siteId) {
        const site = repository.get(projectId, siteId);
        if (!site) throw siteInputError('사이트를 찾을 수 없습니다.', 'SITE_HOSTING_SITE_NOT_FOUND', 404);
        const template = templates.get(site.template?.id);
        if (!isSupportedSiteHostingContractVersion(template?.resource?.spec_version)) {
            throw siteInputError('이 템플릿은 설정 미리보기를 지원하지 않습니다.', 'SITE_HOSTING_SETTINGS_UNAVAILABLE', 409);
        }
        const customization = { ...(site.customization || {}) };
        for (const [key, field] of [['logo', 'logo'], ['share_image', 'shareImage'], ['favicon', 'favicon']]) {
            const publicPath = String(site.customization?.[key] || '');
            const fileName = publicPath.startsWith('/') ? pathApi.basename(publicPath) : '';
            if (!fileName || fileName !== publicPath.slice(1) || !/^[\w.-]+\.(?:png|jpg|webp)$/u.test(fileName)) {
                delete customization[key];
                continue;
            }
            const assetPath = pathApi.join(site.root_path, 'site-data', 'public', fileName);
            if (!fileSystem.existsSync(assetPath)) { delete customization[key]; continue; }
            const bytes = fileSystem.readFileSync(assetPath);
            if (bytes.length > 1024 * 1024) { delete customization[key]; continue; }
            const mime = fileName.endsWith('.png') ? 'image/png' : fileName.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
            customization[key] = `data:${mime};base64,${bytes.toString('base64')}`;
        }
        const setupInputs = { ...(site.setup_inputs || {}) };
        return { id: site.id, name: site.name, template_id: site.template.id, customization, setup_inputs: setupInputs };
    }

    async function applySettings(projectId, siteId, payload = {}) {
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)
            || Object.keys(payload).some((key) => !['name', 'template_id', 'customization', 'setup_inputs'].includes(key))) {
            throw siteInputError('설정 요청에 허용되지 않은 항목이 포함되어 있습니다.', 'SITE_HOSTING_CREATE_INPUT_INVALID');
        }
        const current = repository.get(projectId, siteId);
        if (!current) throw siteInputError('사이트를 찾을 수 없습니다.', 'SITE_HOSTING_SITE_NOT_FOUND', 404);
        if (String(payload.template_id || '') !== String(current.template?.id || '')) {
            throw siteInputError('사이트 템플릿은 설정에서 변경할 수 없습니다.', 'SITE_HOSTING_TEMPLATE_CHANGE_NOT_ALLOWED', 400);
        }
        const name = String(payload.name || '').trim();
        if (!name) throw siteInputError('사이트 이름을 입력해 주세요.', 'SITE_HOSTING_SITE_NAME_REQUIRED');
        if (name.length > 80) throw siteInputError('사이트 이름은 80자 이내로 입력해 주세요.', 'SITE_HOSTING_SITE_NAME_TOO_LONG');
        const template = templates.get(current.template?.id);
        await templates.prepare?.(current.template?.id);
        const customization = normalizeSiteCustomization(template, payload.customization || {});
        const setupInputs = normalizeSetupInputs(template, payload.setup_inputs || {}, { allowMissingRequired: false });
        const updated = repository.updateSettings(projectId, siteId, { name, customization, setup_inputs: setupInputs, updated_at: now() });
        let build = null;
        let build_error = '';
        try { build = await astroRuntime.build(projectId, siteId); }
        catch (error) { build_error = String(error?.message || '설정을 반영한 사이트 생성에 실패했습니다.'); }
        return {
            id: updated.id, project_id: updated.project_id, name: updated.name,
            template: updated.template, template_name: updated.template_name,
            screenshot: build?.screenshot || null, screenshot_error: build?.screenshot_error || '',
            build_error, updated_at: updated.updated_at
        };
    }

    async function stopDraftPreview(projectId, draftId) {
        const entry = draftPreviews.get(String(draftId || ''));
        if (!entry || entry.project_id !== projectId) return { stopped: false };
        draftPreviews.delete(String(draftId));
        clearTimeout(entry.timeout);
        try { return await astroRuntime.stopDraftPreview(projectId, draftId); }
        finally { repository.removePreviewDraft(entry.draft); }
    }

    function normalizeSiteCustomization(template, input) {
        if (!input || typeof input !== 'object' || Array.isArray(input)) {
            throw siteInputError('사이트 설정 형식이 올바르지 않습니다.', 'SITE_HOSTING_NAVIGATION_INVALID');
        }
        const siteHosting = template?.resource?.site_hosting;
        if (isSupportedSiteHostingContractVersion(template?.resource?.spec_version)) {
            const seedSite = template.resource.family_seed_site || {};
            const profileFields = template.resource.family?.site_profile?.fields || {};
            const profileInputKeys = {
                site_description: 'seoDescription',
                share_image: 'shareImage',
                favicon: 'favicon',
                search_engine_indexing: 'searchEngineIndexing'
            };
            const allowedInputKeys = new Set(['navigation', 'publishing']);
            if (Object.hasOwn(profileFields, 'logo')) allowedInputKeys.add('logo');
            for (const [inputKey, profileKey] of Object.entries(profileInputKeys)) {
                if (Object.hasOwn(profileFields, profileKey)) allowedInputKeys.add(inputKey);
            }
            if (Object.keys(input).some((key) => !allowedInputKeys.has(key))) {
                throw siteInputError('사이트 설정에 허용되지 않은 항목이 포함되어 있습니다.', 'SITE_HOSTING_SITE_PROFILE_INVALID');
            }
            const navigationDefaults = Array.isArray(seedSite.navigation) ? seedSite.navigation.map((item) => ({ id: item.id, label: item.label, href: item.path })) : [];
            const postType = (template.resource.family?.content_types || []).find((type) => type.kind === 'post');
            const requestedNavigation = Array.isArray(input.navigation) ? input.navigation : navigationDefaults;
            if (!requestedNavigation.length || requestedNavigation.length > 50) throw siteInputError('메뉴는 1개 이상, 50개 이내로 입력해 주세요.', 'SITE_HOSTING_NAVIGATION_INVALID');
            const normalizedInput = requestedNavigation.map((entry, index) => {
                if (!entry || typeof entry !== 'object' || Array.isArray(entry)
                    || Object.keys(entry).some((key) => key !== 'id' && key !== 'label' && key !== 'href')) throw siteInputError('메뉴에는 이름과 주소만 지정할 수 있습니다.', 'SITE_HOSTING_NAVIGATION_INVALID');
                const label = normalizeMenuLabel(entry.label);
                const defaultItem = entry.id ? navigationDefaults.find((item) => item.id === entry.id) : navigationDefaults[index];
                if (entry.id && !defaultItem) throw siteInputError('템플릿 메뉴 ID가 올바르지 않습니다.', 'SITE_HOSTING_NAVIGATION_INVALID');
                return { ...(defaultItem?.id ? { id: defaultItem.id } : {}), label, href: String(entry.href || '').trim() || defaultItem?.href || `/${encodeURIComponent(createPageSlug(label))}/` };
            });
            let navigation;
            try { navigation = normalizeNavigationItems(normalizedInput, { maxItems: 50 }); }
            catch (cause) { throw siteInputError(cause.message, cause.code || 'SITE_HOSTING_NAVIGATION_INVALID'); }
            const output = { navigation };
            const defaultIds = new Set(navigationDefaults.map((entry) => entry.id).filter(Boolean));
            const defaultPaths = new Set(navigationDefaults.map((entry) => normalizeMenuDestination(entry.href)));
            const postListIndex = input.publishing?.post_list_navigation_index;
            if (input.publishing !== undefined && (!input.publishing || typeof input.publishing !== 'object' || Array.isArray(input.publishing)
                || Object.keys(input.publishing).some((key) => key !== 'post_list_navigation_index'))) {
                throw siteInputError('글 목록 메뉴 설정이 올바르지 않습니다.', 'SITE_HOSTING_POST_LIST_MENU_INVALID');
            }
            if (postType && postListIndex !== undefined) {
                if (!Number.isInteger(postListIndex) || postListIndex < 0 || postListIndex >= navigation.length) throw siteInputError('글 목록으로 연결할 메뉴를 선택해 주세요.', 'SITE_HOSTING_POST_LIST_MENU_REQUIRED');
                const selected = navigation[postListIndex].href;
                const route = normalizeMenuDestination(selected);
                if (!internalPathname(route) || !route.endsWith('/')) throw siteInputError('글 목록 주소는 내부 경로이고 / 로 끝나야 합니다.', 'SITE_HOSTING_POST_LIST_MENU_INVALID');
                output.publishing = {
                    listing_route: route,
                    detail_route: `${route}{slug}/`,
                    post_list_navigation_index: postListIndex
                };
            }
            const customPages = navigation
                .filter(({ id, href }, index) => !defaultIds.has(id)
                    && !defaultPaths.has(href)
                    && !navigation.some((item) => item.id && item.href === href)
                    && index !== postListIndex && internalPathname(href))
                .map(({ label, href }) => {
                    const route = internalPathname(href);
                    const slug = `custom-${crypto.createHash('sha256').update(route).digest('hex').slice(0, 32)}`;
                    return { label, path: route, slug };
                })
                .filter((page) => ![...defaultPaths, ...(template.resource.family?.content_types || []).map((item) => item.listing_route).filter(Boolean)]
                    .some((reservedPath) => internalPathname(reservedPath) === page.path))
                .filter((page, index, all) => all.findIndex((candidate) => candidate.path === page.path) === index)
                .slice(0, 20);
            if (customPages.length) output.custom_pages = customPages;
            if (input.logo) output.logo = normalizeSiteProfileImage(input.logo, '로고');
            if (input.site_description !== undefined) {
                if (typeof input.site_description !== 'string' || input.site_description.length > 300) {
                    throw siteInputError('사이트 설명은 300자 이내로 입력해 주세요.', 'SITE_HOSTING_SITE_DESCRIPTION_INVALID');
                }
                const description = input.site_description.trim();
                if (description) output.site_description = description;
            }
            if (input.share_image) output.share_image = normalizeSiteProfileImage(input.share_image, '사이트 대표 이미지');
            if (input.favicon) output.favicon = normalizeSiteProfileImage(input.favicon, 'Favicon');
            if (input.search_engine_indexing !== undefined) {
                if (typeof input.search_engine_indexing !== 'boolean') {
                    throw siteInputError('검색엔진 노출 설정이 올바르지 않습니다.', 'SITE_HOSTING_SEARCH_INDEXING_INVALID');
                }
                output.search_engine_indexing = input.search_engine_indexing;
            } else {
                output.search_engine_indexing = profileFields.searchEngineIndexing?.default !== false;
            }
            return output;
        }
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
                    .filter((page, index, all) => all.findIndex((candidate) => candidate.slug.toLocaleLowerCase('en-US') === page.slug.toLocaleLowerCase('en-US')) === index)
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
            if (!internalPathname(listingRoute) || internalPathname(listingRoute) !== listingRoute || !listingRoute.endsWith('/')) {
                throw siteInputError('글 목록 주소는 내부 경로이고 / 로 끝나야 합니다.', 'SITE_HOSTING_POST_LIST_MENU_INVALID');
            }
            const detailRoute = publishing.routes.detail.replace(publishing.routes.listing, listingRoute);
            output.publishing = {
                listing_route: listingRoute,
                detail_route: detailRoute,
                post_list_navigation_index: postListIndex
            };
        }
        if (declared.has('logo') && input.logo) output.logo = normalizeSiteProfileImage(input.logo, '로고');
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

    function normalizeSiteProfileImage(value, label = '이미지') {
        const match = String(value || '').match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
        const errorCode = label === '로고' ? 'SITE_HOSTING_LOGO_INVALID' : 'SITE_HOSTING_SITE_PROFILE_IMAGE_INVALID';
        if (!match) throw siteInputError(`${label}는 PNG, JPG 또는 WebP 이미지로 선택해 주세요.`, errorCode);
        const bytes = Buffer.from(match[2], 'base64');
        if (!bytes.length || bytes.length > 1024 * 1024) throw siteInputError(`${label}는 1MB 이하로 선택해 주세요.`, `${errorCode}_TOO_LARGE`);
        const signatures = { png: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), jpeg: Buffer.from([0xff, 0xd8, 0xff]), webp: Buffer.from('RIFF') };
        if (!bytes.subarray(0, signatures[match[1]].length).equals(signatures[match[1]])
            || (match[1] === 'webp' && bytes.toString('ascii', 8, 12) !== 'WEBP')) {
            throw siteInputError(`${label} 이미지 형식이 올바르지 않습니다.`, errorCode);
        }
        return { extension: match[1] === 'jpeg' ? 'jpg' : match[1], content: bytes };
    }

    function siteInputError(message, code, status = 400) {
        const error = new Error(message);
        error.code = code;
        error.status = Number.isInteger(status) ? status : 400;
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

    async function updateTemplate(projectId, siteId) {
        const current = repository.get(projectId, siteId);
        if (!current) throw siteInputError('사이트를 찾을 수 없습니다.', 'SITE_HOSTING_SITE_NOT_FOUND', 404);
        await templates.prepare?.(current.template?.id);
        const updated = repository.applyTemplateUpdate(projectId, siteId, now());
        let build = null;
        let build_error = '';
        try {
            build = await astroRuntime.build(projectId, siteId);
        } catch (error) {
            build_error = String(error?.message || '템플릿 업데이트 후 자동 빌드에 실패했습니다.');
        }
        return {
            id: updated.id,
            project_id: updated.project_id,
            template: updated.template,
            template_name: updated.template_name,
            template_status: updated.template_status,
            template_update_available: updated.template_update_available,
            available_template_version: updated.available_template_version,
            screenshot: build?.screenshot || null,
            screenshot_error: build?.screenshot_error || '',
            build_error,
            updated_at: updated.updated_at
        };
    }

    function prepareTemplateUpdateTest(projectId, siteId) {
        const runtimeEnvironment = deps.runtimeEnvironment;
        const environment = typeof runtimeEnvironment === 'string'
            ? runtimeEnvironment
            : runtimeEnvironment?.environment;
        if (environment !== 'development') {
            throw siteInputError('템플릿 업데이트 테스트는 개발 모드에서만 사용할 수 있습니다.', 'SITE_HOSTING_TEMPLATE_UPDATE_TEST_DEVELOPMENT_ONLY', 403);
        }
        const updated = repository.setTemplateUpdateTestVersion(projectId, siteId);
        return {
            id: updated.id,
            project_id: updated.project_id,
            template: updated.template,
            template_update_available: updated.template_update_available,
            available_template_version: updated.available_template_version
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

    async function disconnectWorker(projectId, siteId, payload = {}) {
        const site = repository.get(projectId, siteId);
        if (!site) throw siteInputError('사이트를 찾을 수 없습니다.', 'SITE_HOSTING_SITE_NOT_FOUND', 404);
        if (payload.confirmed !== true) {
            throw siteInputError('기본 연결 해제 확인이 필요합니다.', 'SITE_HOSTING_WORKER_DISCONNECT_CONFIRMATION_REQUIRED', 400);
        }
        if (String(site.custom_domain_binding?.hostname || '').trim()) {
            throw siteInputError('기본 연결을 해제하기 전에 연결 도메인을 먼저 해지해 주세요.', 'SITE_HOSTING_CUSTOM_DOMAIN_MUST_BE_DISCONNECTED', 409);
        }
        const deployment = site.deployment || {};
        const workerName = String(deployment.worker_name || '').trim();
        const workerAccountId = String(deployment.worker_account_id || '').trim();
        const workerCreatedOn = String(deployment.worker_created_on || '').trim();
        const deploymentId = String(deployment.deployment_id || '').trim();
        const versionId = String(deployment.version_id || '').trim();
        if (deployment.managed_by_app !== true || !workerName || !workerAccountId || !workerCreatedOn || !deploymentId || !versionId) {
            throw siteInputError('Worker 소유권을 확인할 수 없어 자동 해지하지 않았습니다. Cloudflare 대시보드에서 Worker를 직접 확인하고 해지해 주세요.', 'SITE_HOSTING_WORKER_OWNERSHIP_UNVERIFIED', 409);
        }

        const { credentials, adapter } = await getCloudflareAdapter();
        const accountId = String(credentials.account.id);
        if (accountId !== workerAccountId) {
            throw siteInputError('현재 연결된 Cloudflare 계정이 Worker를 생성한 계정과 달라 해지하지 않았습니다. 원래 계정으로 다시 연결해 주세요.', 'SITE_HOSTING_WORKER_ACCOUNT_CHANGED', 409);
        }
        const fail = (message, code = 'SITE_HOSTING_WORKER_DISCONNECT_PREFLIGHT_FAILED', status = 409) => siteInputError(message, code, status);
        const readSnapshot = async () => {
            if (typeof adapter.listWorkerScripts !== 'function'
                || typeof adapter.listWorkerDomains !== 'function'
                || typeof adapter.listDeployments !== 'function') {
                throw fail('Cloudflare Worker 상태를 확인할 수 없어 해지하지 않았습니다. 앱을 업데이트한 뒤 다시 시도해 주세요.', 'SITE_HOSTING_WORKER_DISCONNECT_PREFLIGHT_UNAVAILABLE', 503);
            }
            const scripts = (await adapter.listWorkerScripts(accountId))
                .filter((item) => String(item?.id || item?.name || '') === workerName);
            if (scripts.length > 1) throw fail('같은 이름의 Worker가 여러 개 확인되어 해지하지 않았습니다. Cloudflare에서 직접 확인해 주세요.');
            const worker = scripts[0] || null;
            if (worker && String(worker.created_on || '') !== workerCreatedOn) {
                throw fail('Cloudflare Worker의 생성 정보가 저장된 정보와 달라 소유권을 확인할 수 없습니다. Cloudflare에서 직접 확인해 주세요.', 'SITE_HOSTING_WORKER_OWNERSHIP_CHANGED');
            }
            const bindings = (await adapter.listWorkerDomains({ accountId }))
                .filter((item) => String(item?.service || '').trim() === workerName)
                .map((item) => ({
                    id: String(item.id || ''), hostname: String(item.hostname || '').trim().toLowerCase(),
                    zone_id: String(item.zone_id || ''), environment: String(item.environment || '')
                }))
                .sort((left, right) => `${left.hostname}:${left.id}`.localeCompare(`${right.hostname}:${right.id}`));
            if (bindings.length) throw fail('이 Worker에 연결된 도메인이 있어 기본 연결을 해지하지 않았습니다. 연결 도메인을 먼저 해지해 주세요.', 'SITE_HOSTING_CUSTOM_DOMAIN_MUST_BE_DISCONNECTED');
            if (!worker) return { worker: null, bindings, deployment: null };
            const deployments = await adapter.listDeployments({ accountId, workerName });
            const activeDeployment = deployments.find((item) => String(item?.id || '') === deploymentId);
            const versionIsActive = activeDeployment?.versions?.some((item) => String(item?.version_id || '') === versionId
                && Number(item?.percentage) === 100) === true;
            if (!versionIsActive) {
                throw fail('Cloudflare Worker의 현재 배포가 저장된 상태와 달라 안전하게 해지할 수 없습니다. Cloudflare에서 직접 확인해 주세요.', 'SITE_HOSTING_WORKER_DEPLOYMENT_CHANGED');
            }
            return {
                worker: { id: String(worker.id || ''), created_on: String(worker.created_on || '') },
                bindings,
                deployment: { id: deploymentId, version_id: versionId, active: versionIsActive }
            };
        };

        let before;
        try {
            before = await readSnapshot();
            const current = await readSnapshot();
            if (JSON.stringify(before) !== JSON.stringify(current)) {
                throw fail('확인 중 Cloudflare Worker 상태가 바뀌어 해지하지 않았습니다. 상태를 확인한 뒤 다시 시도해 주세요.');
            }
            if (!before.worker) {
                const updated = repository.clearDeployment(projectId, siteId, now());
                return { worker_name: workerName, deployment: updated.deployment || null, disconnected: true, already_absent: true };
            }
            if (typeof adapter.deleteWorker !== 'function') {
                throw fail('Cloudflare Worker 삭제 기능을 사용할 수 없어 해지하지 않았습니다. 앱을 업데이트한 뒤 다시 시도해 주세요.', 'SITE_HOSTING_WORKER_DELETE_UNAVAILABLE', 503);
            }
            await adapter.deleteWorker({ accountId, workerName });
        } catch (cause) {
            if (cause?.code?.startsWith?.('SITE_HOSTING_')) throw cause;
            const status = Number(cause?.status);
            throw siteInputError(status === 401 || status === 403
                ? 'Cloudflare Worker 삭제 권한이 없습니다. OAuth Client의 Workers Scripts Write 권한을 확인해 주세요.'
                : String(cause?.message || 'Cloudflare Worker를 해지하지 못했습니다. 사이트 연결 정보는 보존했습니다.'),
            status === 401 || status === 403 ? 'CLOUDFLARE_WORKER_DELETE_PERMISSION_DENIED' : 'SITE_HOSTING_WORKER_DELETE_FAILED', status || 502);
        }

        let after = null;
        for (let attempt = 0; attempt < 5; attempt += 1) {
            try {
                const scripts = (await adapter.listWorkerScripts(accountId))
                    .filter((item) => String(item?.id || item?.name || '') === workerName);
                const bindings = (await adapter.listWorkerDomains({ accountId }))
                    .filter((item) => String(item?.service || '').trim() === workerName);
                after = { worker_count: scripts.length, binding_count: bindings.length };
                if (after.worker_count === 0 && after.binding_count === 0) break;
            } catch (_error) {
                after = null;
            }
            if (attempt < 4) await (deps.sleep || ((duration) => new Promise((resolve) => setTimeout(resolve, duration))))(250);
        }
        if (!after) throw fail('Cloudflare Worker 삭제 후 상태를 확인하지 못했습니다. 사이트 연결 정보는 보존했습니다. Cloudflare에서 상태를 확인해 주세요.', 'SITE_HOSTING_WORKER_DELETE_VERIFY_FAILED', 502);
        if (after.worker_count || after.binding_count) {
            throw fail('Cloudflare에서 Worker 또는 도메인 연결이 남아 있어 앱의 연결 정보를 지우지 않았습니다. Cloudflare에서 상태를 확인해 주세요.', 'SITE_HOSTING_WORKER_DELETE_REMAINS', 409);
        }
        const updated = repository.clearDeployment(projectId, siteId, now());
        return { worker_name: workerName, deployment: updated.deployment || null, disconnected: true };
    }

    async function disconnectCustomDomain(projectId, siteId, payload = {}) {
        const site = repository.get(projectId, siteId);
        if (!site) {
            const error = new Error('사이트를 찾을 수 없습니다.');
            error.code = 'SITE_HOSTING_SITE_NOT_FOUND';
            error.status = 404;
            throw error;
        }
        if (payload.confirmed !== true) {
            throw siteInputError('도메인 연결 해제 확인이 필요합니다.', 'SITE_HOSTING_CUSTOM_DOMAIN_CONFIRMATION_REQUIRED', 400);
        }
        const saved = site.custom_domain_binding || {};
        const bindingId = String(saved.id || '').trim();
        const hostname = String(saved.hostname || '').trim().toLowerCase();
        const zoneId = String(saved.zone_id || '').trim();
        const zoneName = String(saved.zone_name || '').trim().toLowerCase();
        const workerName = String(site.deployment?.worker_name || '').trim();
        if (!bindingId || !hostname || !zoneId || !zoneName || !workerName) {
            throw siteInputError('저장된 도메인 연결 정보를 확인할 수 없어 해제하지 않았습니다. 사이트 설정을 확인해 주세요.', 'SITE_HOSTING_CUSTOM_DOMAIN_BINDING_INVALID', 409);
        }

        const { credentials, adapter } = await getCloudflareAdapter();
        const accountId = String(credentials.account.id);
        const fail = (message, code = 'SITE_HOSTING_CUSTOM_DOMAIN_PREFLIGHT_FAILED', status = 409) => {
            const error = new Error(message);
            error.code = code;
            error.status = status;
            return error;
        };
        const listSnapshot = async () => {
            if (typeof adapter.listWorkerDomains !== 'function' || typeof adapter.listDnsRecords !== 'function') {
                throw fail('Cloudflare 도메인과 DNS 상태를 확인할 수 없어 해제하지 않았습니다. 앱을 업데이트하고 다시 시도해 주세요.', 'SITE_HOSTING_CUSTOM_DOMAIN_PREFLIGHT_UNAVAILABLE', 503);
            }
            const zones = await adapter.listZones(accountId);
            const zone = zones.find((item) => String(item?.id || '') === zoneId
                && String(item?.name || '').trim().toLowerCase() === zoneName
                && String(item?.status || '').toLowerCase() === 'active');
            if (!zone) throw fail('Cloudflare 도메인 영역이 활성 상태가 아니거나 저장된 정보와 달라 해제하지 않았습니다.');

            const bindings = (await adapter.listWorkerDomains({ accountId, hostname }))
                .filter((item) => String(item?.hostname || '').trim().toLowerCase() === hostname);
            if (bindings.length > 1) throw fail('Cloudflare 연결 상태가 예상과 달라 안전하게 해제할 수 없습니다. 연결 상태를 새로고침해 주세요.');
            if (bindings.length === 1) {
                const binding = bindings[0];
                if (String(binding.id || '') !== bindingId
                    || String(binding.service || '') !== workerName
                    || String(binding.zone_id || '') !== zoneId) {
                    throw fail('Cloudflare 연결 정보가 사이트에 저장된 내용과 달라 해제하지 않았습니다. 연결 상태를 확인해 주세요.');
                }
            }

            const records = (await adapter.listDnsRecords({ zoneId, hostname }))
                .filter((record) => String(record?.name || '').trim().replace(/\.$/, '').toLowerCase() === hostname)
                .map((record) => ({
                    id: String(record.id || ''), type: String(record.type || '').toUpperCase(),
                    name: String(record.name || '').trim().replace(/\.$/, '').toLowerCase(),
                    content: String(record.content || ''), proxied: record.proxied === true, ttl: Number(record.ttl) || 0
                }))
                .sort((left, right) => left.id.localeCompare(right.id));
            return { bindings, records };
        };
        const managedDnsRecord = (record) => record.type === 'AAAA' && record.content === '100::' && record.proxied;
        let before;
        try {
            before = await listSnapshot();
            // Repeat the read immediately before mutation so drift between preflight and
            // the destructive API call stops the operation instead of acting on stale data.
            const current = await listSnapshot();
            if (JSON.stringify(before) !== JSON.stringify(current)) {
                throw fail('확인 중 Cloudflare 연결 또는 DNS 상태가 바뀌어 해제하지 않았습니다. 다시 시도해 주세요.');
            }
            if (before.bindings.length === 0) {
                if (before.records.some(managedDnsRecord)) {
                    throw fail('Worker 연결은 이미 없지만 DNS 레코드가 남아 있습니다. DNS는 직접 삭제하지 않았으니 Cloudflare에서 확인해 주세요. 사이트의 연결 정보는 보존했습니다.', 'SITE_HOSTING_CUSTOM_DOMAIN_DNS_REMAINS', 409);
                }
                const updated = repository.clearCustomDomainBinding(projectId, siteId, now());
                return { hostname, custom_domain_binding: updated.custom_domain_binding || null, disconnected: true, already_detached: true };
            }
            await adapter.detachWorkerDomain({ accountId, bindingId });
        } catch (cause) {
            if (cause?.code?.startsWith?.('SITE_HOSTING_')) throw cause;
            const error = new Error(Number(cause?.status) === 401 || Number(cause?.status) === 403
                ? 'Cloudflare 도메인 연결 해제 권한이 없습니다. OAuth Client의 Workers Routes Write와 DNS Read 권한을 확인해 주세요.'
                : String(cause?.message || 'Cloudflare 도메인 연결을 해제하지 못했습니다.'));
            error.code = Number(cause?.status) === 401 || Number(cause?.status) === 403
                ? 'CLOUDFLARE_CUSTOM_DOMAIN_PERMISSION_DENIED'
                : 'SITE_HOSTING_CUSTOM_DOMAIN_DETACH_FAILED';
            error.status = Number(cause?.status) || 502;
            throw error;
        }

        let after;
        let verifiedRead = false;
        for (let attempt = 0; attempt < 5; attempt += 1) {
            try {
                after = await listSnapshot();
                verifiedRead = true;
                if (after.bindings.length === 0 && !after.records.some(managedDnsRecord)) break;
            } catch (error) {
                after = null;
                verifiedRead = false;
            }
            if (attempt < 4) await (deps.sleep || ((duration) => new Promise((resolve) => setTimeout(resolve, duration))))(250);
        }
        if (!after || !verifiedRead) {
            throw fail('Cloudflare 연결 해제 후 상태를 확인하지 못했습니다. 사이트의 연결 정보는 그대로 두었습니다. Cloudflare 상태를 확인한 뒤 다시 시도해 주세요.', 'SITE_HOSTING_CUSTOM_DOMAIN_VERIFY_FAILED', 502);
        }
        if (after.bindings.length) {
            throw fail('Cloudflare가 아직 도메인 연결 해제를 반영하지 않았습니다. 사이트의 연결 정보는 그대로 두었습니다.', 'SITE_HOSTING_CUSTOM_DOMAIN_STILL_ATTACHED', 502);
        }
        const currentManagedDns = after.records.filter(managedDnsRecord);
        if (currentManagedDns.length) {
            throw fail('Worker 연결은 해제됐지만 DNS 레코드가 남아 있습니다. DNS는 자동으로 삭제하지 않았으니 Cloudflare에서 확인해 주세요. 사이트의 연결 정보는 보존했습니다.', 'SITE_HOSTING_CUSTOM_DOMAIN_DNS_REMAINS', 409);
        }
        const previousOtherRecords = before.records.filter((record) => !managedDnsRecord(record));
        const currentOtherRecords = after.records.filter((record) => !managedDnsRecord(record));
        if (JSON.stringify(previousOtherRecords) !== JSON.stringify(currentOtherRecords)) {
            throw fail('Worker 연결은 해제됐지만 DNS 상태가 바뀌어 안전 확인을 완료하지 못했습니다. DNS를 직접 확인해 주세요. 사이트의 연결 정보는 보존했습니다.', 'SITE_HOSTING_CUSTOM_DOMAIN_DNS_CHANGED', 409);
        }
        if (typeof repository.clearCustomDomainBinding !== 'function') {
            throw fail('Cloudflare 연결은 해제됐지만 사이트의 연결 정보를 갱신하지 못했습니다. 앱을 재시작한 뒤 상태를 확인해 주세요.', 'SITE_HOSTING_CUSTOM_DOMAIN_LOCAL_UPDATE_FAILED', 500);
        }
        const updated = repository.clearCustomDomainBinding(projectId, siteId, now());
        return { hostname, custom_domain_binding: updated.custom_domain_binding || null, disconnected: true };
    }

    async function prepareSiteDeletion(projectId, siteId) {
        const site = repository.get(projectId, siteId);
        if (!site) throw siteInputError('사이트를 찾을 수 없습니다.', 'SITE_HOSTING_SITE_NOT_FOUND', 404);
        const steps = [];
        const binding = site.custom_domain_binding || {};
        const hostname = String(binding.hostname || '').trim().toLowerCase();
        const deployment = site.deployment || {};
        const workerName = String(deployment.worker_name || '').trim();
        let cloudflareSnapshot = null;
        const blocked = (message, code = 'SITE_HOSTING_DELETE_PREFLIGHT_BLOCKED') => {
            const error = siteInputError(message, code, 409);
            error.deletionPlan = { ready: false, site_name: site.name, steps, blocked_reason: message };
            return error;
        };
        if (site.custom_domain_binding && !hostname) throw blocked('사이트에 저장된 도메인 연결 정보를 확인할 수 없어 삭제를 멈췄습니다.');
        if (site.deployment && !workerName) throw blocked('사이트에 저장된 기본 연결 정보를 확인할 수 없어 삭제를 멈췄습니다.');
        if (typeof repository.getArchiveTarget !== 'function' || typeof repository.archive !== 'function') {
            throw blocked('사이트 파일을 안전하게 보관할 수 없어 삭제 계획을 만들지 못했습니다.', 'SITE_HOSTING_ARCHIVE_UNAVAILABLE');
        }
        const archiveAt = now();
        const archiveTarget = repository.getArchiveTarget(projectId, siteId, archiveAt);

        if (hostname) {
            const bindingId = String(binding.id || '').trim();
            const zoneId = String(binding.zone_id || '').trim();
            const zoneName = String(binding.zone_name || '').trim().toLowerCase();
            if (!bindingId || !zoneId || !zoneName || !workerName) {
                throw blocked('저장된 도메인 연결 정보를 확인할 수 없어 삭제를 멈췄습니다. Cloudflare와 사이트 연결 상태를 확인해 주세요.');
            }
            const { credentials, adapter } = await getCloudflareAdapter();
            const accountId = String(credentials.account.id || '');
            if (!accountId || typeof adapter.listZones !== 'function' || typeof adapter.listWorkerDomains !== 'function' || typeof adapter.listDnsRecords !== 'function') {
                throw blocked('Cloudflare 도메인 및 DNS 상태를 확인할 수 없어 삭제를 진행할 수 없습니다.', 'SITE_HOSTING_DELETE_PREFLIGHT_UNAVAILABLE');
            }
            const zones = await adapter.listZones(accountId);
            const zone = zones.find((item) => String(item?.id || '') === zoneId && String(item?.name || '').toLowerCase() === zoneName && String(item?.status || '').toLowerCase() === 'active');
            if (!zone) throw blocked('연결 도메인의 활성 상태를 확인하지 못했습니다. Cloudflare에서 직접 확인해 주세요.');
            const bindings = (await adapter.listWorkerDomains({ accountId, hostname })).filter((item) => String(item?.hostname || '').toLowerCase() === hostname);
            if (bindings.length !== 1 || String(bindings[0]?.id || '') !== bindingId || String(bindings[0]?.service || '') !== workerName || String(bindings[0]?.zone_id || '') !== zoneId) {
                throw blocked('Cloudflare 도메인 연결이 저장된 정보와 달라 삭제를 멈췄습니다. Cloudflare 상태를 확인해 주세요.');
            }
            const records = (await adapter.listDnsRecords({ zoneId, hostname })).filter((record) => String(record?.name || '').replace(/\.$/u, '').toLowerCase() === hostname)
                .map((record) => ({ id: String(record.id || ''), type: String(record.type || '').toUpperCase(), name: String(record.name || '').replace(/\.$/u, '').toLowerCase(), content: String(record.content || ''), proxied: record.proxied === true, ttl: Number(record.ttl) || 0 }))
                .sort((a, b) => a.id.localeCompare(b.id));
            cloudflareSnapshot = { accountId, bindings, records };
            steps.push({ kind: 'custom_domain', label: `도메인 연결 해제: ${hostname}`, status: 'ready' });
        }

        if (workerName) {
            const accountId = String(deployment.worker_account_id || '').trim();
            const createdOn = String(deployment.worker_created_on || '').trim();
            const deploymentId = String(deployment.deployment_id || '').trim();
            const versionId = String(deployment.version_id || '').trim();
            if (deployment.managed_by_app !== true || !accountId || !createdOn || !deploymentId || !versionId) {
                throw blocked('Worker 소유권을 확인할 수 없어 사이트 삭제를 멈췄습니다. Cloudflare에서 Worker를 직접 확인해 주세요.', 'SITE_HOSTING_WORKER_OWNERSHIP_UNVERIFIED');
            }
            const { credentials, adapter } = await getCloudflareAdapter();
            if (String(credentials.account.id || '') !== accountId) throw blocked('Worker를 만든 Cloudflare 계정과 현재 연결된 계정이 달라 삭제를 멈췄습니다.');
            if (typeof adapter.listWorkerScripts !== 'function' || typeof adapter.listWorkerDomains !== 'function' || typeof adapter.listDeployments !== 'function') {
                throw blocked('Worker 소유권과 연결 상태를 확인할 수 없어 사이트 삭제를 진행할 수 없습니다.', 'SITE_HOSTING_DELETE_PREFLIGHT_UNAVAILABLE');
            }
            const scripts = (await adapter.listWorkerScripts(accountId)).filter((item) => String(item?.id || item?.name || '') === workerName);
            if (scripts.length > 1 || (scripts.length === 1 && String(scripts[0].created_on || '') !== createdOn)) throw blocked('Cloudflare Worker의 생성 정보가 달라 소유권을 확인하지 못했습니다.');
            const workerBindings = (await adapter.listWorkerDomains({ accountId })).filter((item) => String(item?.service || '').trim() === workerName);
            const expectedBinding = hostname ? workerBindings.filter((item) => String(item?.id || '') === String(binding.id || '')
                && String(item?.hostname || '').toLowerCase() === hostname && String(item?.zone_id || '') === String(binding.zone_id || '')) : [];
            const unexpectedBindings = workerBindings.filter((item) => !expectedBinding.includes(item));
            if (unexpectedBindings.length || (hostname && expectedBinding.length !== 1)) throw blocked('사이트에서 기록하지 않은 도메인 연결이 Worker에 있어 삭제를 멈췄습니다. Cloudflare 상태를 확인해 주세요.');
            if (scripts.length) {
                const deployments = await adapter.listDeployments({ accountId, workerName });
                const active = deployments.find((item) => String(item?.id || '') === deploymentId)?.versions?.some((item) => String(item?.version_id || '') === versionId && Number(item?.percentage) === 100);
                if (!active) throw blocked('Worker의 현재 배포 상태가 저장된 정보와 달라 삭제를 멈췄습니다.');
            }
            const snapshot = { scripts: scripts.map((item) => ({ id: String(item.id || item.name || ''), created_on: String(item.created_on || '') })), workerBindings: workerBindings.map((item) => ({ id: String(item.id || ''), hostname: String(item.hostname || ''), zone_id: String(item.zone_id || '') })).sort((a, b) => a.id.localeCompare(b.id)) };
            cloudflareSnapshot = { ...(cloudflareSnapshot || {}), worker: snapshot };
            steps.push({ kind: 'worker', label: `기본 연결 Worker 삭제: ${workerName}`, status: 'ready' });
        }

        const planId = String(createId());
        const plan = {
            id: planId, project_id: projectId, site_id: siteId, site_name: site.name,
            steps: [...steps, { kind: 'archive', label: `사이트 파일 보관: ${archiveTarget}`, status: 'ready' }],
            ready: true, expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString()
        };
        const localSnapshot = JSON.stringify({ id: site.id, name: site.name, updated_at: site.updated_at, deployment: site.deployment || null, custom_domain_binding: site.custom_domain_binding || null });
        siteDeletionPlans.set(planId, { plan, cloudflareSnapshot, localSnapshot, archiveTarget, archiveAt, expiresAt: Date.now() + 5 * 60 * 1000 });
        for (const [id, item] of siteDeletionPlans) if (item.expiresAt < Date.now()) siteDeletionPlans.delete(id);
        return plan;
    }

    async function deleteSite(projectId, siteId, payload = {}) {
        if (payload.confirmed !== true || !String(payload.plan_id || '').trim()) throw siteInputError('사이트 삭제 계획 확인이 필요합니다.', 'SITE_HOSTING_DELETE_CONFIRMATION_REQUIRED', 400);
        const savedPlan = siteDeletionPlans.get(String(payload.plan_id));
        if (!savedPlan || savedPlan.expiresAt < Date.now() || savedPlan.plan.project_id !== projectId || savedPlan.plan.site_id !== siteId) {
            throw siteInputError('삭제 계획이 만료되었거나 사이트 상태가 바뀌었습니다. 다시 확인해 주세요.', 'SITE_HOSTING_DELETE_PLAN_EXPIRED', 409);
        }
        // Re-read the local state and re-run the external preflight immediately before teardown.
        const freshPlan = await prepareSiteDeletion(projectId, siteId);
        const freshState = siteDeletionPlans.get(freshPlan.id);
        if (savedPlan.localSnapshot !== freshState?.localSnapshot
            || JSON.stringify(savedPlan.cloudflareSnapshot) !== JSON.stringify(freshState?.cloudflareSnapshot)) {
            siteDeletionPlans.delete(freshPlan.id);
            siteDeletionPlans.delete(String(payload.plan_id));
            throw siteInputError('확인 후 Cloudflare 상태가 바뀌어 삭제를 멈췄습니다. 현재 상태로 다시 확인해 주세요.', 'SITE_HOSTING_DELETE_STATE_CHANGED', 409);
        }
        siteDeletionPlans.delete(freshPlan.id);
        siteDeletionPlans.delete(String(payload.plan_id));

        const site = repository.get(projectId, siteId);
        if (site?.custom_domain_binding?.hostname) await disconnectCustomDomain(projectId, siteId, { confirmed: true });
        const current = repository.get(projectId, siteId);
        if (current?.deployment?.worker_name) await disconnectWorker(projectId, siteId, { confirmed: true });
        const archived = repository.archive(projectId, siteId, savedPlan.archiveAt, savedPlan.archiveTarget);
        return { ...archived, completed: true };
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
        selectSetupDirectory,
        getTemplatePreview: (id) => templates.getPreview?.(String(id || '').trim()) || null,
        list,
        getSettings,
        applySettings,
        create,
        createAndBuild,
        previewDraft,
        stopDraftPreview,
        update,
        updateTemplate,
        prepareTemplateUpdateTest,
        listCloudflareZones,
        connectCustomDomain,
        disconnectWorker,
        disconnectCustomDomain,
        prepareSiteDeletion,
        deleteSite,
        getScreenshot: (projectId, siteId) => repository.getScreenshot(projectId, siteId),
        openBuildFolder,
        build: (projectId, siteId) => astroRuntime.build(projectId, siteId),
        getBuildStatus: (projectId, siteId) => astroRuntime.getBuildStatus(projectId, siteId),
        startPreview: (projectId, siteId) => astroRuntime.startPreview(projectId, siteId),
        stopPreview: (projectId, siteId) => astroRuntime.stopPreview(projectId, siteId),
        deploy,
        openSiteAddress,
        openKnowledgeCollectionFolder,
        openSitePost,
        postMarkdown
    };
}

module.exports = { createSiteHostingSiteService };
