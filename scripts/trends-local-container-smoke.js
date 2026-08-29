#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseEnvFile } = require('../apps/trends/shared/lib/load-env');
const { prepareLocalRuntimeEnvironment } = require('./trends-local-api-container');

const COMPOSE_ARGS = ['compose', '--file', 'apps/trends/compose.local.yml'];

function runDocker(repoRoot, runtimeEnv, args) {
    const result = spawnSync('docker', [...COMPOSE_ARGS, ...args], {
        cwd: repoRoot,
        env: runtimeEnv,
        stdio: 'inherit'
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        throw new Error(`docker compose ${args.join(' ')} failed with exit code ${result.status}`);
    }
}

async function waitForHealth(options = {}) {
    const attempts = options.attempts || 20;
    const delayMs = options.delayMs || 500;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
            const response = await fetch('http://127.0.0.1:4581/health');
            const body = await response.json();
            if (response.ok && body.environment === 'local') return body;
        } catch (_error) {
            // Container startup is expected to race with the first health attempts.
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    throw new Error('Local Trends API health check timed out');
}

async function verifyAuthenticatedMeta(runtimeEnvPath) {
    const env = parseEnvFile(fs.readFileSync(runtimeEnvPath, 'utf8'));
    const token = String(env.TRENDS_API_TOKEN || '').trim();
    if (!token) throw new Error('TRENDS_API_TOKEN is missing from apps/trends/.env.local');
    const response = await fetch('http://127.0.0.1:4581/api/v1/trends/meta', {
        headers: { Authorization: `Bearer ${token}` }
    });
    const body = await response.json();
    if (!response.ok) {
        const message = String(body?.message || 'unknown error').slice(0, 300);
        throw new Error(`Authenticated Trends meta request failed with status ${response.status}: ${message}`);
    }
    if (body.success !== true) throw new Error('Authenticated Trends meta response was not successful');
}

async function runSmoke() {
    const repoRoot = path.resolve(__dirname, '..');
    const runtime = prepareLocalRuntimeEnvironment({ repoRoot });
    try {
        runDocker(repoRoot, runtime.env, ['up', '--detach', '--build', '--force-recreate', 'trends-api']);
        await waitForHealth();
        await verifyAuthenticatedMeta(runtime.path);
        runDocker(repoRoot, runtime.env, ['restart', 'trends-api']);
        await waitForHealth();
        process.stdout.write('Local Trends API container smoke passed.\n');
    } catch (error) {
        try {
            runDocker(repoRoot, runtime.env, ['logs', '--no-color', '--tail', '80', 'trends-api']);
        } catch (_logError) {
            // Preserve the original smoke failure when diagnostics are unavailable.
        }
        throw error;
    } finally {
        try {
            runDocker(repoRoot, runtime.env, ['down', '--remove-orphans']);
        } finally {
            runtime.cleanup();
        }
    }
}

if (require.main === module) {
    runSmoke().catch((error) => {
        console.error(`Local Trends API container smoke failed: ${error.message}`);
        process.exitCode = 1;
    });
}

module.exports = {
    runSmoke,
    verifyAuthenticatedMeta,
    waitForHealth
};
