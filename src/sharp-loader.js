const fs = require('fs');
const path = require('path');
const Module = require('module');

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

function listCandidateResourcesPaths(resourcesPath = process.resourcesPath, execPath = process.execPath) {
    const candidates = [];
    const seen = new Set();

    const addCandidate = (value) => {
        if (!value || typeof value !== 'string') {
            return;
        }
        const normalized = path.resolve(value);
        if (seen.has(normalized)) {
            return;
        }
        seen.add(normalized);
        candidates.push(normalized);
    };

    addCandidate(resourcesPath);

    if (execPath && typeof execPath === 'string') {
        addCandidate(path.resolve(path.dirname(execPath), '..', 'Resources'));
        addCandidate(path.resolve(path.dirname(execPath), '..', '..', 'Resources'));
    }

    if (__dirname) {
        addCandidate(path.resolve(__dirname, '..'));
    }

    return candidates;
}

function resolvePackagedSharpEntries(resourcesPath = process.resourcesPath, execPath = process.execPath) {
    return listCandidateResourcesPaths(resourcesPath, execPath)
        .map((candidateResourcesPath) => resolvePackagedSharpEntry(candidateResourcesPath))
        .filter(Boolean);
}

function formatAttempt(source, error) {
    const reason = error && error.message ? error.message : 'unknown error';
    return `${source}: ${reason}`;
}

function loadSharp() {
    const attempts = [];
    const packagedSharpEntries = resolvePackagedSharpEntries();

    if (packagedSharpEntries.length === 0) {
        attempts.push(
            `packaged:none: checked=${listCandidateResourcesPaths().join(', ')}`
        );
    }

    for (const packagedSharpEntry of packagedSharpEntries) {
        try {
            const packagedRequire = Module.createRequire(packagedSharpEntry);
            return {
                sharp: packagedRequire('sharp'),
                source: `packaged:${packagedSharpEntry}`,
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
    listCandidateResourcesPaths,
    resolvePackagedModuleDir,
    resolvePackagedSharpEntry,
    resolvePackagedSharpEntries,
};
