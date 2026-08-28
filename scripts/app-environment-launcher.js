#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { loadDevelopmentEnvironment } = require('./project-environment');
const {
    loadManifest,
    inspectHostedDevelopmentReadiness
} = require('./hosted-development-readiness');

const SUPPORTED_ENVIRONMENTS = Object.freeze(['local', 'development']);
const LOCAL_EXCLUDED_SERVICES = 'realtime,storage-api,imgproxy,studio';

function normalizeText(value) {
    return String(value || '').trim();
}

function parseLocalSupabaseStatus(source) {
    let status;
    try {
        status = JSON.parse(String(source || ''));
    } catch (_error) {
        throw new Error('Local Supabase status did not return valid JSON');
    }

    const url = normalizeText(status.API_URL || status.api_url).replace(/\/+$/, '');
    const publishableKey = normalizeText(
        status.PUBLISHABLE_KEY
        || status.publishable_key
        || status.ANON_KEY
        || status.anon_key
    );
    if (!url || !publishableKey) {
        throw new Error('Local Supabase URL or publishable key is missing');
    }
    return Object.freeze({ url, publishableKey });
}

function runChecked(spawn, command, args, options = {}) {
    const result = spawn(command, args, options);
    if (result.error) throw result.error;
    if (result.status !== 0) {
        throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
    }
    return result;
}

function prepareLocalEnvironment(options = {}) {
    const repoRoot = path.resolve(options.repoRoot || path.join(__dirname, '..'));
    const spawn = options.spawn || spawnSync;
    const baseEnv = options.env || process.env;

    runChecked(spawn, 'supabase', [
        'start',
        '--exclude',
        LOCAL_EXCLUDED_SERVICES
    ], {
        cwd: repoRoot,
        env: baseEnv,
        stdio: options.quiet ? 'pipe' : 'inherit',
        encoding: 'utf8'
    });
    const statusResult = runChecked(spawn, 'supabase', [
        'status',
        '--output',
        'json'
    ], {
        cwd: repoRoot,
        env: baseEnv,
        encoding: 'utf8'
    });
    const status = parseLocalSupabaseStatus(statusResult.stdout);

    return Object.freeze({
        ...baseEnv,
        BLOGGENIUS_ENV: 'local',
        BLOGGENIUS_RUNTIME_ROOT: repoRoot,
        BLOGGENIUS_LOCAL_SUPABASE_URL: status.url,
        BLOGGENIUS_LOCAL_SUPABASE_PUBLISHABLE_KEY: status.publishableKey
    });
}

function prepareDevelopmentEnvironment(options = {}) {
    const repoRoot = path.resolve(options.repoRoot || path.join(__dirname, '..'));
    const env = loadDevelopmentEnvironment({
        repoRoot,
        fs: options.fs,
        env: options.env || process.env
    });
    const manifest = options.manifest || loadManifest(repoRoot, options.fs);
    const readiness = inspectHostedDevelopmentReadiness({
        repoRoot,
        fs: options.fs,
        env,
        manifest
    });
    if (!readiness.ready) {
        const details = [
            ...readiness.project.missingSources,
            ...readiness.policyViolations
        ].join(', ');
        throw new Error(`Development environment is not ready${details ? `: ${details}` : ''}`);
    }
    return Object.freeze({
        ...env,
        BLOGGENIUS_RUNTIME_ROOT: repoRoot
    });
}

function prepareAppEnvironment(target, options = {}) {
    if (!SUPPORTED_ENVIRONMENTS.includes(target)) {
        throw new Error(`Unsupported app environment: ${target || '(missing)'}`);
    }
    return target === 'local'
        ? prepareLocalEnvironment(options)
        : prepareDevelopmentEnvironment(options);
}

function launchApp(target, options = {}) {
    const repoRoot = path.resolve(options.repoRoot || path.join(__dirname, '..'));
    const spawn = options.spawn || spawnSync;
    const env = prepareAppEnvironment(target, { ...options, repoRoot, spawn });
    const electronCli = options.electronCli || require.resolve('electron/cli.js');
    process.stdout.write(`Starting BlogGenius in ${target} environment...\n`);
    const result = spawn(process.execPath, [electronCli, '.'], {
        cwd: repoRoot,
        env,
        stdio: 'inherit'
    });
    if (result.error) throw result.error;
    return result.status ?? 1;
}

if (require.main === module) {
    try {
        process.exitCode = launchApp(normalizeText(process.argv[2]).toLowerCase());
    } catch (error) {
        process.stderr.write(`BlogGenius app launch failed: ${error.message}\n`);
        process.exitCode = 1;
    }
}

module.exports = {
    SUPPORTED_ENVIRONMENTS,
    LOCAL_EXCLUDED_SERVICES,
    parseLocalSupabaseStatus,
    prepareLocalEnvironment,
    prepareDevelopmentEnvironment,
    prepareAppEnvironment,
    launchApp
};
