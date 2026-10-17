'use strict';

function resolveRuntimeLogDir(options = {}) {
    const env = options.env || process.env;
    const pathImpl = options.pathImpl || require('node:path');
    const explicit = String(env.BLOG_GENIUS_LOG_DIR || '').trim();
    if (explicit) return explicit;
    return pathImpl.join(String(options.rootDir || process.cwd()), 'logs');
}

module.exports = {
    resolveRuntimeLogDir
};
