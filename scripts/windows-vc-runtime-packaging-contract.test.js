'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

test('Windows release packaging bundles and verifies the app-local VC runtime', () => {
    const workflow = read('.github/workflows/build.yml');
    const script = read('scripts/windows/copy-vc-runtime.ps1');

    assert.match(workflow, /Bundle and Verify Windows VC\+\+ Runtime/);
    assert.match(workflow, /copy-vc-runtime[.]ps1 -PackageDir/);
    assert.doesNotMatch(workflow, /rebuild-kuzu-for-electron/);
    assert.doesNotMatch(workflow, /--verify-native-modules/);

    for (const file of ['msvcp140.dll', 'vcruntime140.dll', 'vcruntime140_1.dll']) {
        assert.match(script, new RegExp(file.replace(/[.]/g, '[.]'), 'i'));
        assert.match(workflow, new RegExp(file.replace(/[.]/g, '[.]'), 'i'));
    }
    assert.match(script, /Microsoft[.]VC[*][.]CRT/);
    assert.match(script, /Copy-Item/);
});

test('release uploads use the Node 24 compatible GitHub Release action', () => {
    const workflow = read('.github/workflows/build.yml');

    assert.doesNotMatch(workflow, /softprops\/action-gh-release@v2/);
    assert.equal((workflow.match(/softprops\/action-gh-release@v3/g) || []).length, 9);
});

test('local Windows packaging excludes retired Kuzu and invokes the shared runtime bundler', () => {
    const buildBat = read('build.bat');
    const installer = read('scripts/windows/BlogGeniusSetup.iss');

    assert.doesNotMatch(buildBat, /node_modules[/\\]kuzu/);
    assert.match(buildBat, /copy-vc-runtime[.]ps1/);
    assert.match(buildBat, /install-startup-launcher[.]ps1/);
    assert.match(buildBat, /PackageDir\s+"%ROOT_OUT%"/);
    assert.match(installer, /DefaultDirName=\{localappdata\}\\Programs\\\{#MyAppName\}/);
    assert.match(installer, /PrivilegesRequired=lowest/);
});

test('Windows packages install an external startup supervisor before runtime verification', () => {
    const workflow = read('.github/workflows/build.yml');
    const installer = read('scripts/windows/install-startup-launcher.ps1');
    const launcher = read('scripts/windows/startup-launcher/BlogGeniusLauncher.cs');

    assert.match(workflow, /Install Windows Startup Launcher/);
    assert.match(workflow, /install-startup-launcher[.]ps1 -PackageDir/);
    assert.match(workflow, /-IconPath\s+[.]\/assets\/icons\/icon[.]ico/);
    assert.match(installer, /BlogGenius-runtime[.]exe/);
    assert.match(launcher, /BLOGGENIUS_STARTUP_READY_FILE/);
    assert.match(launcher, /--bloggenius-safe-mode/);
    assert.match(launcher, /--disable-gpu/);
    assert.match(launcher, /--no-stdio-init/);
    assert.match(launcher, /AddMissing\(args, "--no-stdio-init"\)/);
    assert.doesNotMatch(launcher, /--no-sandbox/);
    assert.match(launcher, /normal mode failed before readiness; retrying safe mode/);
    assert.match(launcher, /ReadyStabilityWindow/);
    assert.match(launcher, /ready && !startupProbe/);
    assert.match(launcher, /ELECTRON_ENABLE_LOGGING/);
    assert.match(launcher, /chromium-normal[.]log/);
    assert.match(launcher, /safe mode recovered startup/);
    assert.match(launcher, /CreateDiagnosticBundle/);
    assert.match(workflow, /--bloggenius-startup-probe/);
    assert.match(workflow, /function Invoke-VersionVariant/);
    assert.match(workflow, /Name = 'disable-gpu'/);
    assert.match(workflow, /Name = 'no-sandbox'/);
    assert.match(workflow, /WaitForExit\(60000\)/);
    assert.match(workflow, /Get-BlogGeniusProcessSnapshot/);
    assert.match(workflow, /Write-RecentApplicationErrors/);
    assert.match(workflow, /Version probe passed with variant/);
    assert.match(workflow, /startup completion checkpoint/);
    assert.match(workflow, /"phase":"STARTUP_PROBE_COMPLETE"/);
    assert.match(workflow, /"safeMode":false/);
    assert.match(workflow, /"safeMode":true/);
    assert.doesNotMatch(workflow, /Stop-Process -Force/);
});
