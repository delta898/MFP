'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { normalizeMenuDestination, normalizeNavigationItems, internalPathSegment, internalPathname } = require('./navigation-contract');
const { SITE_HOSTING_TEMPLATE_UPDATE_POLICY, isSupportedSiteHostingContractVersion, compareVersions } = require('./bloggenius-compatibility');

const SITE_SCHEMA_VERSION = 1;

function updateFamilyPageRoute(fileSystem, pagePath, route) {
    const source = fileSystem.readFileSync(pagePath, 'utf8');
    const match = source.match(/^(---\r?\n)([\s\S]*?)(\r?\n---(?:\r?\n|$))/u);
    if (!match || !/^path:\s*.*$/mu.test(match[2])) {
        const error = new Error('템플릿 페이지 원본에서 경로 항목을 찾지 못했습니다.');
        error.code = 'SITE_HOSTING_TEMPLATE_PAGE_INVALID';
        error.status = 502;
        throw error;
    }
    const frontmatter = match[2].replace(/^path:\s*.*$/mu, `path: ${JSON.stringify(route)}`);
    fileSystem.writeFileSync(pagePath, `${match[1]}${frontmatter}${match[3]}${source.slice(match[0].length)}`, { encoding: 'utf8', mode: 0o600 });
}

function safeSiteId(value) {
    const id = String(value || '').trim();
    return /^[a-zA-Z0-9_-]{1,100}$/.test(id) ? id : '';
}

