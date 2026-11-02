'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const http = require('node:http');
const { spawn } = require('node:child_process');
const BUILD_TIMEOUT_MS = 10 * 60 * 1000;
const VIEWPORT = Object.freeze({ width: 1200, height: 675 });
const CONTENT_TYPES = {
    '.css': 'text/css; charset=utf-8',
    '.avif': 'image/avif',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain; charset=utf-8',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.xml': 'application/xml; charset=utf-8'
};

function replaceFile(fileSystem, tempPath, targetPath, backupPath) {
    try {
        fileSystem.renameSync(tempPath, targetPath);
    } catch (cause) {
        if (!fileSystem.existsSync(targetPath) || !['EEXIST', 'EPERM', 'ENOTEMPTY'].includes(cause?.code)) throw cause;
        fileSystem.renameSync(targetPath, backupPath);
        try {
            fileSystem.renameSync(tempPath, targetPath);
            fileSystem.unlinkSync(backupPath);
        } catch (replaceError) {
            try {
                if (fileSystem.existsSync(targetPath)) fileSystem.unlinkSync(targetPath);
                fileSystem.renameSync(backupPath, targetPath);
            } catch (_restoreError) { }
            throw replaceError;
        }
    }
}

function createAstroSiteRuntime(options = {}) {
    const fileSystem = options.fs || fs;
    const pathApi = options.path || path;
    const projectRepository = options.projectRepository;
    const templates = options.templates;
    const siteRepository = options.siteRepository;
    if (!projectRepository || !templates || !siteRepository) {
        throw new TypeError('Astro Site Hosting Plugin requires project, site, and template ports.');
    }
    if (typeof options.normalizeMenuDestination !== 'function') {
        throw new TypeError('Astro Site Hosting Plugin requires the site navigation contract port.');
    }
    const spawnProcess = options.spawn || spawn;
    const buildJobs = new Map();
    const previewServers = new Map();
    const knowledgeCollectionBuilder = options.knowledgeCollectionBuilder;
    const normalizeMenuDestination = options.normalizeMenuDestination;
    const npmCliPath = options.npmCliPath || pathApi.join(pathApi.dirname(require.resolve('npm/package.json')), 'bin', 'npm-cli.js');
    const cacheRoot = options.cacheRoot || pathApi.join(os.tmpdir(), 'bloggenius-site-npm-cache');
    const captureScreenshot = options.captureScreenshot || (async () => { throw new Error('Site screenshot capture is unavailable.'); });

    function ensureNodeShim() {
        const binRoot = pathApi.join(cacheRoot, 'runtime-bin');
        fileSystem.mkdirSync(binRoot, { recursive: true });
        if (process.platform === 'win32') {
            fileSystem.writeFileSync(pathApi.join(binRoot, 'node.cmd'), '@echo off\r\n"%BLOGGENIUS_NODE_EXECUTABLE%" %*\r\n', { encoding: 'utf8', mode: 0o700 });
        } else {
            const shimPath = pathApi.join(binRoot, 'node');
            fileSystem.writeFileSync(shimPath, '#!/bin/sh\nexec "$BLOGGENIUS_NODE_EXECUTABLE" "$@"\n', { encoding: 'utf8', mode: 0o700 });
            fileSystem.chmodSync(shimPath, 0o700);
        }
        return binRoot;
    }

    function getSite(projectId, siteId) {
        const site = siteRepository.get(projectId, siteId);
        if (!site) {
            const error = new Error('사이트를 찾을 수 없습니다.');
            error.code = 'SITE_HOSTING_SITE_NOT_FOUND';
            error.status = 404;
            throw error;
        }
        return site;
    }

    function getAstroProjectRoot(site) {
        const siteRoot = pathApi.resolve(site.root_path);
        const nestedRoot = pathApi.join(siteRoot, 'template', 'astro');
        return fileSystem.existsSync(pathApi.join(nestedRoot, 'package.json')) ? nestedRoot : siteRoot;
    }

    function getPublicSiteUrl(site, environment = 'production') {
        const selected = environment === 'production' ? 'production' : 'development';
        let bindingHost = String(site?.custom_domain_bindings?.[selected]?.hostname
            || (selected === 'production' ? site?.custom_domain_binding?.hostname : '') || '').trim();
        if (selected === 'development' && !bindingHost && site?.domain) {
            const labels = String(site.hostname || '').trim().split('.');
            if (labels[0] && !labels[0].endsWith('-dev')) labels[0] = `${labels[0]}-dev`;
            bindingHost = labels.filter(Boolean).length ? `${labels.join('.')}.${String(site.domain).trim()}` : String(site.domain).trim();
        }
        const deployment = site?.deployments?.[selected] || (selected === 'production' ? site?.deployment : null);
        const raw = bindingHost ? `https://${bindingHost}` : String(deployment?.url || '').trim();
        try {
            const url = new URL(raw);
            if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return '';
            return `${url.origin}/`;
        } catch (_error) {
            return '';
        }
    }

    function buildKnowledgeCollection(site) {
        const templateId = site?.template?.id || site?.template_id;
        const template = templates.get(templateId);
        const declared = template?.resource?.template?.setup_inputs;
        if (!Array.isArray(declared)) return null;
        const rootInput = declared.find((item) => item.type === 'directory' && item.purpose === 'knowledge_collection');
        const filterInput = declared.find((item) => item.type === 'frontmatter_match' && item.purpose === 'publication_filter');
        if (!rootInput || !filterInput) return null;
        if (!knowledgeCollectionBuilder || typeof knowledgeCollectionBuilder.build !== 'function') {
            throw new TypeError('Astro Site Hosting Plugin requires the knowledge-collection builder for this template.');
        }
        return knowledgeCollectionBuilder.build({
            vaultRoot: site?.setup_inputs?.[rootInput.id],
            publicationFilter: site?.setup_inputs?.[filterInput.id],
            siteRoot: site.root_path
        });
    }

    async function buildAstroProject(site, environment = 'production') {
        const projectRoot = getAstroProjectRoot(site);
        const buildEnvironment = {
            BLOGGENIUS_ENV: environment,
            BLOGGENIUS_SITE_URL: getPublicSiteUrl(site, environment),
            PUBLIC_TRENDS_API_BASE_URL: environment === 'local'
                ? (process.env.BLOGGENIUS_LOCAL_TRENDS_API_URL || 'http://127.0.0.1:4581')
                : environment === 'development' ? 'https://trendapi-dev.hangadac.com' : 'https://trendapi.hangadac.com'
        };
        const knowledgeCollection = buildKnowledgeCollection(site);
        await runNpm(projectRoot, ['ci', '--no-audit', '--no-fund'], buildEnvironment);
        await runNpm(projectRoot, ['run', 'build'], buildEnvironment);
        if (projectRoot !== pathApi.resolve(site.root_path)) {
            const builtOutput = pathApi.join(projectRoot, 'dist');
            if (!fileSystem.existsSync(builtOutput) || !fileSystem.statSync(builtOutput).isDirectory()) {
                const error = new Error('Astro 템플릿에서 dist 빌드 결과를 만들지 못했습니다.');
                error.code = 'SITE_HOSTING_BUILD_OUTPUT_MISSING';
                throw error;
            }
            const outputPath = pathApi.join(site.root_path, 'dist');
            const backupPath = pathApi.join(site.root_path, `.dist.previous-${process.pid}-${Date.now()}`);
            const hadOutput = fileSystem.existsSync(outputPath);
            if (hadOutput) fileSystem.renameSync(outputPath, backupPath);
            try {
                fileSystem.renameSync(builtOutput, outputPath);
                if (hadOutput) fileSystem.rmSync(backupPath, { recursive: true, force: true });
            } catch (error) {
                if (hadOutput && fileSystem.existsSync(backupPath) && !fileSystem.existsSync(outputPath)) fileSystem.renameSync(backupPath, outputPath);
                throw error;
            }
        }
        return knowledgeCollection;
    }

    function runNpm(siteRoot, args, extraEnvironment = {}) {
        return new Promise((resolve, reject) => {
            const runtimeBin = ensureNodeShim();
            const child = spawnProcess(process.execPath, [npmCliPath, ...args], {
                cwd: siteRoot,
                env: {
                    PATH: [runtimeBin, process.env.PATH || ''].filter(Boolean).join(pathApi.delimiter),
                    HOME: process.env.HOME || '',
                    USERPROFILE: process.env.USERPROFILE || '',
                    TMP: process.env.TMP || os.tmpdir(),
                    TEMP: process.env.TEMP || os.tmpdir(),
                    TMPDIR: process.env.TMPDIR || os.tmpdir(),
                    SYSTEMROOT: process.env.SYSTEMROOT || '',
                    WINDIR: process.env.WINDIR || '',
                    APPDATA: process.env.APPDATA || '',
                    LOCALAPPDATA: process.env.LOCALAPPDATA || '',
                    ELECTRON_RUN_AS_NODE: '1',
                    BLOGGENIUS_NODE_EXECUTABLE: process.execPath,
                    npm_config_cache: cacheRoot,
                    npm_config_audit: 'false',
                    npm_config_fund: 'false',
                    npm_config_update_notifier: 'false',
                    ...extraEnvironment
                },
                detached: process.platform !== 'win32',
                windowsHide: true,
                stdio: ['ignore', 'pipe', 'pipe']
            });
            let output = '';
            let settled = false;
            const append = (chunk) => {
                output = `${output}${String(chunk)}`.slice(-30000);
            };
            child.stdout?.on('data', append);
            child.stderr?.on('data', append);
            const timer = setTimeout(() => {
                if (process.platform !== 'win32' && Number.isInteger(child.pid)) {
                    try { process.kill(-child.pid, 'SIGTERM'); } catch (_error) { child.kill('SIGTERM'); }
                } else {
                    child.kill('SIGTERM');
                }
                const error = new Error('사이트 작업이 제한 시간 안에 끝나지 않았습니다.');
                error.code = 'SITE_HOSTING_BUILD_TIMEOUT';
                error.output = output;
                if (!settled) {
                    settled = true;
                    reject(error);
                }
            }, BUILD_TIMEOUT_MS);
            child.once('error', (cause) => {
                clearTimeout(timer);
                if (settled) return;
                settled = true;
                const error = new Error('사이트 도구를 실행하지 못했습니다.');
                error.code = 'SITE_HOSTING_TOOL_START_FAILED';
                error.cause = cause;
                error.output = output;
                reject(error);
            });
            child.once('close', (code, signal) => {
                clearTimeout(timer);
                if (settled) return;
                settled = true;
                if (code === 0) return resolve({ output });
                const error = new Error(`사이트 작업이 실패했습니다${signal ? ` (${signal})` : ` (exit ${code})`}.`);
                error.code = 'SITE_HOSTING_BUILD_FAILED';
                error.output = output;
                const diagnostic = output.trim().split(/\r?\n/).slice(-5).join('\n').trim();
                if (diagnostic) error.message = `${error.message}\n${diagnostic.slice(-1600)}`;
                reject(error);
            });
        });
    }

    function routeOutputDirectory(distRoot, route) {
        try {
            if (normalizeMenuDestination(route) !== route || !route.startsWith('/') || route.startsWith('//')) return null;
            const parsed = new URL(route, 'https://bloggenius.invalid/');
            if (parsed.search || parsed.hash) return null;
            const pathname = parsed.pathname;
            const encodedSegments = pathname.split('/').filter(Boolean);
            if (!encodedSegments.length) return null;
            const segments = encodedSegments.map((encoded) => decodeURIComponent(encoded));
            if (segments.some((segment) => !segment || segment === '.' || segment === '..' || /[\\/\u0000-\u001f\u007f]/u.test(segment))) return null;
            const root = pathApi.resolve(distRoot);
            const output = pathApi.resolve(root, ...segments);
            return output.startsWith(`${root}${pathApi.sep}`) ? output : null;
        } catch (_error) { return null; }
    }

    function applyPublishingRoute(site) {
        const selectedRoute = String(site.customization?.publishing?.listing_route || '');
        if (!selectedRoute) return;
        const template = templates.get(site.template?.id);
        const contentModel = template?.resource?.content_model || template?.resource?.family;
        const defaultRoute = String(template?.resource?.site_hosting?.publishing?.routes?.listing
            || contentModel?.content_types?.find((item) => item.kind === 'post')?.listing_route || '');
        if (!defaultRoute || selectedRoute === defaultRoute) return;
        const distRoot = pathApi.join(site.root_path, 'dist');
        const sourceDirectory = routeOutputDirectory(distRoot, defaultRoute);
        const destinationDirectory = routeOutputDirectory(distRoot, selectedRoute);
        if (!sourceDirectory || !destinationDirectory || sourceDirectory === destinationDirectory) return;
        const sourceIndex = pathApi.join(sourceDirectory, 'index.html');
        if (!fileSystem.existsSync(sourceIndex) || !fileSystem.statSync(sourceIndex).isFile()) return;
        if (fileSystem.existsSync(destinationDirectory)) {
            // A site builder may already own this route; preserve its output and
            // let the normal site build finish without taking over that path.
            return;
        }
        fileSystem.mkdirSync(pathApi.dirname(destinationDirectory), { recursive: true });
        fileSystem.renameSync(sourceDirectory, destinationDirectory);
        const replaceLinks = (directory) => {
            for (const entry of fileSystem.readdirSync(directory, { withFileTypes: true })) {
                const entryPath = pathApi.join(directory, entry.name);
                if (entry.isDirectory()) {
                    replaceLinks(entryPath);
                } else if (entry.isFile() && entry.name.endsWith('.html')) {
                    const html = String(fileSystem.readFileSync(entryPath, 'utf8') || '');
                    const updated = html.split(defaultRoute).join(selectedRoute);
                    if (updated !== html) fileSystem.writeFileSync(entryPath, updated, { encoding: 'utf8', mode: 0o600 });
                }
            }
        };
        replaceLinks(destinationDirectory);
    }

    async function buildDraftPreview(site) {
        const key = `draft/${site.project_id}/${site.id}`;
        if (buildJobs.get(key)?.status === 'running') {
            const error = new Error('이미 미리보기를 만들고 있습니다.');
            error.code = 'SITE_HOSTING_BUILD_IN_PROGRESS';
            error.status = 409;
            throw error;
        }
        const projectRoot = getAstroProjectRoot(site);
        const packagePath = pathApi.join(projectRoot, 'package.json');
        const lockPath = pathApi.join(projectRoot, 'package-lock.json');
        if (!fileSystem.existsSync(packagePath) || !fileSystem.existsSync(lockPath)) {
            const error = new Error('package.json과 package-lock.json이 있는 Astro 프로젝트가 필요합니다.');
            error.code = 'SITE_HOSTING_ASTRO_PROJECT_REQUIRED';
            error.status = 400;
            throw error;
        }
        let packageJson;
        try { packageJson = JSON.parse(fileSystem.readFileSync(packagePath, 'utf8')); }
        catch (cause) {
            const error = new Error('package.json을 읽을 수 없습니다.');
            error.code = 'SITE_HOSTING_PACKAGE_JSON_INVALID';
            error.status = 400;
            error.cause = cause;
            throw error;
        }
        if (!packageJson?.scripts?.build) {
            const error = new Error('package.json에 build 명령이 없습니다.');
            error.code = 'SITE_HOSTING_BUILD_SCRIPT_REQUIRED';
            error.status = 400;
            throw error;
        }
        const job = { status: 'running', build_id: crypto.randomUUID().replace(/-/g, ''), started_at: new Date().toISOString(), finished_at: '', message: '미리보기를 빌드하고 있습니다.' };
        buildJobs.set(key, job);
        try {
            const knowledgeCollection = await buildAstroProject(site);
            try { applyPublishingRoute(site); }
            catch (error) { console.warn('[Site Hosting] draft preview route adjustment skipped', { site_id: site.id, message: String(error?.message || error).slice(0, 500) }); }
            const indexPath = pathApi.join(site.root_path, 'dist', 'index.html');
            if (!fileSystem.existsSync(indexPath) || !fileSystem.statSync(indexPath).isFile()) {
                const error = new Error('빌드 결과에서 dist/index.html을 찾지 못했습니다.');
                error.code = 'SITE_HOSTING_BUILD_OUTPUT_MISSING';
                throw error;
            }
            const preview = await ensurePreviewServer(site, `draft/${site.project_id}/${site.id}`);
            Object.assign(job, { status: 'succeeded', finished_at: new Date().toISOString(), message: '미리보기를 준비했습니다.', url: preview.url, knowledge_collection: knowledgeCollection });
            return { ...job, output: undefined };
        } catch (error) {
            Object.assign(job, { status: 'failed', finished_at: new Date().toISOString(), message: error.message, output: String(error.output || '').slice(-12000) });
            throw error;
        } finally {
            if (job.status === 'failed') buildJobs.delete(key);
            else buildJobs.set(key, job);
        }
    }

    async function build(projectId, siteId, environment = 'production') {
        const site = getSite(projectId, siteId);
        const key = `${projectId}/${siteId}`;
        if (buildJobs.get(key)?.status === 'running') {
            const error = new Error('이미 사이트 작업이 진행 중입니다.');
            error.code = 'SITE_HOSTING_BUILD_IN_PROGRESS';
            error.status = 409;
            throw error;
        }
        const projectRoot = getAstroProjectRoot(site);
        const packagePath = pathApi.join(projectRoot, 'package.json');
        const lockPath = pathApi.join(projectRoot, 'package-lock.json');
        if (!fileSystem.existsSync(packagePath) || !fileSystem.existsSync(lockPath)) {
            const error = new Error('package.json과 package-lock.json이 있는 Astro 프로젝트가 필요합니다.');
            error.code = 'SITE_HOSTING_ASTRO_PROJECT_REQUIRED';
            error.status = 400;
            throw error;
        }
        let packageJson;
        try {
            packageJson = JSON.parse(fileSystem.readFileSync(packagePath, 'utf8'));
        } catch (cause) {
            const error = new Error('package.json을 읽을 수 없습니다.');
            error.code = 'SITE_HOSTING_PACKAGE_JSON_INVALID';
            error.status = 400;
            error.cause = cause;
            throw error;
        }
        if (!packageJson?.scripts?.build) {
            const error = new Error('package.json에 build 명령이 없습니다.');
            error.code = 'SITE_HOSTING_BUILD_SCRIPT_REQUIRED';
            error.status = 400;
            throw error;
        }
        const job = { status: 'running', build_id: crypto.randomUUID().replace(/-/g, ''), started_at: new Date().toISOString(), finished_at: '', message: '' };
        buildJobs.set(key, job);
        try {
            const knowledgeCollection = await buildAstroProject(site, environment);
            try { applyPublishingRoute(site); }
            catch (error) {
                console.warn('[Site Hosting] post-list route adjustment skipped', {
                    site_id: site.id, message: String(error?.message || error).slice(0, 500)
                });
            }
            const indexPath = pathApi.join(site.root_path, 'dist', 'index.html');
            if (!fileSystem.existsSync(indexPath) || !fileSystem.statSync(indexPath).isFile()) {
                const error = new Error('빌드 결과에서 dist/index.html을 찾지 못했습니다.');
                error.code = 'SITE_HOSTING_BUILD_OUTPUT_MISSING';
                throw error;
            }
            const completedAt = new Date().toISOString();
            Object.assign(job, { status: 'succeeded', finished_at: completedAt, message: '사이트를 빌드했습니다.', ...(knowledgeCollection ? { knowledge_collection: knowledgeCollection } : {}) });
            siteRepository.recordBuildResult?.(projectId, siteId, { build_id: job.build_id, completed_at: completedAt });
            const existingPreview = previewServers.has(key);
            try {
                const preview = await ensurePreviewServer(site);
                const captured = await captureScreenshot(preview.url, { viewport: VIEWPORT });
                const fileName = 'build-preview.jpg';
                const metadataRoot = pathApi.join(site.root_path, '.bloggenius');
                fileSystem.mkdirSync(metadataRoot, { recursive: true });
                const relativePath = `.bloggenius/${fileName}`;
                const screenshotPath = pathApi.join(metadataRoot, fileName);
                const tempScreenshotPath = pathApi.join(metadataRoot, `.${fileName}.${process.pid}.${job.build_id}.tmp`);
                const backupScreenshotPath = pathApi.join(metadataRoot, `.${fileName}.${process.pid}.${job.build_id}.bak`);
                try {
                    fileSystem.writeFileSync(tempScreenshotPath, captured.buffer, { flag: 'wx', mode: 0o600 });
                    replaceFile(fileSystem, tempScreenshotPath, screenshotPath, backupScreenshotPath);
                } catch (error) {
                    try { fileSystem.unlinkSync(tempScreenshotPath); } catch (_cleanupError) { }
                    throw error;
                }
                const screenshot = siteRepository.recordBuildScreenshot(projectId, siteId, {
                    path: relativePath,
                    build_id: job.build_id,
                    captured_at: completedAt,
                    viewport: captured.viewport || VIEWPORT
                });
                job.message = '사이트 빌드와 스크린샷 생성을 마쳤습니다.';
                job.screenshot = screenshot.screenshot?.latest_build || null;
            } catch (screenshotError) {
                job.screenshot_error = String(screenshotError?.message || '스크린샷을 만들지 못했습니다.');
                job.message = '사이트 빌드를 마쳤지만 새 스크린샷을 만들지 못했습니다.';
            } finally {
                if (!existingPreview) await stopPreview(projectId, siteId);
            }
        } catch (error) {
            Object.assign(job, {
                status: 'failed',
                finished_at: new Date().toISOString(),
                message: error.message,
                output: String(error.output || '').slice(-12000)
            });
            throw error;
        } finally {
            buildJobs.delete(key);
            buildJobs.set(key, job);
        }
        return { ...job, output: undefined };
    }

    function getBuildStatus(projectId, siteId) {
        getSite(projectId, siteId);
        const job = buildJobs.get(`${projectId}/${siteId}`);
        return job ? { ...job, output: undefined } : { status: 'not_started' };
    }

    async function ensurePreviewServer(site, key = `${site.project_id}/${site.id}`) {
        const distRoot = pathApi.join(site.root_path, 'dist');
        const indexPath = pathApi.join(distRoot, 'index.html');
        if (!fileSystem.existsSync(indexPath) || !fileSystem.statSync(indexPath).isFile()) {
            const error = new Error('미리보기 전에 사이트를 먼저 빌드해 주세요.');
            error.code = 'SITE_HOSTING_BUILD_REQUIRED';
            error.status = 409;
            throw error;
        }
        const resolvedDistRoot = await fileSystem.promises.realpath(distRoot);
        const resolvedDistPrefix = `${resolvedDistRoot}${pathApi.sep}`;
        const existing = previewServers.get(key);
        if (existing) return { url: existing.url };

        const server = http.createServer(async (request, response) => {
            try {
                if (!['GET', 'HEAD'].includes(request.method)) {
                    response.writeHead(405, { Allow: 'GET, HEAD' }).end('Method Not Allowed');
                    return;
                }
                let pathname;
                try { pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname); }
                catch (_error) { response.writeHead(400).end('Bad Request'); return; }
                let filePath = pathApi.resolve(distRoot, `.${pathname}`);
                const distPrefix = `${pathApi.resolve(distRoot)}${pathApi.sep}`;
                if (filePath !== pathApi.resolve(distRoot) && !filePath.startsWith(distPrefix)) {
                    response.writeHead(403).end('Forbidden');
                    return;
                }
                let resolvedPath;
                try { resolvedPath = await fileSystem.promises.realpath(filePath); }
                catch (_error) { response.writeHead(404).end('Not Found'); return; }
                if (resolvedPath !== resolvedDistRoot && !resolvedPath.startsWith(resolvedDistPrefix)) {
                    response.writeHead(403).end('Forbidden');
                    return;
                }
                let stat = await fileSystem.promises.stat(resolvedPath);
                if (stat.isDirectory()) {
                    resolvedPath = pathApi.join(resolvedPath, 'index.html');
                    try {
                        const resolvedIndex = await fileSystem.promises.realpath(resolvedPath);
                        if (!resolvedIndex.startsWith(resolvedDistPrefix)) { response.writeHead(403).end('Forbidden'); return; }
                        resolvedPath = resolvedIndex;
                        stat = await fileSystem.promises.stat(resolvedPath);
                    }
                    catch (_error) { response.writeHead(404).end('Not Found'); return; }
                }
                if (!stat.isFile()) { response.writeHead(404).end('Not Found'); return; }
                response.writeHead(200, {
                    'Content-Type': CONTENT_TYPES[pathApi.extname(resolvedPath).toLowerCase()] || 'application/octet-stream',
                    'Content-Length': stat.size,
                    'X-Content-Type-Options': 'nosniff'
                });
                if (request.method === 'HEAD') { response.end(); return; }
                fileSystem.createReadStream(resolvedPath).pipe(response);
            } catch (_error) {
                if (!response.headersSent) response.writeHead(500);
                response.end('Internal Server Error');
            }
        });
        await new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen(0, '127.0.0.1', resolve);
        });
        const address = server.address();
        const preview = { server, url: `http://127.0.0.1:${address.port}/` };
        previewServers.set(key, preview);
        server.once('close', () => previewServers.delete(key));
        return { url: preview.url };
    }

    async function startPreview(projectId, siteId, environment = 'production') {
        const site = getSite(projectId, siteId);
        const buildResult = await build(projectId, siteId, environment);
        const preview = await ensurePreviewServer(site);
        return {
            ...preview,
            screenshot: buildResult.screenshot || null,
            knowledge_collection: buildResult.knowledge_collection || null,
            screenshot_error: buildResult.screenshot_error || ''
        };
    }

    async function stopPreview(projectId, siteId) {
        return stopPreviewByKey(`${projectId}/${siteId}`);
    }

    async function stopDraftPreview(projectId, draftId) {
        const key = `draft/${projectId}/${draftId}`;
        const result = await stopPreviewByKey(key);
        buildJobs.delete(key);
        return result;
    }

    async function stopPreviewByKey(key) {
        const preview = previewServers.get(key);
        if (!preview) return { stopped: false };
        await new Promise((resolve) => preview.server.close(resolve));
        previewServers.delete(key);
        return { stopped: true };
    }

    async function startDraftPreview(site) {
        const result = await buildDraftPreview(site);
        return { url: result.url, knowledge_collection: result.knowledge_collection || null };
    }

    return { build, getBuildStatus, startPreview, stopPreview, startDraftPreview, stopDraftPreview };
}

module.exports = { BUILD_TIMEOUT_MS, createAstroSiteRuntime, replaceFile };
