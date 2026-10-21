'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
    resolvePackagedDefaultAssets
} = require('./packaged-default-assets');
const {
    resolveLicenseKeyStoragePaths
} = require('../../adapters/storage/license-keys/license-key-storage');
const {
    resolveRuntimeEnvironmentProfile
} = require('./environment/runtime-profile');

const LICENSE_FILE_NAMES = Object.freeze({
    local: 'license.local.key',
    development: 'license.development.key',
    production: 'license.key'
});

function resolveRuntimeRoots({ env = process.env, execPath = process.execPath || '', cwd = process.cwd(), platform = process.platform } = {}) {
    const isPackaged = (() => {
        if (process.pkg) return true;
        if (platform === 'darwin' && execPath.includes('.app/Contents/MacOS/')) return true;
        const execName = path.basename(execPath).toLowerCase();
        const isNode = execName === 'node' || execName === 'node.exe';
        return !isNode && !execPath.includes('node_modules');
    })();

    const activeRoot = platform === 'darwin' && execPath.includes('.app/Contents/MacOS/')
        ? path.resolve(path.dirname(execPath), '../../..')
        : (isPackaged ? path.dirname(execPath) : cwd);
    const userDataDir = env.BLOG_GENIUS_USER_DATA || '';
    const explicitRoot = String(env.BLOGGENIUS_RUNTIME_ROOT || '').trim();
    const rootDir = explicitRoot
        ? path.resolve(explicitRoot)
        : (userDataDir ? path.resolve(userDataDir) : activeRoot);

    return Object.freeze({
        isPackaged,
        activeRoot,
        rootDir,
        execDir: activeRoot,
        userDataDir
    });
}

function decodeFileUriPath(raw, platform = process.platform) {
    const input = String(raw || '').trim();
    if (!/^file:\/\//i.test(input)) return input;
    try {
        const parsed = new URL(input);
        if (parsed.protocol !== 'file:') return input;
        const host = decodeURIComponent(parsed.hostname || '');
        let localPath = decodeURIComponent(parsed.pathname || '');
        if (host === '.') localPath = `.${localPath}`;
        else if (host && host !== 'localhost') localPath = `//${host}${localPath}`;
        if (platform === 'win32' && /^[\/\\][A-Za-z]:/.test(localPath)) localPath = localPath.slice(1);
        return localPath || input;
    } catch (_error) {
        return input.replace(/^file:\/\//i, '');
    }
}

function createRuntimePathConfiguration({
    env = process.env,
    execPath = process.execPath || '',
    cwd = process.cwd(),
    platform = process.platform,
    resourcesPath = process.resourcesPath,
    fsImpl = fs,
    pathImpl = path,
    environmentProfile = null,
    activeConfigDir: activeConfigDirOverride = ''
} = {}) {
    const roots = resolveRuntimeRoots({ env, execPath, cwd, platform });
    const runtimeProfile = environmentProfile || resolveRuntimeEnvironmentProfile({ env });
    const activeConfigDir = activeConfigDirOverride || pathImpl.join(roots.rootDir, 'config');
    const bundleDir = pathImpl.join(__dirname, '../../..');
    const packagedAssets = resolvePackagedDefaultAssets(resourcesPath, pathImpl);
    const licenseFileName = LICENSE_FILE_NAMES[runtimeProfile.environment] || '';
    const licensePaths = resolveLicenseKeyStoragePaths({
        fileName: licenseFileName,
        userDataDir: roots.userDataDir,
        rootDir: roots.rootDir,
        execDir: roots.execDir,
        pathImpl
    });
    const paths = Object.freeze({
        configJson: pathImpl.join(roots.rootDir, 'config', 'config.json'),
        configJsonFromExec: pathImpl.join(roots.execDir, 'config', 'config.json'),
        configJsonSample: pathImpl.join(roots.rootDir, 'config', 'config.json.sample'),
        configJsonSampleFromExec: pathImpl.join(roots.execDir, 'config', 'config.json.sample'),
        configJsonSampleFromBundle: pathImpl.join(bundleDir, 'config', 'config.json.sample'),
        configJsonSampleFromResources: packagedAssets.configSample,
        configImagesFromResources: packagedAssets.imagesDir,
        licenseKeyFile: licensePaths.primaryPath,
        licenseKeyFileFromExec: licenseFileName ? pathImpl.join(roots.execDir, 'config', licenseFileName) : '',
        legacyLicenseKeyFiles: licensePaths.legacyPaths,
        auth: pathImpl.join(roots.rootDir, 'config', 'naver_auth.json'),
        defaultBlogPrompt: pathImpl.join(bundleDir, 'src', 'content', 'prompts', 'blog', 'common.md'),
        defaultShoppingPrompt: pathImpl.join(bundleDir, 'src', 'applications', 'shopping', 'generation', 'prompts', 'default.md'),
        workspace: pathImpl.join(roots.rootDir, 'workspace')
    });

    const activeAppRoot = pathImpl.basename(activeConfigDir).toLowerCase() === 'config'
        ? pathImpl.dirname(activeConfigDir)
        : activeConfigDir;

    function resolveRuntimePath(rawPath, options = {}) {
        const { mustExist = false } = options || {};
        const input = decodeFileUriPath(String(rawPath || '').trim(), platform);
        if (!input) return '';
        if (/^https?:\/\//i.test(input)) return input;

        const candidates = pathImpl.isAbsolute(input)
            ? [input]
            : [
                pathImpl.resolve(activeAppRoot, input),
                pathImpl.resolve(activeConfigDir, input),
                pathImpl.resolve(roots.execDir, input),
                pathImpl.resolve(roots.rootDir, input),
                pathImpl.resolve(bundleDir, input)
            ];

        if (!mustExist) return candidates[0] || '';
        for (const candidate of candidates) {
            try {
                if (fsImpl.existsSync(candidate)) return candidate;
            } catch (_error) { }
        }
        return candidates[0] || '';
    }

    return Object.freeze({
        ...roots,
        activeConfigDir,
        activeAppRoot,
        bundleDir,
        paths,
        resolveRuntimePath,
        licenseKeyStoragePaths: licensePaths
    });
}

module.exports = {
    LICENSE_FILE_NAMES,
    resolveRuntimeRoots,
    decodeFileUriPath,
    createRuntimePathConfiguration
};
