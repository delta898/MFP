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

test('local Windows packaging unpacks Kuzu and invokes the shared runtime bundler', () => {
    const buildBat = read('build.bat');
    const installer = read('scripts/windows/BlogGeniusSetup.iss');

    assert.match(buildBat, /node_modules[/\\]kuzu/);
    assert.match(buildBat, /copy-vc-runtime[.]ps1/);
    assert.match(buildBat, /PackageDir\s+"%ROOT_OUT%"/);
    assert.match(installer, /DefaultDirName=\{localappdata\}\\Programs\\\{#MyAppName\}/);
    assert.match(installer, /PrivilegesRequired=lowest/);
});
