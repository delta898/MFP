const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const CONFIG = require('./config-loader');
const { Updater } = require('./updater');
const { createSystemController } = require('./ui-api/controllers/system.controller');

function snapshotUpdateConfig() {
    return {
        UPDATE_SERVER_TYPE: CONFIG.UPDATE_SERVER_TYPE,
        CUSTOM_UPDATE_CHECK_URL: CONFIG.CUSTOM_UPDATE_CHECK_URL,
        UPDATE_MIRROR_REPO: CONFIG.UPDATE_MIRROR_REPO,
        UPDATE_CHANNEL: CONFIG.UPDATE_CHANNEL,
        USER_ROLE: CONFIG.USER_ROLE
    };
}

function restoreUpdateConfig(snapshot) {
    Object.assign(CONFIG, snapshot);
}

test('updater reads the current custom update URL instead of startup values', () => {
    const original = snapshotUpdateConfig();
    try {
        const updater = new Updater();
        CONFIG.UPDATE_SERVER_TYPE = 'custom';
        CONFIG.CUSTOM_UPDATE_CHECK_URL = 'https://example.com/releases';
        assert.equal(updater.getCustomManifestUrl(), 'https://example.com/releases/update.json');

        CONFIG.CUSTOM_UPDATE_CHECK_URL = 'https://cdn.example.com/update.json';
        assert.equal(updater.getCustomManifestUrl(), 'https://cdn.example.com/update.json');
    } finally {
        restoreUpdateConfig(original);
    }
});

test('updater invalidates a recent result when update source settings change', async () => {
    const original = snapshotUpdateConfig();
    try {
        CONFIG.UPDATE_SERVER_TYPE = 'custom';
        CONFIG.CUSTOM_UPDATE_CHECK_URL = 'https://example.com/first';
        CONFIG.UPDATE_CHANNEL = 'dev';
        CONFIG.USER_ROLE = 'Developer';

        const updater = new Updater();
        updater.currentVersion = '0.1.11';
        let fetchCount = 0;
        updater.fetchReleases = async () => {
            fetchCount += 1;
            return [{
                tag_name: fetchCount === 1 ? 'v0.1.12-dev1' : 'v0.1.12-dev2',
                prerelease: true,
                assets: [{
                    name: 'BlogGenius-mac-arm64.zip',
                    browser_download_url: 'BlogGenius-mac-arm64.zip'
                }]
            }];
        };

        const first = await updater.checkForUpdate();
        assert.equal(first.latestVersion, '0.1.12-dev1');
        assert.equal(fetchCount, 1);

        CONFIG.CUSTOM_UPDATE_CHECK_URL = 'https://example.com/second';
        const second = await updater.checkForUpdate();
        assert.equal(second.latestVersion, '0.1.12-dev2');
        assert.equal(fetchCount, 2);
    } finally {
        restoreUpdateConfig(original);
    }
});

test('forced update selects the newest release in the current channel instead of reinstalling the current version', async () => {
    const original = snapshotUpdateConfig();
    try {
        CONFIG.UPDATE_CHANNEL = 'stable';
        CONFIG.USER_ROLE = 'User';
        const updater = new Updater({ platform: 'darwin', arch: 'arm64' });
        updater.currentVersion = '0.4.3';
        updater.getLatestRelease = async () => ({
            tag_name: 'v0.4.4',
            prerelease: false,
            assets: [{ name: 'BlogGenius-mac-arm64.zip', browser_download_url: 'https://example.com/latest.zip' }]
        });
        const result = await updater.checkForUpdate({ force: true });
        assert.equal(result.latestVersion, '0.4.4');
        assert.equal(result.hasUpdate, true);
    } finally {
        restoreUpdateConfig(original);
    }
});

test('updater supports only macOS Apple Silicon and Windows x64 release assets', () => {
    const assets = [
        { name: 'BlogGenius-mac-arm64.zip' },
        { name: 'BlogGenius-win-x64.zip' },
        { name: 'BlogGenius-mac-intel.zip' },
        { name: 'BlogGenius-linux-x64.zip' }
    ];

    assert.equal(
        new Updater({ platform: 'darwin', arch: 'arm64' }).getPlatformAsset(assets)?.name,
        'BlogGenius-mac-arm64.zip'
    );
    assert.equal(
        new Updater({ platform: 'win32', arch: 'x64' }).getPlatformAsset(assets)?.name,
        'BlogGenius-win-x64.zip'
    );
    assert.equal(new Updater({ platform: 'darwin', arch: 'x64' }).getPlatformAsset(assets), null);
    assert.equal(new Updater({ platform: 'linux', arch: 'x64' }).getPlatformAsset(assets), null);
});

