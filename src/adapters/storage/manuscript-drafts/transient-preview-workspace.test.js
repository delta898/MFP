const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createTransientPreviewWorkspaceManager, MARKER_FILE } = require('./transient-preview-workspace');

test('tracks, expires, and removes only marked preview workspaces', () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'transient-preview-'));
    try {
        const generated = path.join(workspaceDir, 'wp_example.com', 'generated');
        const permanent = path.join(workspaceDir, 'wp_example.com', 'permanent');
        fs.mkdirSync(generated, { recursive: true });
        fs.mkdirSync(permanent, { recursive: true });
        const manager = createTransientPreviewWorkspaceManager({ fs, path, workspaceDir, retentionMs: 60 * 1000 });
        manager.track({ wordpress: generated }, 'preview-1');
        assert.equal(fs.existsSync(path.join(generated, MARKER_FILE)), true);
        const marker = JSON.parse(fs.readFileSync(path.join(generated, MARKER_FILE), 'utf8'));
        const summary = manager.cleanupExpired(Date.parse(marker.expiresAt) + 1);
        assert.equal(summary.removed, 1);
        assert.equal(fs.existsSync(generated), false);
        assert.equal(fs.existsSync(permanent), true);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
});

test('refuses to dispose directories outside the configured workspace', () => {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'transient-preview-root-'));
    const externalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'transient-preview-external-'));
    try {
        const manager = createTransientPreviewWorkspaceManager({ fs, path, workspaceDir });
        manager.dispose({ wordpress: externalDir });
        assert.equal(fs.existsSync(externalDir), true);
    } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
        fs.rmSync(externalDir, { recursive: true, force: true });
    }
});
