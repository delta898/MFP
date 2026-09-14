'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function resolveDiagnosticRoot(options = {}) {
    const env = options.env || process.env;
    const platform = options.platform || process.platform;
    const tmpDir = options.tmpDir || os.tmpdir();
    const explicit = String(env.BLOGGENIUS_DIAGNOSTIC_ROOT || '').trim();
    if (explicit && path.isAbsolute(explicit)) return explicit;
    const preferred = platform === 'win32'
        ? String(env.LOCALAPPDATA || '').trim()
        : String(env.BLOG_GENIUS_USER_DATA || '').trim();
    return path.join(preferred || tmpDir, 'BlogGenius');
}

function ensureDirectory(fsImpl, directory) {
    try {
        fsImpl.mkdirSync(directory, { recursive: true });
        return directory;
    } catch (_error) {
        return '';
    }
}

function createStartupBootstrap(options = {}) {
    const fsImpl = options.fsImpl || fs;
    const pathImpl = options.pathImpl || path;
    const env = options.env || process.env;
    const fallbackRoot = pathImpl.join(options.tmpDir || os.tmpdir(), 'BlogGenius');
    const preferredRoot = resolveDiagnosticRoot({
        env,
        platform: options.platform || process.platform,
        tmpDir: options.tmpDir
    });
    const rootDir = ensureDirectory(fsImpl, preferredRoot) ? preferredRoot : fallbackRoot;
    const logDir = ensureDirectory(fsImpl, pathImpl.join(rootDir, 'logs')) || rootDir;
    const crashDir = ensureDirectory(fsImpl, pathImpl.join(rootDir, 'crashes')) || rootDir;
    const diagnosticsDir = ensureDirectory(fsImpl, pathImpl.join(rootDir, 'diagnostics')) || rootDir;
    const logPath = pathImpl.join(logDir, 'bootstrap.log');

    function write(phase, details = {}) {
        const payload = {
            timestamp: new Date().toISOString(),
            phase: String(phase || 'UNKNOWN'),
            pid: process.pid,
            ...details
        };
        try {
            if (fsImpl.existsSync(logPath) && fsImpl.statSync(logPath).size > 5 * 1024 * 1024) {
                const previousPath = pathImpl.join(logDir, 'bootstrap.previous.log');
                try { fsImpl.rmSync(previousPath, { force: true }); } catch (_ignore) { }
                fsImpl.renameSync(logPath, previousPath);
            }
            fsImpl.appendFileSync(logPath, `${JSON.stringify(payload)}\n`, 'utf8');
            return true;
        } catch (_error) {
            return false;
        }
    }

    function markReady(details = {}) {
        const readyPath = String(env.BLOGGENIUS_STARTUP_READY_FILE || '').trim();
        if (!readyPath || !pathImpl.isAbsolute(readyPath)) return false;
        try {
            ensureDirectory(fsImpl, pathImpl.dirname(readyPath));
            fsImpl.writeFileSync(readyPath, `${JSON.stringify({
                timestamp: new Date().toISOString(),
                pid: process.pid,
                ...details
            })}\n`, 'utf8');
            return true;
        } catch (error) {
            write('READY_MARKER_FAILED', { message: error.message });
            return false;
        }
    }

    return Object.freeze({
        rootDir,
        logDir,
        crashDir,
        diagnosticsDir,
        logPath,
        markReady,
        write
    });
}

module.exports = {
    createStartupBootstrap,
    resolveDiagnosticRoot
};
