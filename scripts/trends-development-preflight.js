#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { loadTrendsEnvironment } = require('../apps/trends/shared/lib/environment-profile');
const { resolveApiRuntimeGuard } = require('../apps/trends/shared/lib/runtime-target-guard');

const MANIFEST_PATH = path.join('apps', 'trends', 'deployment', 'development-manifest.json');

function normalizeText(value) {
    return String(value || '').trim();
}

function readManifest(repoRoot, fsImpl = fs) {
    return JSON.parse(fsImpl.readFileSync(path.join(repoRoot, MANIFEST_PATH), 'utf8'));
}

function assertSecret(value, name) {
    const normalized = normalizeText(value);
    if (!normalized || /^(?:change-me|placeholder|todo|example)$/i.test(normalized)) {
        throw new Error(`${name} is not configured`);
    }
    if (normalized.length < 24) throw new Error(`${name} must be at least 24 characters`);
}

function inspectDevelopmentDeployment(options = {}) {
    const repoRoot = path.resolve(options.repoRoot || path.join(__dirname, '..'));
    const env = options.env || process.env;
    if (!normalizeText(env.TRENDS_ENV)) env.TRENDS_ENV = 'development';
    const manifest = options.manifest || readManifest(repoRoot, options.fs || fs);
    const profile = loadTrendsEnvironment({ baseDir: path.join(repoRoot, 'apps', 'trends'), env });
    const failures = [];
    const expected = manifest.service.public_base_url.replace(/\/+$/, '');
    let guard = null;

    try {
        guard = resolveApiRuntimeGuard({ environment: profile.environment, env });
    } catch (error) {
        failures.push(`runtime_target_guard: ${error.message}`);
    }

    if (normalizeText(env.TRENDS_API_BASE_URL).replace(/\/+$/, '') !== expected) {
        failures.push('development_api_url_mismatch');
    }
    if (normalizeText(env.TRENDS_READ_TOKEN_ISSUER) !== manifest.token_contract.issuer) {
        failures.push('token_issuer_mismatch');
    }
    if (normalizeText(env.TRENDS_READ_TOKEN_AUDIENCE) !== manifest.token_contract.audience) {
        failures.push('token_audience_mismatch');
    }
    for (const name of ['SUPABASE_SECRET_KEY', 'TRENDS_API_TOKEN', 'TRENDS_READ_TOKEN_SECRET']) {
        try {
            assertSecret(env[name], name);
        } catch (_error) {
            failures.push(`${name.toLowerCase()}_not_configured`);
        }
    }
    for (const name of ['TRENDS_PRODUCTION_SUPABASE_URL', 'TRENDS_PRODUCTION_API_BASE_URL']) {
        if (!normalizeText(env[name])) failures.push(`${name.toLowerCase()}_missing`);
    }

    return Object.freeze({
        schemaVersion: 1,
        environment: profile.environment,
        ready: failures.length === 0,
        deployment: Object.freeze({
            hostname: new URL(expected).hostname,
            containerName: manifest.service.container_name,
            containerPort: manifest.service.container_port,
            ingressOwner: manifest.deployment_policy.ingress_owner,
            supabaseHost: guard?.supabaseEndpointHost || (() => {
                try { return new URL(env.SUPABASE_URL).host; } catch (_error) { return 'invalid'; }
            })(),
            initialCollection: manifest.deployment_policy.initial_collection
        }),
        tokenContract: Object.freeze({
            issuerConfigured: normalizeText(env.TRENDS_READ_TOKEN_ISSUER) === manifest.token_contract.issuer,
            audienceConfigured: normalizeText(env.TRENDS_READ_TOKEN_AUDIENCE) === manifest.token_contract.audience,
            signingSecretConfigured: !failures.includes('trends_read_token_secret_not_configured')
        }),
        productionIsolation: Object.freeze({
            apiTargetDifferent: normalizeText(env.TRENDS_API_BASE_URL).replace(/\/+$/, '')
                !== normalizeText(env.TRENDS_PRODUCTION_API_BASE_URL).replace(/\/+$/, ''),
            supabaseTargetDifferent: normalizeText(env.SUPABASE_URL).replace(/\/+$/, '')
                !== normalizeText(env.TRENDS_PRODUCTION_SUPABASE_URL).replace(/\/+$/, ''),
            productionMutationAllowed: manifest.deployment_policy.production_service_mutation_allowed
        }),
        failures: Object.freeze(failures)
    });
}

function formatResult(result) {
    const lines = [
        'Trends API development deployment preflight',
        `Decision: ${result.ready ? 'READY' : 'NOT READY'}`,
        `Environment: ${result.environment}`,
        `Public API: https://${result.deployment.hostname}`,
        `Container port: ${result.deployment.containerPort}`,
        `Ingress owner: ${result.deployment.ingressOwner}`,
        `Container: ${result.deployment.containerName}`,
        `Supabase host: ${result.deployment.supabaseHost}`,
        `Initial collection: ${result.deployment.initialCollection}`,
        `Production mutation: ${result.productionIsolation.productionMutationAllowed ? 'allowed' : 'blocked'}`
    ];
    if (result.failures.length) lines.push(`Failures: ${result.failures.join(', ')}`);
    lines.push('Secret values are never printed.');
    return `${lines.join('\n')}\n`;
}

function runCli(options = {}) {
    const argv = options.argv || process.argv.slice(2);
    const unknown = argv.filter((item) => item !== '--json');
    if (unknown.length) throw new Error(`Unknown argument: ${unknown[0]}`);
    const result = inspectDevelopmentDeployment(options);
    return Object.freeze({
        result,
        exitCode: result.ready ? 0 : 1,
        output: argv.includes('--json') ? `${JSON.stringify(result, null, 2)}\n` : formatResult(result)
    });
}

if (require.main === module) {
    try {
        const outcome = runCli();
        process.stdout.write(outcome.output);
        process.exitCode = outcome.exitCode;
    } catch (error) {
        process.stderr.write(`Trends API development preflight failed: ${error.message}\n`);
        process.exitCode = 1;
    }
}

module.exports = { MANIFEST_PATH, assertSecret, formatResult, inspectDevelopmentDeployment, readManifest, runCli };
