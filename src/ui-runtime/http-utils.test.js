const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createUiHttpUtils } = require('./http-utils');

function createUtils(pathImpl) {
    return createUiHttpUtils({
        fs,
        path: pathImpl,
        Logger: { warn() {} },
        currentDir: process.cwd(),
        appRoot: process.cwd()
    });
}

test('UI URL paths remain canonical relative paths on Windows and POSIX', () => {
    for (const pathImpl of [path.win32, path.posix]) {
        const utils = createUtils(pathImpl);
        assert.equal(utils.sanitizePathname('/styles.css'), 'styles.css');
        assert.equal(utils.sanitizePathname('/app.js'), 'app.js');
        assert.equal(utils.sanitizePathname('/styles/features/dashboard.css'), 'styles/features/dashboard.css');
    }
});
test('UI URL path normalization cannot escape the UI root', () => {
    for (const pathImpl of [path.win32, path.posix]) {
        const utils = createUtils(pathImpl);
        assert.equal(utils.sanitizePathname('/../../styles.css'), 'styles.css');
        assert.equal(utils.sanitizePathname('/styles/../../../app.js'), 'app.js');
        assert.equal(utils.sanitizePathname('\\styles\\base\\foundation.css'), 'styles/base/foundation.css');
    }
});

test('Windows canonical asset paths select composed CSS and JavaScript responses', () => {
    const utils = createUtils(path.win32);
    const requestedStyles = utils.sanitizePathname('/styles.css');
    const requestedScript = utils.sanitizePathname('/app.js');

    assert.equal(requestedStyles === 'styles.css', true);
    assert.equal(requestedScript === 'app.js', true);
    assert.equal(utils.shouldServeUiShell('/styles.css', requestedStyles), false);
    assert.equal(utils.shouldServeUiShell('/app.js', requestedScript), false);
});