function createFakeChild(pid = 4321) {
    const child = new EventEmitter();
    child.pid = pid;
    child.killed = false;
    child.unrefCalled = false;
    child.unref = () => {
        child.unrefCalled = true;
    };
    child.kill = () => {
        child.killed = true;
    };
    return child;
}

test('Windows updater defers helper launch until restart and exits only after readiness handshake', async () => {
    const appRootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bloggenius-updater-ready-'));
    fs.mkdirSync(path.join(appRootDir, 'tmp_update'), { recursive: true });
    const spawnCalls = [];
    const exitCodes = [];
    let updater;

    try {
        updater = new Updater({
            appRootDir,
            platform: 'win32',
            windowsPowerShellCandidates: ['powershell-test.exe'],
            windowsHelperReadyTimeoutMs: 500,
            exitProcess: (code) => exitCodes.push(code),
            spawnProcess: (command, args, options) => {
                const child = createFakeChild();
                spawnCalls.push({ command, args, options, child });
                setImmediate(() => {
                    fs.writeFileSync(updater._pendingExternalRestart.helperReadyPath, String(child.pid), 'ascii');
                    child.emit('exit', 0, null);
                });
                return child;
            }
        });
        updater.updateInfo = { latestVersion: '0.4.3-dev6' };

        updater.prepareWindowsDeferredApply(path.join(appRootDir, 'tmp_update', 'extracted'));
        assert.equal(spawnCalls.length, 0);
        const helperScript = fs.readFileSync(updater._pendingExternalRestart.helperScriptPath, 'utf8');
        const bootstrapScript = fs.readFileSync(updater._pendingExternalRestart.helperBootstrapScriptPath, 'utf8');
        const helperSpec = JSON.parse(fs.readFileSync(updater._pendingExternalRestart.helperSpecPath, 'utf8'));
        assert.match(helperScript, /Join-Path \$PSScriptRoot 'apply-update\.json'/);
        assert.match(helperScript, /exit 1/);
        assert.doesNotMatch(helperScript, /^param\(/m);
        assert.equal(/^[\x00-\x7F]*$/.test(helperScript), true);
        assert.equal(/^[\x00-\x7F]*$/.test(bootstrapScript), true);
        assert.match(bootstrapScript, /Start-Process -FilePath \$enginePath/);
        assert.match(bootstrapScript, /-EncodedCommand/);
        assert.match(bootstrapScript, /apply helper ready/);
        assert.match(bootstrapScript, /for \(\$i = 0; \$i -lt 600; \$i\+\+\)/);
        assert.match(helperScript, /\[System\.IO\.FileShare\]::None/);
        assert.match(helperScript, /Restore-BackupArtifacts/);
        assert.match(helperScript, /failureReceiptPath/);
        const encodedCommand = bootstrapScript.match(/'-EncodedCommand', '([^']+)'/)?.[1];
        assert.equal(
            Buffer.from(encodedCommand, 'base64').toString('utf16le'),
            `& '${updater._pendingExternalRestart.helperScriptPath.replace(/'/g, "''")}'`
        );
        assert.equal(helperSpec.sourceDir, path.join(appRootDir, 'tmp_update', 'extracted'));
        assert.equal(helperSpec.appDir, appRootDir);
        assert.equal(helperSpec.waitPid, process.pid);
        assert.equal(helperSpec.targetVersion, '0.4.3-dev6');
        assert.equal(helperSpec.receiptPath, updater.updateCompletionReceiptPath);
        assert.match(helperScript, /ConvertTo-Json -Compress/);

        await updater.restart();

        assert.equal(spawnCalls.length, 1);
        assert.equal(spawnCalls[0].command, 'powershell-test.exe');
        assert.deepEqual(spawnCalls[0].args, [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            updater._pendingExternalRestart.helperBootstrapScriptPath
        ]);
        assert.equal(spawnCalls[0].options.detached, false);
        assert.equal(spawnCalls[0].child.unrefCalled, false);
        assert.deepEqual(exitCodes, [0]);
        assert.match(
            fs.readFileSync(updater._pendingExternalRestart.helperBootstrapLogPath, 'utf8'),
            /helper ready: powershell-test\.exe/
        );
    } finally {
        fs.rmSync(appRootDir, { recursive: true, force: true });
    }
});

