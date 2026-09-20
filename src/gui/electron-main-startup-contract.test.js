'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, 'electron-main.js'), 'utf8');
const uiRoot = path.resolve(__dirname, '../../ui');
const uiIndex = fs.readFileSync(path.join(uiRoot, 'index.html'), 'utf8');
const rendererGuard = fs.readFileSync(path.join(uiRoot, 'startup-guard.js'), 'utf8');
const rendererLifecycle = fs.readFileSync(path.join(uiRoot, 'scripts/foundation/lifecycle.js'), 'utf8');

test('bootstrap and fatal handlers are installed before the application graph loads', () => {
    const bootstrapIndex = source.indexOf("require('./startup-bootstrap')");
    const handlerIndex = source.indexOf("process.on('uncaughtException'");
    const configIndex = source.indexOf("require('../config-loader')");

    assert.ok(bootstrapIndex >= 0);
    assert.ok(handlerIndex > bootstrapIndex);
    assert.ok(configIndex > handlerIndex);
});

test('runtime network family policy is applied before the application graph loads', () => {
    const policyIndex = source.indexOf('applyRuntimeNetworkPolicy()');
    const configIndex = source.indexOf("require('../config-loader')");
    assert.ok(policyIndex >= 0);
    assert.ok(configIndex > policyIndex);
    assert.match(source, /NETWORK_POLICY_READY/);
});

test('safe mode uses the minimal server and does not automatically disable the sandbox', () => {
    assert.match(source, /require\('\.\/safe-mode-server'\)/);
    assert.match(source, /app[.]disableHardwareAcceleration\(\)/);
    assert.doesNotMatch(source, /appendSwitch\(['"]no-sandbox/);
});

test('renderer readiness requires an explicit bootstrap handshake before the CI probe exits', () => {
    assert.ok(uiIndex.indexOf('startup-guard.js') < uiIndex.indexOf('app.js?v=4'));
    assert.match(rendererGuard, /window[.]addEventListener\('error'/);
    assert.match(rendererGuard, /window[.]addEventListener\('unhandledrejection'/);
    assert.match(rendererLifecycle, /__BLOGGENIUS_STARTUP__[?][.]markReady/);
    assert.match(source, /waitForRendererReady/);
    assert.match(source, /RENDERER_BOOTSTRAP_FAILED/);
    assert.match(source, /RENDERER_NAVIGATION_COMPLETE/);
    assert.match(source, /startup[.]markReady/);
    assert.match(source, /STARTUP_PROBE_COMPLETE/);
    assert.match(source, /setImmediate\(\(\) => app[.]quit\(\)\)/);
    assert.doesNotMatch(source, /did-finish-load'[\s\S]{0,250}startup[.]markReady/);
});

test('startup captures renderer console failures and bounds hung or unresponsive windows', () => {
    assert.match(source, /console-message/);
    assert.match(source, /RENDERER_CONSOLE/);
    assert.match(source, /STARTUP_TIMEOUT/);
    assert.match(source, /WINDOW_UNRESPONSIVE_TIMEOUT/);
});

test('normal GUI defers memory and optional services until after renderer readiness', () => {
    const readyIndex = source.indexOf("startup.write('RENDERER_READY'");
    const postReadyIndex = source.indexOf('startPostReadyServices().catch', readyIndex);
    assert.ok(readyIndex >= 0);
    assert.ok(postReadyIndex > readyIndex);
    assert.match(source, /deferOptionalStartup: !safeMode/);
    assert.match(source, /POST_READY_SERVICE_FAILED/);
});

test('a second app launch focuses the primary window instead of creating a port-conflicting server', () => {
    assert.match(source, /requestSingleInstanceLock/);
    assert.match(source, /SECOND_INSTANCE_EXIT/);
    assert.match(source, /app[.]on\('second-instance'/);
    assert.match(source, /SECOND_INSTANCE_FOCUSED/);
    assert.match(source, /UI_PORT_CONFLICT_FALLBACK/);
    assert.match(source, /allowEphemeralPort: true/);
});

test('normal shutdown closes SQLite memory while safe mode keeps a no-op boundary', () => {
    assert.match(source, /closeAgentMemory = \(\) => \{\}/);
    assert.match(source, /loadStartupModule\('ui-server', \(\) => require\('\.\.\/ui-server'\)\)/);
    assert.match(source, /app[.]on\('will-quit',[\s\S]{0,2000}closeAgentMemory[?][.]\(\)/);
    assert.match(source, /GUI: Shutdown active handles/);
    assert.match(source, /GUI: UI server closed\./);
    assert.match(source, /GUI: Agent memory closed\./);
});

test('quit asks about unsaved settings before the silent renderer veto can trap it', () => {
    assert.match(source, /let quitRequested = false/);
    assert.match(source, /function confirmQuitWithUnsavedChanges\(\)/);
    assert.match(source, /confirmAppQuitWithUnsavedChanges/);
    assert.match(source, /window\.__bloggeniusForceQuit = true/);
    assert.match(source, /app[.]on\('before-quit', \(event\) =>/);
    assert.doesNotMatch(source, /dialog\.showMessageBox\(win/);
});

test('short-lived commands exit before window creation without Electron internals', () => {
    assert.match(source, /isShortLivedCommand\(process\.argv\.slice\(1\)\)/);
    assert.match(source, /fs\.writeSync\(1, [`'"]\$\{app\.getVersion\(\)\}/);
    assert.match(source, /Usage: BlogGenius/);
    const shortLivedIndex = source.indexOf('isShortLivedCommand(process.argv.slice(1))');
    const watchdogIndex = source.indexOf('startupWatchdog = setTimeout');
    assert.ok(shortLivedIndex >= 0 && shortLivedIndex < watchdogIndex);
});
