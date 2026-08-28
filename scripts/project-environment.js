'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_DEVELOPMENT_ENV_FILE = '.env.development';
const DEFAULT_GOOGLE_OAUTH_ENV_FILE = '.env.oauth';
const GOOGLE_OAUTH_ENV_KEYS = Object.freeze([
    'GOOGLE_OAUTH_CLIENT_ID',
    'GOOGLE_OAUTH_CLIENT_SECRET'
]);

function stripQuotes(value) {
    if (value.length >= 2 && (
        (value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'"))
    )) return value.slice(1, -1);
    return value;
}

function parseEnvironmentFile(source) {
    const parsed = {};
    for (const rawLine of String(source || '').split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (!match) continue;
        parsed[match[1]] = stripQuotes(match[2].trim());
    }
    return parsed;
}

function loadProjectEnvironment(options = {}) {
    const repoRoot = path.resolve(options.repoRoot || path.join(__dirname, '..'));
    const fsImpl = options.fs || fs;
    const base = options.env || process.env;
    const fileName = options.fileName || DEFAULT_DEVELOPMENT_ENV_FILE;
    const filePath = path.join(repoRoot, fileName);
    const fromFile = fsImpl.existsSync(filePath)
        ? parseEnvironmentFile(fsImpl.readFileSync(filePath, 'utf8'))
        : {};
    return Object.freeze({ ...fromFile, ...base });
}

function loadDevelopmentEnvironment(options = {}) {
    return Object.freeze({
        ...loadProjectEnvironment(options),
        BLOGGENIUS_ENV: 'development'
    });
}

function loadGoogleOauthEnvironment(options = {}) {
    const loaded = loadProjectEnvironment({
        ...options,
        fileName: options.fileName || DEFAULT_GOOGLE_OAUTH_ENV_FILE
    });
    const base = options.env || process.env;
    const selected = {};
    for (const key of GOOGLE_OAUTH_ENV_KEYS) {
        if (loaded[key] !== undefined) selected[key] = loaded[key];
        if (base[key] !== undefined) selected[key] = base[key];
    }
    return Object.freeze({ ...base, ...selected });
}

module.exports = {
    DEFAULT_DEVELOPMENT_ENV_FILE,
    DEFAULT_GOOGLE_OAUTH_ENV_FILE,
    GOOGLE_OAUTH_ENV_KEYS,
    parseEnvironmentFile,
    loadProjectEnvironment,
    loadDevelopmentEnvironment,
    loadGoogleOauthEnvironment
};
