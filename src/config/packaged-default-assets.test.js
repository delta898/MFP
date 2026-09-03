'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
    copyMissingDefaultImages,
    resolvePackagedDefaultAssets
} = require('./packaged-default-assets');

test('packaged defaults resolve inside Electron resources independently of the app location', () => {
    const resources = path.join('/private/var/folders', 'AppTranslocation', 'BlogGenius.app', 'Contents', 'Resources');
    const resolved = resolvePackagedDefaultAssets(resources, path.posix);

    assert.equal(resolved.configSample, `${resources}/config.json.sample`);
    assert.equal(resolved.imagesDir, `${resources}/images`);
});
test('default images initialize missing userData assets without overwriting user files', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bloggenius-default-assets-'));
    const sourceDir = path.join(root, 'resources', 'images');
    const targetDir = path.join(root, 'userData', 'config', 'images');
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'default.jpeg'), 'bundled');
    fs.writeFileSync(path.join(sourceDir, 'custom.jpeg'), 'bundled-custom');
    fs.writeFileSync(path.join(targetDir, 'custom.jpeg'), 'user-custom');

    const copied = copyMissingDefaultImages({ sourceDir, targetDir });

    assert.deepEqual(copied, [path.join(targetDir, 'default.jpeg')]);
    assert.equal(fs.readFileSync(path.join(targetDir, 'default.jpeg'), 'utf8'), 'bundled');
    assert.equal(fs.readFileSync(path.join(targetDir, 'custom.jpeg'), 'utf8'), 'user-custom');
});
