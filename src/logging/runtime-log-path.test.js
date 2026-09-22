'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { resolveRuntimeLogDir } = require('./runtime-log-path');

test('runtime log path uses the Electron diagnostic log directory when provided', () => {
    assert.equal(
        resolveRuntimeLogDir({
            env: { BLOG_GENIUS_LOG_DIR: '/diagnostics/BlogGenius/logs' },
            rootDir: '/app/root',
            pathImpl: path
        }),
        '/diagnostics/BlogGenius/logs'
    );
});

test('runtime log path falls back to the application root for CLI runs', () => {
    assert.equal(
        resolveRuntimeLogDir({ env: {}, rootDir: '/app/root', pathImpl: path }),
        path.join('/app/root', 'logs')
    );
});