test('update completion receipt is shown only by its target version and consumed by matching acknowledgement', () => {
    const appRootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bloggenius-update-receipt-'));
    const receiptPath = path.join(appRootDir, 'persistent', 'update-state', 'completion.json');

    try {
        const updater = new Updater({ appRootDir, updateCompletionReceiptPath: receiptPath });
        updater.currentVersion = '0.4.3-dev7';
        updater.writeUpdateCompletionReceipt({
            operationId: 'operation-7',
            targetVersion: '0.4.3-dev7'
        });

        assert.deepEqual(updater.getPendingUpdateCompletion(), {
            pending: true,
            operationId: 'operation-7',
            targetVersion: '0.4.3-dev7',
            completedAt: updater.readUpdateCompletionReceipt().completedAt
        });
        assert.deepEqual(updater.acknowledgeUpdateCompletion('another-operation'), { acknowledged: false });
        assert.equal(fs.existsSync(receiptPath), true);
        assert.deepEqual(updater.acknowledgeUpdateCompletion('operation-7'), { acknowledged: true });
        assert.deepEqual(updater.getPendingUpdateCompletion(), { pending: false });
        assert.equal(fs.existsSync(receiptPath), false);
    } finally {
        fs.rmSync(appRootDir, { recursive: true, force: true });
    }
});

test('update completion receipt remains pending for a future target version', () => {
    const appRootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bloggenius-update-receipt-target-'));
    const receiptPath = path.join(appRootDir, 'completion.json');

    try {
        fs.writeFileSync(receiptPath, '\uFEFF' + JSON.stringify({
            operationId: 'operation-next',
            targetVersion: '0.4.3-dev8',
            completedAt: '2026-09-06T00:00:00.000Z'
        }), 'utf8');
        const updater = new Updater({ appRootDir, updateCompletionReceiptPath: receiptPath });
        updater.currentVersion = '0.4.3-dev7';

        assert.deepEqual(updater.getPendingUpdateCompletion(), { pending: false });
        assert.deepEqual(updater.acknowledgeUpdateCompletion('operation-next'), { acknowledged: false });
        assert.equal(fs.existsSync(receiptPath), true);
    } finally {
        fs.rmSync(appRootDir, { recursive: true, force: true });
    }
});

test('update failure receipt remains visible until the matching acknowledgement', () => {
    const appRootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bloggenius-update-failure-receipt-'));
    const failurePath = path.join(appRootDir, 'persistent', 'update-state', 'failure.json');
    fs.mkdirSync(path.dirname(failurePath), { recursive: true });
    fs.writeFileSync(failurePath, JSON.stringify({
        operationId: 'operation-failed',
        targetVersion: '0.4.3-dev9',
        failedAt: '2026-09-06T00:00:00.000Z',
        message: 'BlogGenius.exe is locked'
    }), 'utf8');

    try {
        const updater = new Updater({ appRootDir, updateFailureReceiptPath: failurePath });
        assert.deepEqual(updater.getPendingUpdateFailure(), {
            pending: true,
            operationId: 'operation-failed',
            targetVersion: '0.4.3-dev9',
            failedAt: '2026-09-06T00:00:00.000Z',
            message: 'BlogGenius.exe is locked'
        });
        assert.deepEqual(updater.acknowledgeUpdateFailure('another-operation'), { acknowledged: false });
        assert.equal(fs.existsSync(failurePath), true);
        assert.deepEqual(updater.acknowledgeUpdateFailure('operation-failed'), { acknowledged: true });
        assert.equal(fs.existsSync(failurePath), false);
    } finally {
        fs.rmSync(appRootDir, { recursive: true, force: true });
    }
});

