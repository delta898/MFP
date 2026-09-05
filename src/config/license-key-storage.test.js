'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
    resolveLicenseKeyStoragePaths,
    loadLicenseKey
} = require('./license-key-storage');

test('Electron userData is the primary license path and package paths are legacy sources', () => {
    const paths = resolveLicenseKeyStoragePaths({
        fileName: 'license.key',
        userDataDir: '/users/me/BlogGenius',
        rootDir: '/apps/BlogGenius',
        execDir: '/apps/BlogGenius',
        pathImpl: path.posix
    });

    assert.deepEqual(paths, {
        primaryPath: '/users/me/BlogGenius/config/license.key',
        legacyPaths: ['/apps/BlogGenius/config/license.key']
    });
});

test('persistent license takes precedence over a legacy package license', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bloggenius-license-primary-'));
    const primaryPath = path.join(tempDir, 'user-data', 'config', 'license.key');
    const legacyPath = path.join(tempDir, 'app', 'config', 'license.key');

    try {
        fs.mkdirSync(path.dirname(primaryPath), { recursive: true });
        fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
        fs.writeFileSync(primaryPath, 'persistent-key\n', 'utf8');
        fs.writeFileSync(legacyPath, 'legacy-key\n', 'utf8');

        const result = loadLicenseKey({
            primaryPath,
            legacyPaths: [legacyPath],
            fsImpl: fs,
            pathImpl: path
        });

        assert.equal(result.value, 'persistent-key');
        assert.equal(result.sourcePath, primaryPath);
        assert.equal(result.migrated, false);
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('legacy license is copied into persistent storage on first load', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bloggenius-license-migrate-'));
    const primaryPath = path.join(tempDir, 'user-data', 'config', 'license.key');
    const legacyPath = path.join(tempDir, 'app', 'config', 'license.key');

    try {
        fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
        fs.writeFileSync(legacyPath, 'legacy-key\n', 'utf8');

        const result = loadLicenseKey({
            primaryPath,
            legacyPaths: [legacyPath],
            fsImpl: fs,
            pathImpl: path
        });

        assert.equal(result.value, 'legacy-key');
        assert.equal(result.path, primaryPath);
        assert.equal(result.sourcePath, legacyPath);
        assert.equal(result.migrated, true);
        assert.equal(fs.readFileSync(primaryPath, 'utf8'), 'legacy-key\n');
        assert.equal(fs.readFileSync(legacyPath, 'utf8'), 'legacy-key\n');
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('legacy license remains usable when migration cannot write persistent storage', () => {
    const fsStub = {
        existsSync(filePath) { return filePath === '/legacy/license.key'; },
        readFileSync() { return 'legacy-key\n'; },
        mkdirSync() { throw new Error('read only'); },
        writeFileSync() {},
        chmodSync() {}
    };

    const result = loadLicenseKey({
        primaryPath: '/persistent/license.key',
        legacyPaths: ['/legacy/license.key'],
        fsImpl: fsStub,
        pathImpl: path.posix
    });

    assert.equal(result.value, 'legacy-key');
    assert.equal(result.path, '/persistent/license.key');
    assert.equal(result.sourcePath, '/legacy/license.key');
    assert.equal(result.migrated, false);
    assert.match(result.migrationError, /read only/);
});
