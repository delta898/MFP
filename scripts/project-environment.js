'use strict';

const fs = require('node:fs');
const path = require('node:path');

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
    const filePath = path.join(repoRoot, '.env');
    const fromFile = fsImpl.existsSync(filePath)
        ? parseEnvironmentFile(fsImpl.readFileSync(filePath, 'utf8'))
        : {};
    return Object.freeze({ ...fromFile, ...base });
}

module.exports = {
    parseEnvironmentFile,
    loadProjectEnvironment
};
