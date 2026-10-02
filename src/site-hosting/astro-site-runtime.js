'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { createSiteHostingProjectRepository } = require('./project-repository');
const { createSiteHostingSiteRepository } = require('./site-repository');
const { createSiteTemplateCatalog } = require('./site-template-catalog');

const BUILD_TIMEOUT_MS = 10 * 60 * 1000;
const CONTENT_TYPES = {
    '.css': 'text/css; charset=utf-8',
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

function createAstroSiteRuntime(options = {}) {
    const fileSystem = options.fs || fs;
    const pathApi = options.path || path;
    const projectRepository = options.projectRepository || createSiteHostingProjectRepository(options);
    const templates = options.templates || createSiteTemplateCatalog({
        fs: fileSystem,
        path: pathApi,
        templatesRoot: options.templatesRoot
    });
    const siteRepository = options.siteRepository || createSiteHostingSiteRepository({
        ...options,
        projectRepository,
        templates
    });
    const spawnProcess = options.spawn || spawn;
    const buildJobs = new Map();
    const previewServers = new Map();
    const npmCliPath = options.npmCliPath || pathApi.join(pathApi.dirname(require.resolve('npm/package.json')), 'bin', 'npm-cli.js');
    const cacheRoot = options.cacheRoot || pathApi.join(os.tmpdir(), 'bloggenius-site-npm-cache');

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

    function runNpm(siteRoot, args) {
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
                    npm_config_update_notifier: 'false'
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

    async function build(projectId, siteId) {
        const site = getSite(projectId, siteId);
        const key = `${projectId}/${siteId}`;
        if (buildJobs.get(key)?.status === 'running') {
            const error = new Error('이미 사이트 작업이 진행 중입니다.');
            error.code = 'SITE_HOSTING_BUILD_IN_PROGRESS';
            error.status = 409;
            throw error;
        }
        const packagePath = pathApi.join(site.root_path, 'package.json');
        const lockPath = pathApi.join(site.root_path, 'package-lock.json');
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
        const job = { status: 'running', started_at: new Date().toISOString(), finished_at: '', message: '' };
        buildJobs.set(key, job);
        try {
            await runNpm(site.root_path, ['ci', '--no-audit', '--no-fund']);
            await runNpm(site.root_path, ['run', 'build']);
            const indexPath = pathApi.join(site.root_path, 'dist', 'index.html');
            if (!fileSystem.existsSync(indexPath) || !fileSystem.statSync(indexPath).isFile()) {
                const error = new Error('빌드 결과에서 dist/index.html을 찾지 못했습니다.');
                error.code = 'SITE_HOSTING_BUILD_OUTPUT_MISSING';
                throw error;
            }
            Object.assign(job, { status: 'succeeded', finished_at: new Date().toISOString(), message: '사이트를 빌드했습니다.' });
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

    async function startPreview(projectId, siteId) {
        const site = getSite(projectId, siteId);
        const key = `${projectId}/${siteId}`;
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

    async function stopPreview(projectId, siteId) {
        const key = `${projectId}/${siteId}`;
        const preview = previewServers.get(key);
        if (!preview) return { stopped: false };
        await new Promise((resolve) => preview.server.close(resolve));
        previewServers.delete(key);
        return { stopped: true };
    }

    return { build, getBuildStatus, startPreview, stopPreview };
}

module.exports = { BUILD_TIMEOUT_MS, createAstroSiteRuntime };
