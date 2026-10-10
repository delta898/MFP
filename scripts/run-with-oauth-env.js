#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
    DESKTOP_OAUTH_ENV_KEYS,
    parseEnvironmentFile
} = require('./project-environment');

function loadOAuthEnvironmentFile(filePath, baseEnv = process.env, fsImpl = fs, environment = 'development') {
    const normalizedEnvironment = String(environment || '').trim().toLowerCase();
    if (!['development', 'production'].includes(normalizedEnvironment)) {
        throw new Error(`Unsupported OAuth environment: ${normalizedEnvironment || '(missing)'}`);
    }
    const resolvedPath = path.resolve(filePath);
    if (!fsImpl.existsSync(resolvedPath)) {
        throw new Error(`OAuth environment file not found: ${resolvedPath}`);
    }

    const fileValues = parseEnvironmentFile(fsImpl.readFileSync(resolvedPath, 'utf8'));
    const env = { ...baseEnv };
    for (const key of DESKTOP_OAUTH_ENV_KEYS) {
        delete env[key];
        if (fileValues[key] !== undefined) env[key] = fileValues[key];
    }
    env.BLOGGENIUS_OAUTH_ENV = normalizedEnvironment;
    return Object.freeze(env);
}

function runWithOAuthEnvironment(argv = process.argv.slice(2), options = {}) {
    const separatorIndex = argv.indexOf('--');
    const environment = argv[0];
    const filePath = argv[1];
    const command = separatorIndex >= 0 ? argv[separatorIndex + 1] : '';
    const commandArgs = separatorIndex >= 0 ? argv.slice(separatorIndex + 2) : [];
    if (!environment || !filePath || separatorIndex < 2 || !command) {
        throw new Error('Usage: run-with-oauth-env.js <development|production> <env-file> -- <command> [args...]');
    }

    const repoRoot = path.resolve(options.repoRoot || path.join(__dirname, '..'));
    const env = loadOAuthEnvironmentFile(
        path.resolve(repoRoot, filePath),
        options.env || process.env,
        options.fs || fs,
        environment
    );
    const spawn = options.spawn || spawnSync;
    const result = spawn(command, commandArgs, {
        cwd: repoRoot,
        env,
        stdio: 'inherit'
    });
    if (result.error) throw result.error;
    return Number.isInteger(result.status) ? result.status : 1;
}

if (require.main === module) {
    try {
        process.exitCode = runWithOAuthEnvironment();
    } catch (error) {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
    }
}

module.exports = {
    loadOAuthEnvironmentFile,
    runWithOAuthEnvironment
};
