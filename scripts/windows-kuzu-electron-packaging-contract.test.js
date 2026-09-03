'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

test('Windows release rebuilds Kuzu for Electron before packaging', () => {
    const workflow = read('.github/workflows/build.yml');
    const buildBat = read('build.bat');
    const rebuildStep = workflow.indexOf('name: Rebuild Windows Kuzu for Electron');
    const packageStep = workflow.indexOf('name: Build GUI App');

    assert.ok(rebuildStep > 0);
    assert.ok(packageStep > rebuildStep);
    assert.match(workflow, /rebuild-kuzu-for-electron[.]ps1/);

    const rebuild = read('scripts/windows/rebuild-kuzu-for-electron.ps1');
    assert.match(rebuild, /Kuzu version for the Electron build patch/);
    assert.match(rebuild, /--runtime', 'electron'/);
    assert.match(rebuild, /--CDBUILD_NODEJS=TRUE/);
    assert.match(rebuild, /CMAKE_JS_NODELIB_DEF/);
    assert.match(rebuild, /kuzujs[.]node/);

    const localRebuildStep = buildBat.indexOf('rebuild-kuzu-for-electron.ps1');
    const localPackageStep = buildBat.indexOf('electron-packager');
    assert.ok(localRebuildStep > 0);
    assert.ok(localPackageStep > localRebuildStep);
});

test('packaged Kuzu verification uses the normal Electron entrypoint and a required marker', () => {
    const workflow = read('.github/workflows/build.yml');
    const electronMain = read('src/gui/electron-main.js');

    assert.doesNotMatch(workflow, /ELECTRON_RUN_AS_NODE/);
    assert.match(workflow, /BlogGenius[.]exe'\) --verify-native-modules/);
    assert.match(workflow, /did not emit its success marker/);
    assert.match(electronMain, /isNativeModuleVerificationRequested\(\)/);
    assert.match(electronMain, /verifyPackagedNativeModules\(\{ loadKuzu \}\)/);
    assert.match(electronMain, /app[.]exit\(succeeded \? 0 : 1\)/);
});
