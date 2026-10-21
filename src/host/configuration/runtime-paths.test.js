'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRuntimePathConfiguration, resolveRuntimeRoots } = require('./runtime-paths');

test('development runtime root honors explicit launcher configuration and preserves user data separately', () => {
    const runtimeRoot = path.join(os.tmpdir(), 'bloggenius-project');
    const roots = resolveRuntimeRoots({
        env: {
            BLOGGENIUS_RUNTIME_ROOT: runtimeRoot,
            BLOG_GENIUS_USER_DATA: path.join(os.tmpdir(), 'bloggenius-user-data')
        },
        execPath: '/usr/bin/node',
        cwd: '/workspace/project',
        platform: 'linux'
    });

    assert.equal(roots.rootDir, runtimeRoot);
    assert.equal(roots.execDir, '/workspace/project');
    assert.equal(roots.userDataDir, path.join(os.tmpdir(), 'bloggenius-user-data'));
});

test('packaged macOS runtime uses its unified user-data root instead of the app bundle', () => {
    const userDataRoot = path.join(os.tmpdir(), 'bloggenius-packaged-user-data');
    const roots = resolveRuntimeRoots({
        env: { BLOG_GENIUS_USER_DATA: userDataRoot },
        execPath: '/Applications/BlogGenius.app/Contents/MacOS/BlogGenius',
        cwd: '/Applications/BlogGenius.app/Contents/MacOS',
        platform: 'darwin'
    });

    assert.equal(roots.isPackaged, true);
    assert.equal(roots.rootDir, userDataRoot);
    assert.equal(roots.activeRoot, '/Applications');
});

test('runtime path configuration resolves moved bundled prompt assets and portable config paths', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bloggenius-runtime-paths-'));
    const config = createRuntimePathConfiguration({
        env: { BLOGGENIUS_RUNTIME_ROOT: root, BLOGGENIUS_ENV: 'local' },
        execPath: '/usr/bin/node',
        cwd: root,
        platform: 'linux',
        resourcesPath: path.join(root, 'resources')
    });

    assert.equal(config.paths.configJson, path.join(root, 'config', 'config.json'));
    assert.match(config.paths.defaultBlogPrompt, /src[\/]content[\/]prompts[\/]blog[\/]common[.]md$/);
    assert.match(config.paths.defaultShoppingPrompt, /src[\/]applications[\/]shopping[\/]generation[\/]prompts[\/]default[.]md$/);
    assert.equal(config.paths.configJsonSampleFromResources, path.join(root, 'resources', 'config.json.sample'));
});
