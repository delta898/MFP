'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { clearLocalLicenseFile } = require('./reset-local-license-file');

test('local reset removes only the disposable local license file', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bloggenius-local-license-'));
    const configDir = path.join(repoRoot, 'config');
    const localPath = path.join(configDir, 'license.local.key');
    const developmentPath = path.join(configDir, 'license.development.key');
    const productionPath = path.join(configDir, 'license.key');

    try {
        fs.mkdirSync(configDir, { recursive: true });
        fs.writeFileSync(localPath, 'local-key\n', 'utf8');
        fs.writeFileSync(developmentPath, 'development-key\n', 'utf8');
        fs.writeFileSync(productionPath, 'production-key\n', 'utf8');

        const result = clearLocalLicenseFile({ repoRoot });

        assert.equal(result.removed, true);
        assert.equal(fs.existsSync(localPath), false);
        assert.equal(fs.existsSync(developmentPath), true);
        assert.equal(fs.existsSync(productionPath), true);
    } finally {
        fs.rmSync(repoRoot, { recursive: true, force: true });
    }
});

test('local reset is idempotent when no local license file exists', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bloggenius-local-license-'));
    try {
        assert.deepEqual(clearLocalLicenseFile({ repoRoot }), {
            removed: false,
            path: path.join(repoRoot, 'config', 'license.local.key')
        });
    } finally {
        fs.rmSync(repoRoot, { recursive: true, force: true });
    }
});