function createSiteHostingSiteRepository(options = {}) {
    const fileSystem = options.fs || fs;
    const pathApi = options.path || path;
    const temporaryRoot = options.temporaryRoot || os.tmpdir();
    const projectRepository = options.projectRepository;
    const templates = options.templates;
    if (!projectRepository || !templates) throw new Error('프로젝트 저장소와 템플릿 catalog가 필요합니다.');

    function getSitesRoot(projectId) {
        const project = projectRepository.get(projectId);
        if (!project) {
            const error = new Error('프로젝트를 찾을 수 없습니다.');
            error.code = 'SITE_HOSTING_PROJECT_NOT_FOUND';
            error.status = 404;
            throw error;
        }
        return projectRepository.sitesRoot || pathApi.join(pathApi.dirname(pathApi.dirname(project.root_path)), 'sites');
    }

    function readSite(projectId, siteId) {
        const safeId = safeSiteId(siteId);
        if (!safeId) {
            const error = new Error('사이트 ID가 올바르지 않습니다.');
            error.code = 'SITE_HOSTING_SITE_ID_INVALID';
            error.status = 400;
            throw error;
        }
        const siteRoot = pathApi.join(getSitesRoot(projectId), safeId);
        const manifestPath = pathApi.join(siteRoot, '.bloggenius', 'site.json');
        if (!fileSystem.existsSync(manifestPath)) return null;
        try {
            const site = JSON.parse(String(fileSystem.readFileSync(manifestPath, 'utf8') || ''));
            if (site?.project_id !== projectId) return null;
            if (site?.id !== safeId || site?.schema_version !== SITE_SCHEMA_VERSION || !String(site?.name || '').trim()) {
                throw new Error('Site manifest contract mismatch.');
            }
            const template = templates.get(site.template?.id);
            const nestedTemplatePath = pathApi.join(siteRoot, 'template', 'astro');
            const installedTemplatePath = fileSystem.existsSync(pathApi.join(nestedTemplatePath, 'package.json'))
                ? nestedTemplatePath : siteRoot;
            const installedTemplateReady = Boolean(template
                && fileSystem.existsSync(pathApi.join(installedTemplatePath, 'package.json')));
            if (!template || !installedTemplateReady) {
                site.template_status = 'unavailable';
                site.template_update_available = false;
                site.available_template_version = '';
                if (template?.name) site.template_name = template.name;
            } else {
                site.template_name = template.name;
                site.template_status = 'available';
                const targetPath = pathApi.join(siteRoot, 'template', 'astro');
                const updatePolicyReady = SITE_HOSTING_TEMPLATE_UPDATE_POLICY.strategy === 'replace-managed-paths'
                    && SITE_HOSTING_TEMPLATE_UPDATE_POLICY.managed_paths.length === 1
                    && SITE_HOSTING_TEMPLATE_UPDATE_POLICY.managed_paths[0] === 'template/astro'
                    && SITE_HOSTING_TEMPLATE_UPDATE_POLICY.preserved_paths.includes('.bloggenius')
                    && SITE_HOSTING_TEMPLATE_UPDATE_POLICY.preserved_paths.includes('site-data');
                const currentModel = template.resource?.content_model;
                const pinnedModel = site.template?.content_model;
                const sameContentModel = currentModel && pinnedModel
                    && currentModel.model_id === pinnedModel.model_id
                    && currentModel.model_version === pinnedModel.model_version
                    && site.template?.contract_version === template.resource?.spec_version;
                site.template_update_available = Boolean(template.package_ready !== false
                    && compareVersions(template.version, site.template?.version) === 1
                    && isSupportedSiteHostingContractVersion(template.resource?.spec_version) && updatePolicyReady
                    && sameContentModel && template.template_seed_root && fileSystem.existsSync(targetPath));
                site.available_template_version = site.template_update_available ? String(template.version || '') : '';
            }
            return { domain: '', ...site, root_path: siteRoot };
        } catch (cause) {
            const error = new Error('사이트 정보를 읽지 못했습니다.');
            error.code = 'SITE_HOSTING_SITE_READ_FAILED';
            error.status = 500;
            error.cause = cause;
            throw error;
        }
    }

    function list(projectId) {
        const sitesRoot = getSitesRoot(projectId);
        if (!fileSystem.existsSync(sitesRoot)) return [];
        return fileSystem.readdirSync(sitesRoot, { withFileTypes: true })
            .filter((entry) => entry.isDirectory() && safeSiteId(entry.name))
            .map((entry) => readSite(projectId, entry.name))
            .filter(Boolean)
            // Keep newest sites next to the leading create card; other activity may update updated_at.
            .sort((left, right) => String(right.created_at || '').localeCompare(String(left.created_at || ''))
                || String(left.id || '').localeCompare(String(right.id || '')));
    }

    function get(projectId, siteId) {
        return readSite(String(projectId || '').trim(), String(siteId || '').trim());
    }

    function getArchiveTarget(projectId, siteId, archivedAt = new Date().toISOString()) {
        const site = readSite(String(projectId || '').trim(), String(siteId || '').trim());
        if (!site) throw withStatus(new Error('사이트를 찾을 수 없습니다.'), 404, 'SITE_HOSTING_SITE_NOT_FOUND');
        const sitesRoot = pathApi.resolve(getSitesRoot(projectId));
        const siteRoot = pathApi.resolve(site.root_path);
        if (pathApi.dirname(siteRoot) !== sitesRoot || pathApi.basename(siteRoot) !== safeSiteId(siteId)) {
            throw withStatus(new Error('사이트 경로를 안전하게 확인할 수 없어 보관하지 않았습니다.'), 409, 'SITE_HOSTING_ARCHIVE_PATH_INVALID');
        }
        const siteHostingRoot = pathApi.resolve(projectRepository.siteHostingRoot || pathApi.dirname(sitesRoot));
        if (sitesRoot !== pathApi.join(siteHostingRoot, 'sites')) {
            throw withStatus(new Error('보관 위치를 안전하게 확인할 수 없습니다.'), 409, 'SITE_HOSTING_ARCHIVE_PATH_INVALID');
        }
        const archiveRoot = pathApi.join(siteHostingRoot, 'archive');
        if (fileSystem.lstatSync(siteRoot).isSymbolicLink()) throw withStatus(new Error('사이트 폴더가 링크 경로여서 안전하게 보관하지 않았습니다.'), 409, 'SITE_HOSTING_ARCHIVE_PATH_INVALID');
        const archiveExists = fileSystem.existsSync(archiveRoot);
        if (archiveExists && (fileSystem.lstatSync(archiveRoot).isSymbolicLink() || !fileSystem.statSync(archiveRoot).isDirectory())) {
            throw withStatus(new Error('보관 폴더가 일반 디렉터리가 아니어서 이동을 계획하지 않았습니다.'), 409, 'SITE_HOSTING_ARCHIVE_PATH_INVALID');
        }
        const archiveDevice = archiveExists ? fileSystem.statSync(archiveRoot).dev : fileSystem.statSync(siteHostingRoot).dev;
        if (fileSystem.statSync(siteRoot).dev !== archiveDevice) throw withStatus(new Error('보관 폴더가 같은 볼륨에 있지 않아 이동을 계획하지 않았습니다.'), 409, 'SITE_HOSTING_ARCHIVE_PATH_INVALID');
        try { fileSystem.accessSync(siteHostingRoot, fileSystem.constants?.W_OK); }
        catch (_error) { throw withStatus(new Error('보관 위치에 쓸 수 없어 사이트 삭제를 계획하지 않았습니다.'), 409, 'SITE_HOSTING_ARCHIVE_PATH_INVALID'); }
        const datePart = new Date(archivedAt).toISOString().replace(/[-:]/gu, '').replace(/\.\d{3}/u, '');
        const baseName = `${safeSiteId(siteId)}-${datePart}`;
        for (let index = 0; index < 100; index += 1) {
            const destination = pathApi.join(archiveRoot, index ? `${baseName}-${index}` : baseName);
            if (!fileSystem.existsSync(destination)) return destination;
        }
        throw withStatus(new Error('보관 위치 이름이 계속 겹쳐 사이트 파일 이동을 계획하지 못했습니다.'), 409, 'SITE_HOSTING_ARCHIVE_COLLISION');
    }

    function archive(projectId, siteId, archivedAt = new Date().toISOString(), plannedTarget = '') {
        const site = readSite(String(projectId || '').trim(), String(siteId || '').trim());
        if (!site) throw withStatus(new Error('사이트를 찾을 수 없습니다.'), 404, 'SITE_HOSTING_SITE_NOT_FOUND');
        const sitesRoot = pathApi.resolve(getSitesRoot(projectId));
        const siteRoot = pathApi.resolve(site.root_path);
        const siteHostingRoot = pathApi.resolve(projectRepository.siteHostingRoot || pathApi.dirname(sitesRoot));
        const archiveRoot = pathApi.join(siteHostingRoot, 'archive');
        if (pathApi.dirname(siteRoot) !== sitesRoot || pathApi.basename(siteRoot) !== safeSiteId(siteId)
            || sitesRoot !== pathApi.join(siteHostingRoot, 'sites')) {
            throw withStatus(new Error('사이트 경로를 안전하게 확인할 수 없어 보관하지 않았습니다.'), 409, 'SITE_HOSTING_ARCHIVE_PATH_INVALID');
        }
        const destination = plannedTarget ? pathApi.resolve(plannedTarget) : getArchiveTarget(projectId, siteId, archivedAt);
        if (pathApi.dirname(destination) !== archiveRoot || !pathApi.basename(destination).startsWith(`${safeSiteId(siteId)}-`)) {
            throw withStatus(new Error('확인한 보관 위치가 사이트 삭제 계획과 달라 이동하지 않았습니다.'), 409, 'SITE_HOSTING_ARCHIVE_PATH_INVALID');
        }
        if (fileSystem.lstatSync(siteRoot).isSymbolicLink()) throw withStatus(new Error('사이트 폴더가 링크 경로여서 안전하게 보관하지 않았습니다.'), 409, 'SITE_HOSTING_ARCHIVE_PATH_INVALID');
        fileSystem.mkdirSync(archiveRoot, { recursive: true });
        if (fileSystem.lstatSync(archiveRoot).isSymbolicLink() || !fileSystem.statSync(archiveRoot).isDirectory()
            || fileSystem.statSync(siteRoot).dev !== fileSystem.statSync(archiveRoot).dev) {
            throw withStatus(new Error('보관 폴더가 안전한 같은 볼륨 위치가 아니어서 사이트 파일을 이동하지 않았습니다.'), 409, 'SITE_HOSTING_ARCHIVE_PATH_INVALID');
        }
        if (fileSystem.existsSync(destination)) throw withStatus(new Error('확인한 보관 위치가 이미 사용 중이어서 파일을 이동하지 않았습니다. 삭제 계획을 다시 확인해 주세요.'), 409, 'SITE_HOSTING_ARCHIVE_COLLISION');
        try {
            fileSystem.renameSync(siteRoot, destination);
            if (fileSystem.existsSync(siteRoot) || !fileSystem.existsSync(pathApi.join(destination, '.bloggenius', 'site.json'))) {
                try { if (fileSystem.existsSync(destination) && !fileSystem.existsSync(siteRoot)) fileSystem.renameSync(destination, siteRoot); } catch (_restoreError) { }
                throw withStatus(new Error('사이트 파일 이동을 확인하지 못했습니다. 원본 파일을 보존하고 상태를 확인해 주세요.'), 500, 'SITE_HOSTING_ARCHIVE_VERIFY_FAILED');
            }
            return { archived_path: destination, site_id: site.id, archived: true };
        } catch (cause) {
            if (cause?.code?.startsWith?.('SITE_HOSTING_')) throw cause;
            if (cause?.code === 'EEXIST' || cause?.code === 'ENOTEMPTY') {
                throw withStatus(new Error('확인한 보관 위치가 실행 중 사용되어 파일을 이동하지 않았습니다. 삭제 계획을 다시 확인해 주세요.'), 409, 'SITE_HOSTING_ARCHIVE_COLLISION');
            }
            throw withStatus(new Error('사이트 파일을 보관하지 못했습니다. 원본 파일은 유지했습니다.'), 500, 'SITE_HOSTING_ARCHIVE_MOVE_FAILED');
        }
    }

    function create(projectId, site) {
        const sitesRoot = getSitesRoot(projectId);
        const id = safeSiteId(site?.id);
        if (!id) {
            const error = new Error('사이트 ID가 올바르지 않습니다.');
            error.code = 'SITE_HOSTING_SITE_ID_INVALID';
            error.status = 400;
            throw error;
        }
        const template = templates.get(site?.template_id);
        if (!template || template.package_ready === false) {
            const error = new Error('선택한 템플릿을 찾을 수 없습니다.');
            error.code = 'SITE_HOSTING_TEMPLATE_NOT_FOUND';
            error.status = 404;
            throw error;
        }
        const siteRoot = pathApi.join(sitesRoot, id);
        fileSystem.mkdirSync(sitesRoot, { recursive: true });
        try {
            fileSystem.mkdirSync(siteRoot, { recursive: false });
        } catch (cause) {
            const error = new Error(cause?.code === 'EEXIST' ? '이미 존재하는 사이트입니다.' : '사이트 폴더를 만들지 못했습니다.');
            error.code = cause?.code === 'EEXIST' ? 'SITE_HOSTING_SITE_ALREADY_EXISTS' : 'SITE_HOSTING_SITE_CREATE_FAILED';
            error.status = cause?.code === 'EEXIST' ? 409 : 500;
            error.cause = cause;
            throw error;
        }

        try {
            const templateSnapshot = templates.copySource(template.id, siteRoot);
            const customization = applyTemplateCustomization(template, siteRoot, site);
            const manifest = {
                schema_version: SITE_SCHEMA_VERSION,
                id,
                project_id: projectId,
                name: String(site.name || '').trim(),
                template: {
                    id: template.id,
                    version: templateSnapshot.version,
                    ...(template.resource?.content_model ? { content_model: {
                        model_id: template.resource.content_model.model_id,
                        model_version: template.resource.content_model.model_version
                    } } : {}),
                    ...(template.resource?.spec_version ? { contract_version: template.resource.spec_version } : {}),
                    ...(template.family_id ? { family_id: template.family_id } : {}),
                    ...(templateSnapshot.source_revision ? { source_revision: templateSnapshot.source_revision } : {})
                },
                ...(customization ? { customization } : {}),
                ...(site.setup_inputs && Object.keys(site.setup_inputs).length ? { setup_inputs: site.setup_inputs } : {}),
                hostname: '',
                domain: '',
                created_at: String(site.created_at || ''),
                updated_at: String(site.updated_at || '')
            };
            const metadataRoot = pathApi.join(siteRoot, '.bloggenius');
            fileSystem.mkdirSync(metadataRoot, { recursive: true });
            const previewExtension = pathApi.extname(String(template.preview_file || '')).toLowerCase();
            const safePreviewExtension = ['.svg', '.png', '.jpg', '.jpeg', '.webp'].includes(previewExtension) ? previewExtension : '.svg';
            const templatePreviewPath = templates.copyPreview?.(template.id, pathApi.join(metadataRoot, `template-preview${safePreviewExtension}`)) || '';
            if (templatePreviewPath) {
                manifest.screenshot = {
                    template: { path: `.bloggenius/template-preview${safePreviewExtension}`, captured_at: '' },
                    latest_build: null
                };
            }
            const tempPath = pathApi.join(metadataRoot, `.site.json.${process.pid}.${Date.now()}.tmp`);
            fileSystem.writeFileSync(tempPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
            fileSystem.renameSync(tempPath, pathApi.join(metadataRoot, 'site.json'));
            return { ...manifest, template_name: template.name, template_status: 'available', root_path: siteRoot };
        } catch (cause) {
            try { fileSystem.rmSync(siteRoot, { recursive: true, force: true }); } catch (_cleanupError) { }
            const error = new Error('사이트를 만들지 못했습니다.');
            error.code = cause?.code || 'SITE_HOSTING_SITE_CREATE_FAILED';
            error.status = Number.isInteger(cause?.status) ? cause.status : 500;
            error.cause = cause;
            throw error;
        }
    }

    function createPreviewDraft(projectId, site) {
        if (!projectRepository.get(projectId)) {
            const error = new Error('프로젝트를 찾을 수 없습니다.');
            error.code = 'SITE_HOSTING_PROJECT_NOT_FOUND';
            error.status = 404;
            throw error;
        }
        const id = safeSiteId(site?.id);
        if (!id) throw withStatus(new Error('미리보기 ID가 올바르지 않습니다.'), 400, 'SITE_HOSTING_PREVIEW_ID_INVALID');
        const template = templates.get(site?.template_id);
        if (!template || template.package_ready === false) {
            throw withStatus(new Error('선택한 템플릿을 찾을 수 없습니다.'), 404, 'SITE_HOSTING_TEMPLATE_NOT_FOUND');
        }
        const rootPath = fileSystem.mkdtempSync(pathApi.join(temporaryRoot, 'bloggenius-site-preview-'));
        try {
            const templateSnapshot = templates.copySource(template.id, rootPath);
            const customization = applyTemplateCustomization(template, rootPath, site);
            return {
                id,
                project_id: projectId,
                name: String(site.name || '').trim(),
                template: {
                    id: template.id,
                    version: templateSnapshot.version,
                    ...(template.resource?.content_model ? { content_model: {
                        model_id: template.resource.content_model.model_id,
                        model_version: template.resource.content_model.model_version
                    } } : {}),
                    ...(template.resource?.spec_version ? { contract_version: template.resource.spec_version } : {}),
                    ...(template.family_id ? { family_id: template.family_id } : {}),
                    ...(templateSnapshot.source_revision ? { source_revision: templateSnapshot.source_revision } : {})
                },
                ...(customization ? { customization } : {}),
                ...(site.setup_inputs && Object.keys(site.setup_inputs).length ? { setup_inputs: site.setup_inputs } : {}),
                root_path: rootPath
            };
        } catch (cause) {
            try { fileSystem.rmSync(rootPath, { recursive: true, force: true }); } catch (_cleanupError) { }
            const error = new Error('미리보기 사이트를 준비하지 못했습니다.');
            error.code = cause?.code || 'SITE_HOSTING_PREVIEW_CREATE_FAILED';
            error.status = Number.isInteger(cause?.status) ? cause.status : 500;
            error.cause = cause;
            throw error;
        }
    }

    function removePreviewDraft(draft) {
        const rootPath = pathApi.resolve(String(draft?.root_path || ''));
        const safeTemporaryRoot = `${pathApi.resolve(temporaryRoot)}${pathApi.sep}`;
        if (!rootPath.startsWith(safeTemporaryRoot)) return false;
        fileSystem.rmSync(rootPath, { recursive: true, force: true });
        return true;
    }

    function applyTemplateCustomization(template, siteRoot, site) {
        if (isSupportedSiteHostingContractVersion(template.resource?.spec_version)) {
            const dataRoot = pathApi.join(siteRoot, 'site-data');
            const siteDataPath = pathApi.join(dataRoot, 'site.json');
            let siteData;
            try { siteData = JSON.parse(String(fileSystem.readFileSync(siteDataPath, 'utf8') || '')); }
            catch (cause) {
                const error = new Error('템플릿 초기 site-data/site.json을 읽지 못했습니다.');
                error.code = 'SITE_HOSTING_TEMPLATE_SEED_DATA_INVALID';
                error.status = 502;
                error.cause = cause;
                throw error;
            }
            const navigation = Array.isArray(site.customization?.navigation) ? site.customization.navigation : [];
            if (!navigation.length) throw withStatus(new Error('사이트 메뉴는 1개 이상 필요합니다.'), 400, 'SITE_HOSTING_NAVIGATION_INVALID');
            const defaultNavigation = Array.isArray(siteData.navigation) ? siteData.navigation : [];
            siteData.displayName = String(site.name || '').trim();
            siteData.seoDescription = String(site.customization?.site_description || '').trim();
            siteData.searchEngineIndexing = site.customization?.search_engine_indexing !== false;
            siteData.navigation = navigation.map((item, index) => ({
                id: item.id || defaultNavigation[index]?.id || `menu-${index + 1}`,
                label: item.label,
                path: item.href
            }));
            const defaultById = new Map(defaultNavigation.filter((item) => item?.id).map((item) => [item.id, item]));
            for (const item of siteData.navigation) {
                const previous = defaultById.get(item.id);
                if (!previous || previous.path === item.path) continue;
                const pagePath = pathApi.join(dataRoot, 'data', 'pages', `${item.id}.md`);
                const nextRoute = internalPathname(item.path);
                if (fileSystem.existsSync(pagePath) && nextRoute) updateFamilyPageRoute(fileSystem, pagePath, nextRoute);
            }
            for (const imageField of [
                { key: 'logo', dataKey: 'logo', fileName: 'bloggenius-logo' },
                { key: 'share_image', dataKey: 'shareImage', fileName: 'bloggenius-share-image' },
                { key: 'favicon', dataKey: 'favicon', fileName: 'bloggenius-favicon' }
            ]) {
                const image = site.customization?.[imageField.key];
                if (!image) continue;
                const extension = String(image.extension || '');
                const bytes = image.content;
                const signatures = { png: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), jpg: Buffer.from([0xff, 0xd8, 0xff]), webp: Buffer.from('RIFF') };
                if (!Object.hasOwn(signatures, extension) || !Buffer.isBuffer(bytes) || bytes.length > 1024 * 1024
                    || bytes.length < signatures[extension].length || !bytes.subarray(0, signatures[extension].length).equals(signatures[extension])
                    || (extension === 'webp' && bytes.toString('ascii', 8, 12) !== 'WEBP')) {
                    throw withStatus(new Error(`${imageField.key === 'logo' ? '로고' : imageField.key === 'favicon' ? 'Favicon' : '사이트 대표'} 이미지 형식이 올바르지 않습니다.`), 400, imageField.key === 'logo' ? 'SITE_HOSTING_LOGO_INVALID' : 'SITE_HOSTING_SITE_PROFILE_IMAGE_INVALID');
                }
                const assetName = `${imageField.fileName}.${extension}`;
                fileSystem.writeFileSync(pathApi.join(dataRoot, 'public', assetName), bytes, { flag: 'wx', mode: 0o600 });
                siteData[imageField.dataKey] = `/${assetName}`;
            }
            fileSystem.writeFileSync(siteDataPath, `${JSON.stringify(siteData, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
            const postList = site.customization?.publishing;
            const contentModel = template.resource.content_model || template.resource.family;
            const postType = (contentModel.content_types || []).find((item) => item.kind === 'post');
            if (postList) {
                if (!postType || !Number.isInteger(postList.post_list_navigation_index)
                    || postList.post_list_navigation_index < 0 || postList.post_list_navigation_index >= navigation.length
                    || navigation[postList.post_list_navigation_index].href !== postList.listing_route
                    || postList.detail_route !== String(postType.detail_route || '').replace(postType.listing_route, postList.listing_route)) {
                    throw withStatus(new Error('글 목록 메뉴 설정이 템플릿 규칙과 일치하지 않습니다.'), 400, 'SITE_HOSTING_POST_LIST_MENU_INVALID');
                }
            }
            const pages = Array.isArray(site.customization?.custom_pages) ? site.customization.custom_pages : [];
            for (const page of pages) {
                if (!page || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(page.slug) || !String(page.label || '').trim()) {
                    throw withStatus(new Error('내부 페이지 설정이 올바르지 않습니다.'), 400, 'SITE_HOSTING_NAVIGATION_INVALID');
                }
                const route = internalPathname(String(page.path || `/${page.slug}/`));
                if (!route || !navigation.some((item) => item.label === page.label && internalPathname(item.href) === route)) {
                    throw withStatus(new Error('내부 페이지 경로가 메뉴와 일치하지 않습니다.'), 400, 'SITE_HOSTING_NAVIGATION_INVALID');
                }
                const pagePath = pathApi.join(dataRoot, 'data', 'pages', `${page.slug}.md`);
                if (fileSystem.existsSync(pagePath)) {
                    throw withStatus(new Error('내부 페이지 파일 경로가 이미 사용 중입니다.'), 409, 'SITE_HOSTING_MENU_PATH_CONFLICT');
                }
                const frontmatter = `---\nkind: page\ntitle: ${JSON.stringify(page.label)}\npath: ${JSON.stringify(route)}\nis_public: true\n---\n`;
                try { fileSystem.writeFileSync(pagePath, frontmatter, { flag: 'wx', mode: 0o600 }); }
                catch (cause) {
                    const error = new Error(cause?.code === 'EEXIST' ? '내부 페이지 파일 경로가 이미 사용 중입니다.' : '내부 페이지를 만들지 못했습니다.');
                    error.code = cause?.code === 'EEXIST' ? 'SITE_HOSTING_MENU_PATH_CONFLICT' : 'SITE_HOSTING_PAGE_CREATE_FAILED';
                    error.status = cause?.code === 'EEXIST' ? 409 : 500;
                    error.cause = cause;
                    throw error;
                }
            }
            return {
                navigation: siteData.navigation.map(({ id, label, path: href }) => ({ ...(id ? { id } : {}), label, href })),
                ...(siteData.logo ? { logo: siteData.logo } : {}),
                ...(siteData.seoDescription ? { site_description: siteData.seoDescription } : {}),
                ...(siteData.shareImage ? { share_image: siteData.shareImage } : {}),
                ...(siteData.favicon ? { favicon: siteData.favicon } : {}),
                search_engine_indexing: siteData.searchEngineIndexing !== false,
                ...(postList ? { publishing: postList } : {}),
                ...(pages.length ? { custom_pages: pages } : {})
            };
        }
        const fields = template.resource?.site_hosting?.customization?.fields;
        if (!Array.isArray(fields) || !fields.length) return null;
        const customization = site.customization;
        if (customization !== undefined && (!customization || typeof customization !== 'object' || Array.isArray(customization)
            || Object.keys(customization).some((key) => !fields.some((field) => field.key === key)
                && !['custom_pages', 'publishing'].includes(key)))) {
            throw withStatus(new Error('사이트 설정에 허용되지 않은 항목이 포함되어 있습니다.'), 400);
        }
        const values = {};
        for (const field of fields) {
            values[field.key] = field.key === 'site_name'
                ? String(site.name || field.default || '')
                : field.default;
        }
        if (site.customization && typeof site.customization === 'object' && !Array.isArray(site.customization)) {
            for (const field of fields) {
                if (!Object.hasOwn(site.customization, field.key)) continue;
                const value = site.customization[field.key];
                if (field.key === 'navigation' && Array.isArray(values.navigation)) {
                    if (!Array.isArray(value)) throw withStatus(new Error('사이트 메뉴 설정은 목록이어야 합니다.'), 400);
                    try {
                        values.navigation = normalizeNavigationItems(value, { maxItems: 50 });
                        if (values.navigation.some((item, index) => item.href !== value[index]?.href)) {
                            throw new Error('저장된 메뉴 경로는 정규 형식이어야 합니다.');
                        }
                    }
                    catch (cause) { throw withStatus(cause, 400); }
                } else if (field.key === 'logo') {
                    if (value === undefined) continue;
                    const extension = value && typeof value === 'object' && !Array.isArray(value) ? value.extension : '';
                    const content = value?.content;
                    const signatures = {
                        png: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
                        jpg: Buffer.from([0xff, 0xd8, 0xff]),
                        webp: Buffer.from('RIFF')
                    };
                    if (!Object.hasOwn(signatures, extension) || !Buffer.isBuffer(content)
                        || content.length < signatures[extension].length || content.length > 1024 * 1024
                        || !content.subarray(0, signatures[extension].length).equals(signatures[extension])
                        || (extension === 'webp' && content.toString('ascii', 8, 12) !== 'WEBP')
                        || Object.keys(value).some((key) => !['extension', 'content'].includes(key))) {
                        throw withStatus(new Error('로고는 확인된 PNG, JPG 또는 WebP 이미지(1MB 이하)만 사용할 수 있습니다.'), 400, 'SITE_HOSTING_LOGO_INVALID');
                    }
                    const logoPath = pathApi.join(siteRoot, 'public', `bloggenius-logo.${extension}`);
                    fileSystem.mkdirSync(pathApi.dirname(logoPath), { recursive: true });
                    fileSystem.writeFileSync(logoPath, content, { flag: 'wx', mode: 0o600 });
                    values.logo = `/bloggenius-logo.${extension}`;
                }
            }
        }
        const publishing = template.resource?.site_hosting?.publishing;
        const postListSelection = site.customization?.publishing;
        if (postListSelection) {
            if (typeof postListSelection !== 'object' || Array.isArray(postListSelection)
                || Object.keys(postListSelection).some((key) => !['listing_route', 'detail_route', 'post_list_navigation_index'].includes(key))) {
                throw withStatus(new Error('글 목록 메뉴 설정에 허용되지 않은 항목이 포함되어 있습니다.'), 400, 'SITE_HOSTING_POST_LIST_MENU_INVALID');
            }
            const navigation = values.navigation;
            const index = postListSelection.post_list_navigation_index;
            const listingRoute = String(postListSelection.listing_route || '');
            const defaultListingRoute = String(publishing?.routes?.listing || '');
            const expectedDetailRoute = String(publishing?.routes?.detail || '').replace(defaultListingRoute, listingRoute);
            let normalizedListingRoute = '';
            try { normalizedListingRoute = normalizeMenuDestination(listingRoute); }
            catch (cause) { throw withStatus(cause, 400, 'SITE_HOSTING_POST_LIST_MENU_INVALID'); }
            if (!Array.isArray(navigation) || !Number.isInteger(index) || index < 0 || index >= navigation.length
                || normalizedListingRoute !== listingRoute
                || !defaultListingRoute || !String(publishing?.routes?.detail || '').includes(defaultListingRoute)
                || !expectedDetailRoute.includes('{slug}')
                || postListSelection.detail_route !== expectedDetailRoute) {
                const error = new Error('글 목록 메뉴 설정이 템플릿 규칙과 일치하지 않습니다.');
                error.code = 'SITE_HOSTING_POST_LIST_MENU_INVALID';
                error.status = 400;
                throw error;
            }
            if (navigation[index].href !== listingRoute) {
                const error = new Error('글 목록 메뉴 경로가 메뉴 설정과 일치하지 않습니다.');
                error.code = 'SITE_HOSTING_POST_LIST_MENU_INVALID';
                error.status = 400;
                throw error;
            }
            navigation[index] = { ...navigation[index], href: listingRoute };
            values.publishing = {
                listing_route: listingRoute,
                detail_route: expectedDetailRoute,
                post_list_navigation_index: index
            };
        }
        for (const field of fields) {
            const targetFile = String(field.target?.file || '');
            const keys = String(field.target?.path || '').split('.');
            if (!/^src\/[A-Za-z0-9._/-]+\.json$/.test(targetFile) || targetFile.split('/').includes('..')
                || !keys.length || keys.some((key) => !/^[A-Za-z0-9_-]+$/.test(key))) {
                const error = new Error('템플릿 customization 대상 경로가 올바르지 않습니다.');
                error.code = 'SITE_HOSTING_TEMPLATE_MANIFEST_INVALID';
                error.status = 502;
                throw error;
            }
            const configPath = pathApi.resolve(siteRoot, targetFile);
            if (!configPath.startsWith(`${pathApi.resolve(siteRoot)}${pathApi.sep}`) || !fileSystem.existsSync(configPath)) {
                const error = new Error('템플릿 설정 파일을 찾을 수 없습니다.');
                error.code = 'SITE_HOSTING_TEMPLATE_CONFIG_MISSING';
                error.status = 502;
                throw error;
            }
            let document;
            try { document = JSON.parse(String(fileSystem.readFileSync(configPath, 'utf8') || '')); }
            catch (cause) {
                const error = new Error('템플릿 설정 파일을 읽지 못했습니다.');
                error.code = 'SITE_HOSTING_TEMPLATE_CONFIG_INVALID';
                error.status = 502;
                error.cause = cause;
                throw error;
            }
            let parent = document;
            for (const key of keys.slice(0, -1)) {
                if (!parent[key] || typeof parent[key] !== 'object' || Array.isArray(parent[key])) parent[key] = {};
                parent = parent[key];
            }
            parent[keys.at(-1)] = values[field.key];
            fileSystem.writeFileSync(configPath, `${JSON.stringify(document, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
        }
        const pageContract = template.resource?.site_hosting?.pages;
        const pages = Array.isArray(site.customization?.custom_pages) ? site.customization.custom_pages : null;
        if (site.customization?.custom_pages !== undefined && !Array.isArray(site.customization.custom_pages)) {
            throw withStatus(new Error('내부 페이지 설정은 목록이어야 합니다.'), 400);
        }
        if (pages && (!pageContract || pageContract.schema_version !== 1 || pageContract.mode !== 'static_placeholders')) {
            throw withStatus(new Error('이 템플릿은 내부 페이지 추가를 지원하지 않습니다.'), 400, 'SITE_HOSTING_PAGES_UNSUPPORTED');
        }
        if (pages && pageContract?.schema_version === 1 && pageContract.mode === 'static_placeholders') {
            if (pages.length > pageContract.max_items || pages.some((page) => !page || typeof page !== 'object'
                || Array.isArray(page) || Object.keys(page).some((key) => key !== 'label' && key !== 'slug')
                || typeof page.label !== 'string' || !page.label.trim() || page.label.trim().length > 30
                || /[<>\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(page.label)
                || typeof page.slug !== 'string' || !/^[\p{L}\p{N}_-]{1,48}$/u.test(page.slug)
                || page.slug !== page.slug.normalize('NFKC'))) {
                const error = new Error('사이트 내부 페이지 설정이 허용된 형식이 아닙니다.');
                error.code = 'SITE_HOSTING_NAVIGATION_INVALID';
                error.status = 400;
                throw error;
            }
            const pageSlugs = pages.map((page) => page.slug);
            if (new Set(pageSlugs.map((slug) => slug.toLocaleLowerCase('en-US'))).size !== pageSlugs.length
                || pages.some((page) => (pageContract.reserved_slugs || []).some((slug) => String(slug).toLocaleLowerCase('en-US') === page.slug.toLocaleLowerCase('en-US')))) {
                const error = new Error('사이트 내부 페이지 경로가 중복되거나 예약되어 있습니다.');
                error.code = 'SITE_HOSTING_MENU_PATH_CONFLICT';
                error.status = 400;
                throw error;
            }
            const navigation = Array.isArray(values.navigation) ? values.navigation : [];
            if (pages.some((page) => !navigation.some((item) => {
                try { return item.label === page.label && internalPathSegment(item.href) === page.slug; }
                catch (_error) { return false; }
            }))) {
                throw withStatus(new Error('내부 페이지는 메뉴에 연결된 경로와 이름이 일치해야 합니다.'), 400);
            }
            const targetFile = String(pageContract.target?.file || '');
            const keys = String(pageContract.target?.path || '').split('.');
            if (!/^src\/[A-Za-z0-9._/-]+\.json$/.test(targetFile) || targetFile.split('/').includes('..')
                || !keys.length || keys.some((key) => !/^[A-Za-z0-9_-]+$/.test(key))) {
                const error = new Error('템플릿 페이지 설정 경로가 올바르지 않습니다.');
                error.code = 'SITE_HOSTING_TEMPLATE_MANIFEST_INVALID';
                error.status = 502;
                throw error;
            }
            const configPath = pathApi.resolve(siteRoot, targetFile);
            if (!configPath.startsWith(`${pathApi.resolve(siteRoot)}${pathApi.sep}`) || !fileSystem.existsSync(configPath)) {
                const error = new Error('템플릿 페이지 설정 파일을 찾을 수 없습니다.');
                error.code = 'SITE_HOSTING_TEMPLATE_CONFIG_MISSING';
                error.status = 502;
                throw error;
            }
            const document = JSON.parse(String(fileSystem.readFileSync(configPath, 'utf8') || ''));
            let parent = document;
            for (const key of keys.slice(0, -1)) {
                if (!parent[key] || typeof parent[key] !== 'object' || Array.isArray(parent[key])) parent[key] = {};
                parent = parent[key];
            }
            parent[keys.at(-1)] = pages;
            fileSystem.writeFileSync(configPath, `${JSON.stringify(document, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
            values.custom_pages = pages;
        }
        return values;
    }

    function withStatus(cause, status, code = cause?.code) {
        const error = new Error(cause?.message || '사이트 설정이 올바르지 않습니다.');
        error.code = code || 'SITE_HOSTING_NAVIGATION_INVALID';
        error.status = status;
        error.cause = cause;
        return error;
    }

    function recordDeployment(projectId, siteId, deployment) {
        const site = readSite(projectId, siteId);
        if (!site) {
            const error = new Error('사이트를 찾을 수 없습니다.');
            error.code = 'SITE_HOSTING_SITE_NOT_FOUND';
            error.status = 404;
            throw error;
        }
        const manifestPath = pathApi.join(site.root_path, '.bloggenius', 'site.json');
        const manifest = JSON.parse(String(fileSystem.readFileSync(manifestPath, 'utf8') || ''));
        const updated = {
            ...manifest,
            deployment: {
                provider: 'cloudflare',
                worker_name: String(deployment.worker_name || ''),
                url: String(deployment.url || ''),
                deployment_id: String(deployment.deployment_id || ''),
                version_id: String(deployment.version_id || ''),
                worker_account_id: String(deployment.worker_account_id || ''),
                worker_created_on: String(deployment.worker_created_on || ''),
                managed_by_app: deployment.managed_by_app === true,
                deployed_at: String(deployment.deployed_at || '')
            },
            updated_at: String(deployment.deployed_at || manifest.updated_at || '')
        };
        const tempPath = pathApi.join(pathApi.dirname(manifestPath), `.site.json.${process.pid}.${Date.now()}.tmp`);
        fileSystem.writeFileSync(tempPath, `${JSON.stringify(updated, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
        fileSystem.renameSync(tempPath, manifestPath);
        return readSite(projectId, siteId);
    }

    function clearDeployment(projectId, siteId, updatedAt = new Date().toISOString()) {
        const site = readSite(projectId, siteId);
        if (!site) throw withStatus(new Error('사이트를 찾을 수 없습니다.'), 404, 'SITE_HOSTING_SITE_NOT_FOUND');
        const manifestPath = pathApi.join(site.root_path, '.bloggenius', 'site.json');
        const manifest = JSON.parse(String(fileSystem.readFileSync(manifestPath, 'utf8') || ''));
        const updated = { ...manifest, updated_at: String(updatedAt || manifest.updated_at || '') };
        delete updated.deployment;
        const tempPath = pathApi.join(pathApi.dirname(manifestPath), `.site.json.${process.pid}.${Date.now()}.tmp`);
        fileSystem.writeFileSync(tempPath, `${JSON.stringify(updated, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
        fileSystem.renameSync(tempPath, manifestPath);
        return readSite(projectId, siteId);
    }

    function recordBuildResult(projectId, siteId, build) {
        const site = readSite(projectId, siteId);
        if (!site) {
            const error = new Error('사이트를 찾을 수 없습니다.');
            error.code = 'SITE_HOSTING_SITE_NOT_FOUND';
            error.status = 404;
            throw error;
        }
        const metadataRoot = pathApi.join(site.root_path, '.bloggenius');
        const manifestPath = pathApi.join(metadataRoot, 'site.json');
        const manifest = JSON.parse(String(fileSystem.readFileSync(manifestPath, 'utf8') || ''));
        const updated = {
            ...manifest,
            last_build: {
                status: 'succeeded',
                build_id: String(build.build_id || ''),
                completed_at: String(build.completed_at || '')
            },
            updated_at: String(build.completed_at || manifest.updated_at || '')
        };
        const tempPath = pathApi.join(metadataRoot, `.site.json.${process.pid}.${Date.now()}.tmp`);
        fileSystem.writeFileSync(tempPath, `${JSON.stringify(updated, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
        fileSystem.renameSync(tempPath, manifestPath);
        return readSite(projectId, siteId);
    }

    function recordBuildScreenshot(projectId, siteId, build) {
        const site = readSite(projectId, siteId);
        if (!site) {
            const error = new Error('사이트를 찾을 수 없습니다.');
            error.code = 'SITE_HOSTING_SITE_NOT_FOUND';
            error.status = 404;
            throw error;
        }
        const relativePath = String(build?.path || '');
        if (relativePath !== '.bloggenius/build-preview.jpg') {
            const error = new Error('사이트 스크린샷 경로가 올바르지 않습니다.');
            error.code = 'SITE_HOSTING_SCREENSHOT_PATH_INVALID';
            error.status = 400;
            throw error;
        }
        const filePath = pathApi.resolve(site.root_path, relativePath);
        const metadataRoot = pathApi.resolve(site.root_path, '.bloggenius');
        if (!filePath.startsWith(`${metadataRoot}${pathApi.sep}`) || !fileSystem.existsSync(filePath) || !fileSystem.statSync(filePath).isFile()) {
            const error = new Error('사이트 스크린샷 파일을 찾을 수 없습니다.');
            error.code = 'SITE_HOSTING_SCREENSHOT_NOT_FOUND';
            error.status = 404;
            throw error;
        }
        const manifestPath = pathApi.join(metadataRoot, 'site.json');
        const manifest = JSON.parse(String(fileSystem.readFileSync(manifestPath, 'utf8') || ''));
        const updated = {
            ...manifest,
            screenshot: {
                ...(manifest.screenshot || {}),
                latest_build: {
                    path: relativePath,
                    build_id: String(build.build_id || ''),
                    captured_at: String(build.captured_at || ''),
                    viewport: { width: Number(build.viewport?.width) || 1200, height: Number(build.viewport?.height) || 675 }
                }
            },
            last_build: { status: 'succeeded', build_id: String(build.build_id || ''), completed_at: String(build.captured_at || '') },
            updated_at: String(build.captured_at || manifest.updated_at || '')
        };
        const tempPath = pathApi.join(metadataRoot, `.site.json.${process.pid}.${Date.now()}.tmp`);
        fileSystem.writeFileSync(tempPath, `${JSON.stringify(updated, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
        fileSystem.renameSync(tempPath, manifestPath);
        return readSite(projectId, siteId);
    }

    function getScreenshot(projectId, siteId) {
        const site = readSite(projectId, siteId);
        if (!site) {
            const error = new Error('사이트를 찾을 수 없습니다.');
            error.code = 'SITE_HOSTING_SITE_NOT_FOUND';
            error.status = 404;
            throw error;
        }
        const relativePath = String(site.screenshot?.latest_build?.path || site.screenshot?.template?.path || '');
        if (!/^\.bloggenius\/(?:template-preview\.(?:svg|png|jpe?g|webp)|build-preview\.jpg)$/.test(relativePath)) {
            const error = new Error('사이트 스크린샷이 없습니다.');
            error.code = 'SITE_HOSTING_SCREENSHOT_NOT_FOUND';
            error.status = 404;
            throw error;
        }
        const filePath = pathApi.resolve(site.root_path, relativePath);
        const metadataRoot = pathApi.resolve(site.root_path, '.bloggenius');
        if (!filePath.startsWith(`${metadataRoot}${pathApi.sep}`) || !fileSystem.existsSync(filePath) || !fileSystem.statSync(filePath).isFile()) {
            const error = new Error('사이트 스크린샷 파일을 찾을 수 없습니다.');
            error.code = 'SITE_HOSTING_SCREENSHOT_NOT_FOUND';
            error.status = 404;
            throw error;
        }
        const contentType = ({ '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' })[pathApi.extname(filePath).toLowerCase()] || 'application/octet-stream';
        return { buffer: fileSystem.readFileSync(filePath), contentType };
    }

    function recordCustomDomainBinding(projectId, siteId, binding) {
        const site = readSite(projectId, siteId);
        if (!site) {
            const error = new Error('사이트를 찾을 수 없습니다.');
            error.code = 'SITE_HOSTING_SITE_NOT_FOUND';
            error.status = 404;
            throw error;
        }
        const manifestPath = pathApi.join(site.root_path, '.bloggenius', 'site.json');
        const manifest = JSON.parse(String(fileSystem.readFileSync(manifestPath, 'utf8') || ''));
        const updated = {
            ...manifest,
            hostname: String(binding.site_hostname ?? manifest.hostname ?? '').trim(),
            domain: String(binding.domain ?? manifest.domain ?? '').trim(),
            custom_domain_binding: {
                id: String(binding.id || ''),
                hostname: String(binding.hostname || ''),
                zone_id: String(binding.zone_id || ''),
                zone_name: String(binding.zone_name || ''),
                connected_at: String(binding.connected_at || '')
            },
            updated_at: String(binding.connected_at || manifest.updated_at || '')
        };
        const tempPath = pathApi.join(pathApi.dirname(manifestPath), `.site.json.${process.pid}.${Date.now()}.tmp`);
        fileSystem.writeFileSync(tempPath, `${JSON.stringify(updated, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
        fileSystem.renameSync(tempPath, manifestPath);
        return readSite(projectId, siteId);
    }

    function clearCustomDomainBinding(projectId, siteId, updatedAt = new Date().toISOString()) {
        const site = readSite(projectId, siteId);
        if (!site) {
            const error = new Error('사이트를 찾을 수 없습니다.');
            error.code = 'SITE_HOSTING_SITE_NOT_FOUND';
            error.status = 404;
            throw error;
        }
        const manifestPath = pathApi.join(site.root_path, '.bloggenius', 'site.json');
        const manifest = JSON.parse(String(fileSystem.readFileSync(manifestPath, 'utf8') || ''));
        const updated = { ...manifest, custom_domain_binding: null, updated_at: updatedAt };
        const tempPath = pathApi.join(pathApi.dirname(manifestPath), `.site.json.${process.pid}.${Date.now()}.tmp`);
        fileSystem.writeFileSync(tempPath, `${JSON.stringify(updated, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
        fileSystem.renameSync(tempPath, manifestPath);
        return readSite(projectId, siteId);
    }

    function update(projectId, siteId, patch = {}) {
        const site = readSite(projectId, siteId);
        if (!site) {
            const error = new Error('사이트를 찾을 수 없습니다.');
            error.code = 'SITE_HOSTING_SITE_NOT_FOUND';
            error.status = 404;
            throw error;
        }
        const manifestPath = pathApi.join(site.root_path, '.bloggenius', 'site.json');
        const manifest = JSON.parse(String(fileSystem.readFileSync(manifestPath, 'utf8') || ''));
        const updated = {
            ...manifest,
            name: String(patch.name ?? manifest.name).trim(),
            hostname: String(patch.hostname ?? manifest.hostname ?? '').trim(),
            domain: String(patch.domain ?? manifest.domain ?? '').trim(),
            ...(patch.customization ? { customization: patch.customization } : {}),
            ...(patch.setup_inputs ? { setup_inputs: patch.setup_inputs } : {}),
            updated_at: String(patch.updated_at || new Date().toISOString())
        };
        const tempPath = pathApi.join(pathApi.dirname(manifestPath), `.site.json.${process.pid}.${Date.now()}.tmp`);
        fileSystem.writeFileSync(tempPath, `${JSON.stringify(updated, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
        fileSystem.renameSync(tempPath, manifestPath);
        return readSite(projectId, siteId);
    }

    function updateSettings(projectId, siteId, patch = {}) {
        const site = readSite(projectId, siteId);
        if (!site) throw withStatus(new Error('사이트를 찾을 수 없습니다.'), 404, 'SITE_HOSTING_SITE_NOT_FOUND');
        const template = templates.get(site.template?.id);
        if (!isSupportedSiteHostingContractVersion(template?.resource?.spec_version)) {
            throw withStatus(new Error('이 템플릿은 사이트 설정 변경을 지원하지 않습니다.'), 409, 'SITE_HOSTING_SETTINGS_UNAVAILABLE');
        }
        const dataRoot = pathApi.join(site.root_path, 'site-data');
        const siteDataPath = pathApi.join(dataRoot, 'site.json');
        const siteData = JSON.parse(String(fileSystem.readFileSync(siteDataPath, 'utf8') || ''));
        const customization = patch.customization || {};
        // Publishing routes belong to the BlogGenius site manifest. Older settings
        // updates also copied them into site-data/site.json, which strict templates reject.
        delete siteData.publishing;
        siteData.displayName = String(patch.name || '').trim();
        siteData.seoDescription = String(customization.site_description || '').trim();
        siteData.searchEngineIndexing = customization.search_engine_indexing !== false;
        const previousNavigation = Array.isArray(siteData.navigation) ? siteData.navigation : [];
        siteData.navigation = (customization.navigation || []).map((item, index) => ({
            id: item.id || previousNavigation[index]?.id || `menu-${index + 1}`,
            label: item.label,
            path: item.href
        }));
        for (const item of siteData.navigation) {
            const previous = previousNavigation.find((entry) => entry.id === item.id);
            if (!previous || previous.path === item.path) continue;
            const pagePath = pathApi.join(dataRoot, 'data', 'pages', `${item.id}.md`);
            const route = internalPathname(item.path);
            if (fileSystem.existsSync(pagePath) && route) updateFamilyPageRoute(fileSystem, pagePath, route);
        }
        const imageFields = [
            { key: 'logo', dataKey: 'logo', fileName: 'bloggenius-logo' },
            { key: 'share_image', dataKey: 'shareImage', fileName: 'bloggenius-share-image' },
            { key: 'favicon', dataKey: 'favicon', fileName: 'bloggenius-favicon' }
        ];
        const nextCustomization = { ...customization };
        for (const field of imageFields) {
            const previousPath = String(siteData[field.dataKey] || '');
            const image = customization[field.key];
            if (!image) {
                delete siteData[field.dataKey];
                delete nextCustomization[field.key];
                if (previousPath.startsWith('/') && /^\/[\w.-]+\.(?:png|jpg|webp)$/u.test(previousPath)) {
                    try { fileSystem.rmSync(pathApi.join(dataRoot, 'public', previousPath.slice(1)), { force: true }); } catch (_error) { }
                }
                continue;
            }
            const assetName = `${field.fileName}.${image.extension}`;
            const assetPath = pathApi.join(dataRoot, 'public', assetName);
            const temporaryPath = `${assetPath}.${process.pid}.${Date.now()}.tmp`;
            fileSystem.writeFileSync(temporaryPath, image.content, { mode: 0o600 });
            fileSystem.renameSync(temporaryPath, assetPath);
            if (previousPath && previousPath !== `/${assetName}` && previousPath.startsWith('/') && /^\/[\w.-]+\.(?:png|jpg|webp)$/u.test(previousPath)) {
                try { fileSystem.rmSync(pathApi.join(dataRoot, 'public', previousPath.slice(1)), { force: true }); } catch (_error) { }
            }
            siteData[field.dataKey] = `/${assetName}`;
            nextCustomization[field.key] = `/${assetName}`;
        }
        const customPages = Array.isArray(customization.custom_pages) ? customization.custom_pages : [];
        for (const page of customPages) {
            const pagePath = pathApi.join(dataRoot, 'data', 'pages', `${page.slug}.md`);
            if (fileSystem.existsSync(pagePath)) continue;
            const route = internalPathname(String(page.path || `/${page.slug}/`));
            const frontmatter = `---\nkind: page\ntitle: ${JSON.stringify(page.label)}\npath: ${JSON.stringify(route)}\nis_public: true\n---\n`;
            fileSystem.writeFileSync(pagePath, frontmatter, { flag: 'wx', mode: 0o600 });
        }
        fileSystem.writeFileSync(siteDataPath, `${JSON.stringify(siteData, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
        return update(projectId, siteId, {
            name: patch.name,
            customization: nextCustomization,
            setup_inputs: patch.setup_inputs,
            updated_at: patch.updated_at
        });
    }

    function setTemplateUpdateTestVersion(projectId, siteId) {
        const site = readSite(projectId, siteId);
        if (!site) throw withStatus(new Error('사이트를 찾을 수 없습니다.'), 404, 'SITE_HOSTING_SITE_NOT_FOUND');
        const manifestPath = pathApi.join(site.root_path, '.bloggenius', 'site.json');
        const manifest = JSON.parse(String(fileSystem.readFileSync(manifestPath, 'utf8') || ''));
        const updated = { ...manifest, template: { ...manifest.template, version: '0.0.1' } };
        const tempPath = pathApi.join(pathApi.dirname(manifestPath), `.site.json.${process.pid}.${Date.now()}.tmp`);
        try {
            fileSystem.writeFileSync(tempPath, `${JSON.stringify(updated, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
            fileSystem.renameSync(tempPath, manifestPath);
        } finally {
            try { fileSystem.rmSync(tempPath, { force: true }); } catch (_error) { }
        }
        return readSite(projectId, siteId);
    }

    function applyTemplateUpdate(projectId, siteId, updatedAt = new Date().toISOString()) {
        const site = readSite(projectId, siteId);
        if (!site) throw withStatus(new Error('사이트를 찾을 수 없습니다.'), 404, 'SITE_HOSTING_SITE_NOT_FOUND');
        const template = templates.get(site.template?.id);
        const policy = SITE_HOSTING_TEMPLATE_UPDATE_POLICY;
        if (!site.template_update_available || !template || !isSupportedSiteHostingContractVersion(template.resource?.spec_version)
            || policy.strategy !== 'replace-managed-paths' || policy.managed_paths.length !== 1
            || policy.managed_paths[0] !== 'template/astro'
            || !policy.preserved_paths.includes('.bloggenius') || !policy.preserved_paths.includes('site-data')) {
            throw withStatus(new Error('이 템플릿은 안전한 업데이트를 지원하지 않습니다.'), 409, 'SITE_HOSTING_TEMPLATE_UPDATE_UNAVAILABLE');
        }

        const metadataRoot = pathApi.join(site.root_path, '.bloggenius');
        const stagingRoot = pathApi.join(metadataRoot, `.template-update-${process.pid}-${Date.now()}`);
        const stagedProjectRoot = pathApi.join(stagingRoot, 'template', 'astro');
        const projectRoot = pathApi.join(site.root_path, 'template', 'astro');
        const backupRoot = pathApi.join(metadataRoot, `.template-astro-backup-${process.pid}-${Date.now()}`);
        const manifestPath = pathApi.join(metadataRoot, 'site.json');
        let oldProjectMoved = false;
        let newProjectMoved = false;
        let manifestCommitted = false;
        let tempManifestPath = '';
        try {
            fileSystem.mkdirSync(stagingRoot, { recursive: true });
            templates.copySource(template.id, stagingRoot);
            if (!fileSystem.existsSync(stagedProjectRoot) || !fileSystem.statSync(stagedProjectRoot).isDirectory()) {
                throw withStatus(new Error('업데이트할 템플릿 프로젝트를 찾을 수 없습니다.'), 409, 'SITE_HOSTING_TEMPLATE_UPDATE_SOURCE_INVALID');
            }

            const manifest = JSON.parse(String(fileSystem.readFileSync(manifestPath, 'utf8') || ''));
            fileSystem.renameSync(projectRoot, backupRoot);
            oldProjectMoved = true;
            fileSystem.renameSync(stagedProjectRoot, projectRoot);
            newProjectMoved = true;
            const updatedManifest = {
                ...manifest,
                template: {
                    ...manifest.template,
                    version: template.version,
                    ...(template.source_revision ? { source_revision: template.source_revision } : {}),
                    updated_at: String(updatedAt)
                },
                updated_at: String(updatedAt)
            };
            tempManifestPath = pathApi.join(metadataRoot, `.site.json.${process.pid}.${Date.now()}.tmp`);
            fileSystem.writeFileSync(tempManifestPath, `${JSON.stringify(updatedManifest, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
            fileSystem.renameSync(tempManifestPath, manifestPath);
            manifestCommitted = true;
            try { fileSystem.rmSync(backupRoot, { recursive: true, force: true }); } catch (_cleanupError) { }
            return readSite(projectId, siteId);
        } catch (cause) {
            if (!manifestCommitted && newProjectMoved) {
                try { fileSystem.rmSync(projectRoot, { recursive: true, force: true }); } catch (_cleanupError) { }
            }
            if (!manifestCommitted && oldProjectMoved) {
                try { fileSystem.renameSync(backupRoot, projectRoot); } catch (_rollbackError) { }
            }
            if (manifestCommitted) {
                throw withStatus(new Error('템플릿은 업데이트했지만 사이트 목록을 새로 읽지 못했습니다.'), 500, 'SITE_HOSTING_TEMPLATE_UPDATE_REFRESH_FAILED');
            }
            if (cause?.code?.startsWith?.('SITE_HOSTING_')) throw cause;
            const error = new Error('템플릿 업데이트를 적용하지 못했습니다. 기존 템플릿을 복구했습니다.');
            error.code = 'SITE_HOSTING_TEMPLATE_UPDATE_FAILED';
            error.status = 500;
            error.cause = cause;
            throw error;
        } finally {
            try { fileSystem.rmSync(stagingRoot, { recursive: true, force: true }); } catch (_cleanupError) { }
            if (tempManifestPath) try { fileSystem.rmSync(tempManifestPath, { force: true }); } catch (_cleanupError) { }
        }
    }

    return { list, get, create, getArchiveTarget, archive, createPreviewDraft, removePreviewDraft, update, updateSettings, setTemplateUpdateTestVersion, applyTemplateUpdate, recordDeployment, clearDeployment, recordBuildResult, recordBuildScreenshot, getScreenshot, recordCustomDomainBinding, clearCustomDomainBinding };
}

module.exports = { SITE_SCHEMA_VERSION, safeSiteId, createSiteHostingSiteRepository };
