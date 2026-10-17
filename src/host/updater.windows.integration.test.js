const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

function waitForExit(child, timeoutMs) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            child.kill();
            reject(new Error('Updater integration parent did not exit in time.'));
        }, timeoutMs);
        child.once('error', (error) => {
            clearTimeout(timeout);
            reject(error);
        });
        child.once('exit', (code, signal) => {
            clearTimeout(timeout);
            resolve({ code, signal });
        });
    });
}

async function waitForFile(filePath, timeoutMs) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        if (fs.existsSync(filePath)) return;
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for ${filePath}`);
}

test('actual Windows bootstrap survives its parent and applies the prepared files', {
    skip: process.platform !== 'win32'
}, async () => {
    const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bloggenius-windows-bootstrap-'));
    const appRootDir = path.join(testRoot, 'app');
    const sourceDir = path.join(appRootDir, 'tmp_update', 'extracted');
    const userDataDir = path.join(testRoot, 'user-data');
    const appliedPath = path.join(appRootDir, 'bootstrap-applied.txt');
    const completedPath = path.join(appRootDir, 'tmp_update', 'apply-update.completed');
    const receiptPath = path.join(userDataDir, 'update-state', 'completion.json');
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'bootstrap-applied.txt'), 'applied', 'utf8');

    try {
        const fixture = path.join(__dirname, 'test-fixtures', 'windows-updater-bootstrap-parent.js');
        const child = spawn(process.execPath, [fixture, appRootDir, sourceDir, userDataDir], {
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true
        });
        let stderr = '';
        child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
        const result = await waitForExit(child, 15000);
        assert.equal(result.code, 0, stderr);
        await waitForFile(completedPath, 15000);
        assert.equal(fs.readFileSync(appliedPath, 'utf8'), 'applied');
        assert.equal(fs.readFileSync(completedPath, 'utf8').trim(), '0.0.0-windows-bootstrap-test');
        const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8').replace(/^\uFEFF/, ''));
        assert.equal(receipt.operationId, 'windows-bootstrap-integration');
        assert.equal(receipt.targetVersion, '0.0.0-windows-bootstrap-test');
        assert.equal(fs.existsSync(path.join(appRootDir, 'tmp_update', 'apply-update.failed')), false);
    } finally {
        fs.rmSync(testRoot, { recursive: true, force: true });
    }
});
