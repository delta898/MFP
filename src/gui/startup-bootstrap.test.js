'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createStartupBootstrap, resolveDiagnosticRoot } = require('./startup-bootstrap');

test('Windows diagnostics use a stable LocalAppData root', () => {
    assert.equal(
        resolveDiagnosticRoot({ platform: 'win32', env: { LOCALAPPDATA: 'C:\\Users\\A\\AppData\\Local' } }),
        path.join('C:\\Users\\A\\AppData\\Local', 'BlogGenius')
    );
});

test('launcher-provided absolute diagnostic root takes precedence', () => {
    assert.equal(
        resolveDiagnosticRoot({
            platform: 'win32',
            env: {
                LOCALAPPDATA: 'C:\\Users\\A\\AppData\\Local',
                BLOGGENIUS_DIAGNOSTIC_ROOT: '/tmp/bloggenius-explicit'
            }
        }),
        '/tmp/bloggenius-explicit'
    );
});

test('bootstrap writes phase evidence and an absolute readiness marker', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bloggenius-bootstrap-'));
    const readyPath = path.join(tempRoot, 'startup', 'ready.json');
    const bootstrap = createStartupBootstrap({
        platform: 'win32',
        env: {
            LOCALAPPDATA: tempRoot,
            BLOGGENIUS_STARTUP_READY_FILE: readyPath
        },
        tmpDir: tempRoot
    });

    assert.equal(bootstrap.write('JS_ENTRY', { safeMode: false }), true);
    assert.equal(bootstrap.markReady({ safeMode: false }), true);
    assert.match(fs.readFileSync(bootstrap.logPath, 'utf8'), /"phase":"JS_ENTRY"/);
    assert.match(fs.readFileSync(bootstrap.logPath, 'utf8'), /"runId":"[^"]+"/);
    assert.match(fs.readFileSync(readyPath, 'utf8'), /"safeMode":false/);
});

test('bootstrap creates and uses its temporary fallback when the preferred root is blocked', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bloggenius-bootstrap-fallback-'));
    const blockedParent = path.join(tempRoot, 'blocked');
    fs.writeFileSync(blockedParent, 'not a directory');

    const bootstrap = createStartupBootstrap({
        platform: 'win32',
        env: { LOCALAPPDATA: blockedParent },
        tmpDir: tempRoot
    });

    assert.equal(bootstrap.rootDir, path.join(tempRoot, 'BlogGenius'));
    assert.equal(bootstrap.write('FALLBACK_READY'), true);
    assert.equal(fs.existsSync(bootstrap.logPath), true);
});
