const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { resolvePackagedModuleDir } = require('./sharp-loader');

test('resolvePackagedModuleDir returns unpacked module path when package.json exists', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sharp-loader-'));
    try {
        const resourcesPath = path.join(root, 'Resources');
        const moduleDir = path.join(resourcesPath, 'app.asar.unpacked', 'node_modules', 'sharp');
        fs.mkdirSync(moduleDir, { recursive: true });
        fs.writeFileSync(path.join(moduleDir, 'package.json'), '{}');

        assert.equal(resolvePackagedModuleDir('sharp', resourcesPath), moduleDir);
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
