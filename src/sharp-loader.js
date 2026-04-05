const fs = require('fs');
const path = require('path');

function resolvePackagedModuleDir(moduleName, resourcesPath = process.resourcesPath) {
    if (!resourcesPath || typeof resourcesPath !== 'string') {
        return '';
    }

    const candidate = path.join(resourcesPath, 'app.asar.unpacked', 'node_modules', moduleName);
    return fs.existsSync(path.join(candidate, 'lib', 'index.js')) ? candidate : '';
}

function resolvePackagedSharpEntry(resourcesPath = process.resourcesPath) {
    const moduleDir = resolvePackagedModuleDir('sharp', resourcesPath);
    if (moduleDir === '') {
        return '';
    }
    const entry = path.join(moduleDir, 'lib', 'index.js');
    return fs.existsSync(entry) ? entry : '';
}

function formatAttempt(source, error) {
    const reason = error && error.message ? error.message : 'unknown error';
    return `${source}: ${reason}`;
}

function loadSharp() {
    const attempts = [];
    const packagedSharpEntry = resolvePackagedSharpEntry();

    if (packagedSharpEntry !== '') {
        try {
            return {
                sharp: require(packagedSharpEntry),
                source: packagedSharpEntry,
            };
        } catch (error) {
            attempts.push(formatAttempt(`packaged:${packagedSharpEntry}`, error));
        }
    }

    try {
        return {
            sharp: require('sharp'),
            source: 'default',
        };
    } catch (error) {
        attempts.push(formatAttempt('default:sharp', error));
    }

    const combined = new Error(`sharp module could not be loaded (${attempts.join(' | ')})`);
    combined.code = 'SHARP_LOAD_FAILED';
    throw combined;
}

module.exports = {
    loadSharp,
    resolvePackagedModuleDir,
    resolvePackagedSharpEntry,
};
