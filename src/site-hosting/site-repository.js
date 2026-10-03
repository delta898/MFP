'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SITE_SCHEMA_VERSION = 1;

function safeSiteId(value) {
    const id = String(value || '').trim();
    return /^[a-zA-Z0-9_-]{1,100}$/.test(id) ? id : '';
}

function createSiteHostingSiteRepository(options = {}) {
    const fileSystem = options.fs || fs;
    const pathApi = options.path || path;
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
        return pathApi.join(project.root_path, 'sites');
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
            if (site?.id !== safeId || site?.project_id !== projectId || site?.schema_version !== SITE_SCHEMA_VERSION || !String(site?.name || '').trim()) {
                throw new Error('Site manifest contract mismatch.');
            }
            const template = templates.get(site.template?.id);
            if (!template || template.version !== site.template?.version) {
                site.template_status = 'unavailable';
            } else {
                site.template_name = template.name;
                site.template_status = 'available';
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
            // Keep card positions tied to creation order; builds and deployments update updated_at.
            .sort((left, right) => String(left.created_at || '').localeCompare(String(right.created_at || ''))
                || String(left.id || '').localeCompare(String(right.id || '')));
    }

    function get(projectId, siteId) {
        return readSite(String(projectId || '').trim(), String(siteId || '').trim());
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
                    ...(templateSnapshot.source_revision ? { source_revision: templateSnapshot.source_revision } : {})
                },
                ...(customization ? { customization } : {}),
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

    function applyTemplateCustomization(template, siteRoot, site) {
        const fields = template.resource?.site_hosting?.customization?.fields;
        if (!Array.isArray(fields) || !fields.length) return null;
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
                if (field.key === 'navigation' && Array.isArray(value) && Array.isArray(values.navigation)) {
                    const defaults = values.navigation;
                    values.navigation = defaults.map((item, index) => ({ ...item, label: String(value[index]?.label || item.label) }));
                    for (const item of value.slice(defaults.length)) {
                        if (!/^\/[\p{L}\p{N}%_-]+\/$/u.test(String(item?.href || '')) || !String(item?.label || '').trim()) {
                            const error = new Error('템플릿 메뉴 값이 올바르지 않습니다.');
                            error.code = 'SITE_HOSTING_TEMPLATE_MANIFEST_INVALID';
                            error.status = 502;
                            throw error;
                        }
                        values.navigation.push({ label: String(item.label).trim(), href: item.href });
                    }
                } else if (field.key === 'logo' && value?.content && ['png', 'jpg', 'webp'].includes(value.extension)) {
                    const logoPath = pathApi.join(siteRoot, 'public', `bloggenius-logo.${value.extension}`);
                    fileSystem.mkdirSync(pathApi.dirname(logoPath), { recursive: true });
                    fileSystem.writeFileSync(logoPath, value.content, { flag: 'wx', mode: 0o600 });
                    values.logo = `/bloggenius-logo.${value.extension}`;
                }
            }
        }
        const publishing = template.resource?.site_hosting?.publishing;
        const postListSelection = site.customization?.publishing;
        if (postListSelection) {
            const navigation = values.navigation;
            const index = postListSelection.post_list_navigation_index;
            const listingRoute = publishing?.schema_version === 2 ? publishing.routes?.listing : '';
            if (!Array.isArray(navigation) || !Number.isInteger(index) || index < 0 || index >= navigation.length
                || typeof listingRoute !== 'string' || !listingRoute.startsWith('/') || listingRoute.startsWith('//')
                || /[?#\\\\]/.test(listingRoute) || listingRoute.split('/').some((part) => part === '..' || part === '.')) {
                const error = new Error('글 목록 메뉴 설정이 템플릿 규칙과 일치하지 않습니다.');
                error.code = 'SITE_HOSTING_POST_LIST_MENU_INVALID';
                error.status = 400;
                throw error;
            }
            navigation[index] = { ...navigation[index], href: listingRoute };
            values.publishing = { listing_route: listingRoute, post_list_navigation_index: index };
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
        if (pages && pageContract?.schema_version === 1 && pageContract.mode === 'static_placeholders') {
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
                deployed_at: String(deployment.deployed_at || '')
            },
            updated_at: String(deployment.deployed_at || manifest.updated_at || '')
        };
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
            updated_at: String(patch.updated_at || new Date().toISOString())
        };
        const tempPath = pathApi.join(pathApi.dirname(manifestPath), `.site.json.${process.pid}.${Date.now()}.tmp`);
        fileSystem.writeFileSync(tempPath, `${JSON.stringify(updated, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
        fileSystem.renameSync(tempPath, manifestPath);
        return readSite(projectId, siteId);
    }

    return { list, get, create, update, recordDeployment, recordBuildResult, recordBuildScreenshot, getScreenshot, recordCustomDomainBinding };
}

module.exports = { SITE_SCHEMA_VERSION, safeSiteId, createSiteHostingSiteRepository };
