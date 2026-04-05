const fs = require('fs');
const path = require('path');

function resolvePackagedModuleDir(moduleName, resourcesPath = process.resourcesPath) {
    if (!resourcesPath || typeof resourcesPath !== 'string') {
        return '';
    }

    const candidate = path.join(resourcesPath, 'app.asar.unpacked', 'node_modules', moduleName);
    return fs.existsSync(path.join(candidate, 'package.json')) ? candidate : '';
}

function formatAttempt(source, error) {
    const reason = error && error.message ? error.message : 'unknown error';
    return `${source}: ${reason}`;
}

function loadSharp() {
    const attempts = [];
    const packagedSharpDir = resolvePackagedModuleDir('sharp');

    if (packagedSharpDir !== '') {
        try {
            return {
                sharp: require(packagedSharpDir),
                source: packagedSharpDir,
            };
        } catch (error) {
            attempts.push(formatAttempt(`packaged:${packagedSharpDir}`, error));
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
};
