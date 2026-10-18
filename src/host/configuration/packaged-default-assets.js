'use strict';

const fs = require('node:fs');
const path = require('node:path');

function resolvePackagedDefaultAssets(resourcesPath = process.resourcesPath, pathImpl = path) {
    const root = typeof resourcesPath === 'string' && resourcesPath.trim()
        ? resourcesPath
        : '';
    return Object.freeze({
        configSample: root ? pathImpl.join(root, 'config.json.sample') : '',
        imagesDir: root ? pathImpl.join(root, 'images') : ''
    });
}

function copyMissingDefaultImages(options = {}) {
    const fsImpl = options.fsImpl || fs;
    const pathImpl = options.pathImpl || path;
    const sourceDir = String(options.sourceDir || '');
    const targetDir = String(options.targetDir || '');
    if (!sourceDir || !targetDir || !fsImpl.existsSync(sourceDir)) return [];

    const copied = [];
    fsImpl.mkdirSync(targetDir, { recursive: true });
    for (const entry of fsImpl.readdirSync(sourceDir, { withFileTypes: true })) {
        if (!entry.isFile() || entry.name.startsWith('.')) continue;
        const sourcePath = pathImpl.join(sourceDir, entry.name);
        const targetPath = pathImpl.join(targetDir, entry.name);
        if (fsImpl.existsSync(targetPath)) continue;
        fsImpl.copyFileSync(sourcePath, targetPath);
        copied.push(targetPath);
    }
    return copied;
}

module.exports = {
    copyMissingDefaultImages,
    resolvePackagedDefaultAssets
};