test('Windows updater rejects a helper that exits cleanly before readiness without launching a fallback', async () => {
    const appRootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bloggenius-updater-early-exit-'));
    fs.mkdirSync(path.join(appRootDir, 'tmp_update'), { recursive: true });
    const exitCodes = [];

    try {
        const updater = new Updater({
            appRootDir,
            platform: 'win32',
            windowsPowerShellCandidates: ['powershell-first.exe', 'powershell-second.exe'],
            windowsHelperReadyTimeoutMs: 100,
            exitProcess: (code) => exitCodes.push(code),
            spawnProcess: (command) => {
                assert.equal(command, 'powershell-first.exe');
                const child = createFakeChild();
                setImmediate(() => child.emit('exit', 0, null));
                return child;
            }
        });
        updater.prepareWindowsDeferredApply(path.join(appRootDir, 'tmp_update', 'extracted'));

        await assert.rejects(
            updater.restart(),
            /Windows helper가 준비되기 전에 bootstrap이 종료되었습니다. \(code=0, signal=none\)/
        );

        assert.deepEqual(exitCodes, []);
        const bootstrapLog = fs.readFileSync(updater._pendingExternalRestart.helperBootstrapLogPath, 'utf8');
        assert.match(bootstrapLog, /launch failed: powershell-first\.exe/);
        assert.doesNotMatch(bootstrapLog, /powershell-second\.exe/);
    } finally {
        fs.rmSync(appRootDir, { recursive: true, force: true });
    }
});

test('Windows updater times out once, writes an abort marker, and never starts a second helper', async () => {
    const appRootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bloggenius-updater-timeout-'));
    fs.mkdirSync(path.join(appRootDir, 'tmp_update'), { recursive: true });
    const spawnCalls = [];

    try {
        const updater = new Updater({
            appRootDir,
            platform: 'win32',
            windowsPowerShellCandidates: ['powershell-first.exe', 'powershell-second.exe'],
            windowsHelperReadyTimeoutMs: 20,
            spawnProcess: (command) => {
                spawnCalls.push(command);
                return createFakeChild();
            }
        });
        updater.prepareWindowsDeferredApply(path.join(appRootDir, 'tmp_update', 'extracted'));

        await assert.rejects(updater.restart(), /준비 확인 시간이 초과/);

        assert.deepEqual(spawnCalls, ['powershell-first.exe']);
        assert.equal(fs.existsSync(updater._pendingExternalRestart.helperAbortPath), true);
    } finally {
        fs.rmSync(appRootDir, { recursive: true, force: true });
    }
});

test('Windows updater keeps the app alive and records diagnostics when helper launch fails', async () => {
    const appRootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bloggenius-updater-fail-'));
    fs.mkdirSync(path.join(appRootDir, 'tmp_update'), { recursive: true });
    const exitCodes = [];

    try {
        const updater = new Updater({
            appRootDir,
            platform: 'win32',
            windowsPowerShellCandidates: ['missing-powershell.exe'],
            windowsHelperReadyTimeoutMs: 100,
            exitProcess: (code) => exitCodes.push(code),
            spawnProcess: () => {
                const child = createFakeChild();
                setImmediate(() => child.emit('error', new Error('ENOENT')));
                return child;
            }
        });
        updater.prepareWindowsDeferredApply(path.join(appRootDir, 'tmp_update', 'extracted'));

        await assert.rejects(
            updater.restart(),
            /Windows 업데이트 helper를 시작하지 못했습니다: ENOENT/
        );

        assert.deepEqual(exitCodes, []);
        assert.equal(updater.progress.stage, 'error');
        assert.match(
            fs.readFileSync(updater._pendingExternalRestart.helperBootstrapLogPath, 'utf8'),
            /launch failed: missing-powershell\.exe - ENOENT/
        );
    } finally {
        fs.rmSync(appRootDir, { recursive: true, force: true });
    }
});

test('system restart controller observes asynchronous updater failures', () => {
    const controller = fs.readFileSync(path.join(__dirname, 'ui-api', 'controllers', 'system.controller.js'), 'utf8');
    assert.match(controller, /updater\.isWindowsDeferredApplyPending\?\.\(\)/);
    assert.match(controller, /await updater\.restart\(\{ exitDelayMs: 1000 \}\)/);
    assert.match(controller, /UPDATE_RESTART_ERROR/);
    assert.match(controller, /Promise\.resolve\(updater\.restart\(\)\)\.catch/);
});

test('update UI reports restart failures without simulating a restart by reloading', () => {
    const updateUi = fs.readFileSync(
        path.join(__dirname, '..', 'ui', 'scripts', 'features', 'shell', 'update.js'),
        'utf8'
    );
    assert.match(updateUi, /await postJson\('\/api\/v1\/system\/update\/restart'\)/);
    assert.match(updateUi, /업데이트 재시작 실패/);
    assert.doesNotMatch(updateUi, /location\.reload/);
});

