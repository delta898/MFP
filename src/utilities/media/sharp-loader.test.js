const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
    listCandidateResourcesPaths,
    resolvePackagedModuleDir,
    resolvePackagedSharpEntries,
    resolvePackagedSharpEntry
} = require('./sharp-loader');

test('resolvePackagedModuleDir returns unpacked module path when package.json exists', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sharp-loader-'));
    try {
        const resourcesPath = path.join(root, 'Resources');
        const moduleDir = path.join(resourcesPath, 'app.asar.unpacked', 'node_modules', 'sharp');
        fs.mkdirSync(path.join(moduleDir, 'lib'), { recursive: true });
        fs.writeFileSync(path.join(moduleDir, 'lib', 'index.js'), 'module.exports = {};');

        assert.equal(resolvePackagedModuleDir('sharp', resourcesPath), moduleDir);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('resolvePackagedSharpEntry returns unpacked lib index path', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sharp-loader-entry-'));
    try {
        const resourcesPath = path.join(root, 'Resources');
        const moduleDir = path.join(resourcesPath, 'app.asar.unpacked', 'node_modules', 'sharp', 'lib');
        fs.mkdirSync(moduleDir, { recursive: true });
        const entry = path.join(moduleDir, 'index.js');
        fs.writeFileSync(entry, 'module.exports = {};');

        assert.equal(resolvePackagedSharpEntry(resourcesPath), entry);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('resolvePackagedSharpEntries searches fallback resources path derived from execPath', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sharp-loader-fallback-'));
    try {
        const resourcesPath = path.join(root, 'BlogGenius.app', 'Contents', 'Resources');
        const execPath = path.join(root, 'BlogGenius.app', 'Contents', 'MacOS', 'BlogGenius');
        const entry = path.join(resourcesPath, 'app.asar.unpacked', 'node_modules', 'sharp', 'lib', 'index.js');
        fs.mkdirSync(path.dirname(entry), { recursive: true });
        fs.writeFileSync(entry, 'module.exports = {};');

        const entries = resolvePackagedSharpEntries('', execPath);
        assert.deepEqual(entries, [entry]);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('listCandidateResourcesPaths deduplicates equivalent resource directories', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sharp-loader-candidates-'));
    try {
        const resourcesPath = path.join(root, 'BlogGenius.app', 'Contents', 'Resources');
        const execPath = path.join(root, 'BlogGenius.app', 'Contents', 'MacOS', 'BlogGenius');
        const candidates = listCandidateResourcesPaths(resourcesPath, execPath);

        assert.equal(candidates[0], path.resolve(resourcesPath));
        assert.equal(candidates.filter((value) => value === path.resolve(resourcesPath)).length, 1);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('resolvePackagedModuleDir returns empty string when unpacked module is missing', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sharp-loader-missing-'));
    try {
        const resourcesPath = path.join(root, 'Resources');
        fs.mkdirSync(resourcesPath, { recursive: true });
        assert.equal(resolvePackagedModuleDir('sharp', resourcesPath), '');
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
