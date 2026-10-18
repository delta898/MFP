'use strict';

const path = require('node:path');

function getDefaultRuntimePaths({ env = process.env, cwd = process.cwd() } = {}) {
    const runtimeRoot = env.BLOGGENIUS_RUNTIME_ROOT
        || env.BLOG_GENIUS_USER_DATA
        || cwd;
    return Object.freeze({
        AUTH_FILE_PATH: path.join(runtimeRoot, 'naver_auth.json'),
        WORKSPACE_DIR: path.join(runtimeRoot, 'workspace')
    });
}

module.exports = { getDefaultRuntimePaths };