test('update startup UI reports a deferred apply failure after relaunch', () => {
    const celebrationUi = fs.readFileSync(
        path.join(__dirname, '..', 'ui', 'scripts', 'features', 'shell', 'celebration.js'),
        'utf8'
    );
    assert.match(celebrationUi, /\/api\/v1\/system\/update\/failure/);
    assert.match(celebrationUi, /업데이트를 적용하지 못해 기존 버전으로 다시 실행했습니다/);
    assert.match(celebrationUi, /\/api\/v1\/system\/update\/failure\/ack/);
});

test('update restart endpoint confirms a pending Windows helper before reporting success', async () => {
    const calls = [];
    const controller = createSystemController({
        service: {},
        updater: {
            isWindowsDeferredApplyPending: () => true,
            restart: async (options) => calls.push(options)
        },
        logger: { error() {} },
        sendSuccess: (_res, requestId, payload) => ({ requestId, payload }),
        sendError: (_res, requestId, status, code, message) => ({ requestId, status, code, message })
    });

    const result = await controller.updateRestart({ requestId: 'restart-success', method: 'POST', res: {} });

    assert.deepEqual(calls, [{ exitDelayMs: 1000 }]);
    assert.deepEqual(result, { requestId: 'restart-success', payload: { success: true } });
});

test('update restart endpoint reports helper launch failure while the app remains alive', async () => {
    const controller = createSystemController({
        service: {},
        updater: {
            isWindowsDeferredApplyPending: () => true,
            restart: async () => {
                throw new Error('PowerShell launch failed');
            }
        },
        logger: { error() {} },
        sendSuccess: (_res, requestId, payload) => ({ requestId, payload }),
        sendError: (_res, requestId, status, code, message) => ({ requestId, status, code, message })
    });

    const result = await controller.updateRestart({ requestId: 'restart-failure', method: 'POST', res: {} });

    assert.deepEqual(result, {
        requestId: 'restart-failure',
        status: 500,
        code: 'UPDATE_RESTART_ERROR',
        message: 'PowerShell launch failed'
    });
});

test('update completion endpoints expose and consume only the matching operation', async () => {
    const calls = [];
    const controller = createSystemController({
        service: {},
        updater: {
            getPendingUpdateCompletion: () => ({
                pending: true,
                operationId: 'operation-api',
                targetVersion: '0.4.3-dev7'
            }),
            acknowledgeUpdateCompletion: (operationId) => {
                calls.push(operationId);
                return { acknowledged: operationId === 'operation-api' };
            }
        },
        logger: { error() {} },
        sendSuccess: (_res, requestId, payload) => ({ requestId, payload }),
        sendError: (_res, requestId, status, code, message) => ({ requestId, status, code, message })
    });

    const pending = await controller.updateCompletion({ requestId: 'completion-get', method: 'GET', res: {} });
    const acknowledged = await controller.updateCompletionAcknowledge({
        requestId: 'completion-ack',
        method: 'POST',
        requestBody: { operationId: 'operation-api' },
        res: {}
    });

    assert.equal(pending.payload.pending, true);
    assert.equal(pending.payload.targetVersion, '0.4.3-dev7');
    assert.deepEqual(calls, ['operation-api']);
    assert.deepEqual(acknowledged.payload, { acknowledged: true });
});

test('update failure endpoints expose and consume the persisted failure', async () => {
    const calls = [];
    const controller = createSystemController({
        service: {},
        updater: {
            getPendingUpdateFailure: () => ({
                pending: true,
                operationId: 'operation-failed-api',
                targetVersion: '0.4.3-dev9',
                message: 'apply failed'
            }),
            acknowledgeUpdateFailure: (operationId) => {
                calls.push(operationId);
                return { acknowledged: operationId === 'operation-failed-api' };
            }
        },
        logger: { error() {} },
        sendSuccess: (_res, requestId, payload) => ({ requestId, payload }),
        sendError: (_res, requestId, status, code, message) => ({ requestId, status, code, message })
    });

    const pending = await controller.updateFailure({ requestId: 'failure-get', method: 'GET', res: {} });
    const acknowledged = await controller.updateFailureAcknowledge({
        requestId: 'failure-ack',
        method: 'POST',
        requestBody: { operationId: 'operation-failed-api' },
        res: {}
    });

    assert.equal(pending.payload.pending, true);
    assert.equal(pending.payload.message, 'apply failed');
    assert.deepEqual(calls, ['operation-failed-api']);
    assert.deepEqual(acknowledged.payload, { acknowledged: true });
});
