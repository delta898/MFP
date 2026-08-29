#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { parseEnvFile } = require('../apps/trends/shared/lib/load-env');

const MANAGED_SECRET_KEYS = new Set([
    'SUPABASE_SECRET_KEY',
    'SUPABASE_SERVICE_ROLE_KEY'
]);
const LOCAL_SHARED_SECRET_KEYS = Object.freeze([
    'TRENDS_API_TOKEN',
    'TRENDS_READ_TOKEN_SECRET'
]);

function normalizeText(value) {
    return String(value || '').trim();
}

function parseLocalSupabaseAdminConnection(source) {
    let status;
    try {
        status = JSON.parse(String(source || ''));
    } catch (_error) {
        throw new Error('Local Supabase status did not return valid JSON');
    }

    const apiUrl = normalizeText(status.API_URL || status.api_url);
    const secretKey = normalizeText(
        status.SECRET_KEY
        || status.secret_key
        || status.SERVICE_ROLE_KEY
        || status.service_role_key
    );
    let parsedUrl;
    try {
        parsedUrl = new URL(apiUrl);
    } catch (_error) {
        throw new Error('Local Supabase API URL is missing or invalid');
    }
    if (!['127.0.0.1', 'localhost', '::1'].includes(parsedUrl.hostname.toLowerCase())) {
        throw new Error('Local Supabase status returned a non-local API URL');
    }
    if (!secretKey) {
        throw new Error('Local Supabase secret key is missing');
    }
    return Object.freeze({ apiUrl: parsedUrl.toString().replace(/\/$/, ''), secretKey });
}

function createRuntimeEnvironmentSource(baseSource, connection) {
    const retainedLines = String(baseSource || '')
        .split(/\r?\n/)
        .filter((line) => {
            const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
            return !match || !MANAGED_SECRET_KEYS.has(match[1]);
        });
    retainedLines.push(`SUPABASE_SECRET_KEY=${JSON.stringify(connection.secretKey)}`);
    return `${retainedLines.join('\n').replace(/\n+$/, '')}\n`;
}

function ensureLocalSharedSecrets(filePath, options = {}) {
    let source = fs.readFileSync(filePath, 'utf8');
    const parsed = parseEnvFile(source);
    const generatedKeys = [];
    for (const key of LOCAL_SHARED_SECRET_KEYS) {
        if (normalizeText(parsed[key])) continue;
        const value = (options.randomBytes || crypto.randomBytes)(32).toString('hex');
        const assignmentPattern = new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=.*$`, 'm');
        const assignment = `${key}=${value}`;
        source = assignmentPattern.test(source)
            ? source.replace(assignmentPattern, assignment)
            : `${source.replace(/\n*$/, '\n')}${assignment}\n`;
        parsed[key] = value;
        generatedKeys.push(key);
    }
    if (generatedKeys.length > 0) {
        fs.writeFileSync(filePath, source, { encoding: 'utf8', mode: 0o600 });
    }
    fs.chmodSync(filePath, 0o600);
    return Object.freeze({ source, generatedKeys: Object.freeze(generatedKeys) });
}

function runChecked(spawn, command, args, options) {
    const result = spawn(command, args, options);
    if (result.error) throw result.error;
    if (result.status !== 0) {
        throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
    }
    return result;
}

function prepareLocalRuntimeEnvironment(options = {}) {
    const repoRoot = path.resolve(options.repoRoot || path.join(__dirname, '..'));
    const spawn = options.spawn || spawnSync;
    const processEnv = options.env || process.env;
    const baseEnvPath = path.join(repoRoot, 'apps', 'trends', '.env.trends-collector.local');
    if (!fs.existsSync(baseEnvPath)) {
        throw new Error('apps/trends/.env.trends-collector.local file is required');
    }

    const statusResult = runChecked(spawn, 'supabase', ['status', '--output', 'json'], {
        cwd: repoRoot,
        env: processEnv,
        encoding: 'utf8'
    });
    const connection = parseLocalSupabaseAdminConnection(statusResult.stdout);
    const runtimeDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'bloggenius-trends-local-'));
    const runtimeEnvPath = path.join(runtimeDirectory, 'runtime.env');

    const localSecrets = ensureLocalSharedSecrets(baseEnvPath, options);
    fs.writeFileSync(
        runtimeEnvPath,
        createRuntimeEnvironmentSource(localSecrets.source, connection),
        { encoding: 'utf8', mode: 0o600 }
    );
    return Object.freeze({
        path: runtimeEnvPath,
        env: Object.freeze({
            ...processEnv,
            TRENDS_LOCAL_RUNTIME_ENV_FILE: runtimeEnvPath
        }),
        cleanup() {
            fs.rmSync(runtimeDirectory, { recursive: true, force: true });
        }
    });
}

function runLocalTrendsApiContainer(options = {}) {
    const repoRoot = path.resolve(options.repoRoot || path.join(__dirname, '..'));
    const spawn = options.spawn || spawnSync;
    const runtime = prepareLocalRuntimeEnvironment({ ...options, repoRoot, spawn });

    try {
        const result = spawn('docker', [
            'compose',
            '--file',
            'apps/trends/compose.local.yml',
            'up',
            '--build',
            'trends-api'
        ], {
            cwd: repoRoot,
            env: runtime.env,
            stdio: 'inherit'
        });
        if (result.error) throw result.error;
        return result.status ?? 1;
    } finally {
        runtime.cleanup();
    }
}

if (require.main === module) {
    try {
        process.exitCode = runLocalTrendsApiContainer();
    } catch (error) {
        console.error(`Local Trends API container failed: ${error.message}`);
        process.exitCode = 1;
    }
}

module.exports = {
    createRuntimeEnvironmentSource,
    ensureLocalSharedSecrets,
    parseLocalSupabaseAdminConnection,
    prepareLocalRuntimeEnvironment,
    runLocalTrendsApiContainer
};
