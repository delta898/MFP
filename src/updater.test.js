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
                });
                return child;
            }
        });
        updater.updateInfo = { latestVersion: '0.4.3-dev6' };

        updater.prepareWindowsDeferredApply(path.join(appRootDir, 'tmp_update', 'extracted'));
        assert.equal(spawnCalls.length, 0);
        const helperScript = fs.readFileSync(updater._pendingExternalRestart.helperScriptPath, 'utf8');
        const helperSpec = JSON.parse(fs.readFileSync(updater._pendingExternalRestart.helperSpecPath, 'utf8'));
        assert.match(helperScript, /Join-Path \$PSScriptRoot 'apply-update\.json'/);
        assert.match(helperScript, /exit 1/);
        assert.doesNotMatch(helperScript, /^param\(/m);
        assert.equal(/^[\x00-\x7F]*$/.test(helperScript), true);
        assert.equal(helperSpec.sourceDir, path.join(appRootDir, 'tmp_update', 'extracted'));
        assert.equal(helperSpec.appDir, appRootDir);
        assert.equal(helperSpec.waitPid, process.pid);
        assert.equal(helperSpec.targetVersion, '0.4.3-dev6');

        await updater.restart();

        assert.equal(spawnCalls.length, 1);
        assert.equal(spawnCalls[0].command, 'powershell-test.exe');
        assert.deepEqual(spawnCalls[0].args, [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            updater._pendingExternalRestart.helperScriptPath
        ]);
        assert.equal(spawnCalls[0].child.unrefCalled, true);
        assert.deepEqual(exitCodes, [0]);
        assert.match(
            fs.readFileSync(updater._pendingExternalRestart.helperBootstrapLogPath, 'utf8'),
            /helper ready: powershell-test\.exe/
        );
    } finally {
        fs.rmSync(appRootDir, { recursive: true, force: true });
    }
});

test('Windows updater rejects helpers that exit cleanly before readiness', async () => {
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
            spawnProcess: () => {
                const child = createFakeChild();
                setImmediate(() => child.emit('exit', 0, null));
                return child;
            }
        });
        updater.prepareWindowsDeferredApply(path.join(appRootDir, 'tmp_update', 'extracted'));

        await assert.rejects(
            updater.restart(),
            /Windows helper가 준비 전에 종료되었습니다. \(code=0, signal=none\)/
        );

        assert.deepEqual(exitCodes, []);
        const bootstrapLog = fs.readFileSync(updater._pendingExternalRestart.helperBootstrapLogPath, 'utf8');
        assert.match(bootstrapLog, /launch failed: powershell-first\.exe/);
        assert.match(bootstrapLog, /launch failed: powershell-second\.exe/);
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
