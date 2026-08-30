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
    'SUPABASE_SERVICE_ROLE_KEY',
    'TRENDS_READ_TOKEN_SECRET'
]);
const LOCAL_SHARED_SECRET_KEYS = Object.freeze([
    'TRENDS_API_TOKEN'
]);
const LOCAL_FUNCTION_SECRET_KEYS = Object.freeze([
    'TRENDS_READ_TOKEN_SECRET'
]);
const OBSOLETE_LOCAL_COLLECTOR_KEYS = Object.freeze([
    'SUPABASE_URL',
    'SUPABASE_SECRET_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'TRENDS_SUPABASE_TARGET_ENV',
    'TRENDS_API_HOST',
    'TRENDS_API_PORT',
    'TRENDS_READ_TOKEN_SECRET',
    'TRENDS_READ_TOKEN_ISSUER',
    'TRENDS_READ_TOKEN_AUDIENCE'
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

function createRuntimeEnvironmentSource(baseSource, connection, functionSource = '') {
    const functionEnvironment = parseEnvFile(functionSource);
    const signingSecret = normalizeText(functionEnvironment.TRENDS_READ_TOKEN_SECRET);
    const issuer = normalizeText(functionEnvironment.TRENDS_READ_TOKEN_ISSUER) || 'bloggenius-local';
    const audience = normalizeText(functionEnvironment.TRENDS_READ_TOKEN_AUDIENCE) || 'trends-api-local';
    if (!signingSecret) throw new Error('Local Functions signing secret is missing');
    const retainedLines = String(baseSource || '')
        .split(/\r?\n/)
        .filter((line) => {
            const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/);
            return !match || !MANAGED_SECRET_KEYS.has(match[1]);
        });
    retainedLines.push(`SUPABASE_SECRET_KEY=${JSON.stringify(connection.secretKey)}`);
    retainedLines.push(`TRENDS_READ_TOKEN_SECRET=${JSON.stringify(signingSecret)}`);
    retainedLines.push(`TRENDS_READ_TOKEN_ISSUER=${JSON.stringify(issuer)}`);
    retainedLines.push(`TRENDS_READ_TOKEN_AUDIENCE=${JSON.stringify(audience)}`);
    return `${retainedLines.join('\n').replace(/\n+$/, '')}\n`;
}

function ensureEnvironmentFile(filePath, samplePath, fileSystem = fs) {
    if (fileSystem.existsSync(filePath)) return false;
    if (!fileSystem.existsSync(samplePath)) {
        throw new Error(`Local environment sample is missing: ${samplePath}`);
    }
    fileSystem.mkdirSync(path.dirname(filePath), { recursive: true });
    fileSystem.copyFileSync(samplePath, filePath);
    return true;
}

function ensureSecretAssignments(filePath, secretKeys, options = {}) {
    let source = fs.readFileSync(filePath, 'utf8');
    const parsed = parseEnvFile(source);
    const generatedKeys = [];
    for (const key of secretKeys) {
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

function removeAssignment(source, key) {
    const pattern = new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=.*(?:\\r?\\n|$)`, 'm');
    return String(source || '').replace(pattern, '');
}

function setAssignment(source, key, value) {
    const pattern = new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=.*$`, 'm');
    const assignment = `${key}=${value}`;
    return pattern.test(source)
        ? source.replace(pattern, assignment)
        : `${source.replace(/\n*$/, '\n')}${assignment}\n`;
}

function ensureLocalSecretFiles(options = {}) {
    const repoRoot = path.resolve(options.repoRoot || path.join(__dirname, '..'));
    const sampleRepoRoot = path.resolve(options.sampleRepoRoot || repoRoot);
    const randomBytes = options.randomBytes || crypto.randomBytes;
    const collectorPath = path.join(repoRoot, 'apps', 'trends', 'trends-collector', 'config', '.env.trends-collector.local');
    const collectorSamplePath = path.join(sampleRepoRoot, 'apps', 'trends', 'trends-collector', 'config', '.env.trends-collector.local.sample');
    const functionsPath = path.join(repoRoot, 'supabase', 'functions', '.env');
    const functionsSamplePath = path.join(sampleRepoRoot, 'supabase', 'functions', '.env.sample');

    ensureEnvironmentFile(collectorPath, collectorSamplePath);
    const functionFileCreated = ensureEnvironmentFile(functionsPath, functionsSamplePath);

    let collectorSource = fs.readFileSync(collectorPath, 'utf8');
    let functionsSource = fs.readFileSync(functionsPath, 'utf8');
    const legacySigningSecret = normalizeText(parseEnvFile(collectorSource).TRENDS_READ_TOKEN_SECRET);
    const currentSigningSecret = normalizeText(parseEnvFile(functionsSource).TRENDS_READ_TOKEN_SECRET);
    let migratedSigningSecret = false;
    if (!currentSigningSecret && legacySigningSecret) {
        functionsSource = setAssignment(functionsSource, 'TRENDS_READ_TOKEN_SECRET', legacySigningSecret);
        fs.writeFileSync(functionsPath, functionsSource, { encoding: 'utf8', mode: 0o600 });
        migratedSigningSecret = true;
    }
    let cleanedCollectorSource = collectorSource;
    for (const key of OBSOLETE_LOCAL_COLLECTOR_KEYS) {
        cleanedCollectorSource = removeAssignment(cleanedCollectorSource, key);
    }
    if (cleanedCollectorSource !== collectorSource) {
        collectorSource = cleanedCollectorSource;
        fs.writeFileSync(collectorPath, collectorSource, { encoding: 'utf8', mode: 0o600 });
    }

    const collectorSecrets = ensureSecretAssignments(collectorPath, LOCAL_SHARED_SECRET_KEYS, { randomBytes });
    const functionSecrets = ensureSecretAssignments(functionsPath, LOCAL_FUNCTION_SECRET_KEYS, { randomBytes });
    return Object.freeze({
        collectorPath,
        functionsPath,
        collectorSource: collectorSecrets.source,
        functionsSource: functionSecrets.source,
        generatedKeys: Object.freeze([...collectorSecrets.generatedKeys, ...functionSecrets.generatedKeys]),
        migratedSigningSecret,
        requiresFunctionRuntimeRestart: functionFileCreated
            || migratedSigningSecret
            || functionSecrets.generatedKeys.length > 0
    });
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
    const localSecrets = ensureLocalSecretFiles({
        repoRoot,
        sampleRepoRoot: options.sampleRepoRoot,
        randomBytes: options.randomBytes
    });

    const statusResult = runChecked(spawn, 'supabase', ['status', '--output', 'json'], {
        cwd: repoRoot,
        env: processEnv,
        encoding: 'utf8'
    });
    const connection = parseLocalSupabaseAdminConnection(statusResult.stdout);
    const runtimeDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'bloggenius-trends-local-'));
    const runtimeEnvPath = path.join(runtimeDirectory, 'runtime.env');

    fs.writeFileSync(
        runtimeEnvPath,
        createRuntimeEnvironmentSource(localSecrets.collectorSource, connection, localSecrets.functionsSource),
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
            'apps/trends/trends-api/deployment/local/compose.yml',
            'up',
            '--build',
            ...(options.detached === true ? ['--detach', '--wait'] : []),
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
    ensureEnvironmentFile,
    ensureSecretAssignments,
    ensureLocalSecretFiles,
    parseLocalSupabaseAdminConnection,
    prepareLocalRuntimeEnvironment,
    runLocalTrendsApiContainer
};
