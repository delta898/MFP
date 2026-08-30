#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { assertTrendsEnvironment } = require('../apps/trends/shared/lib/environment-profile');
const { parseEnvFile } = require('../apps/trends/shared/lib/load-env');
const { resolveApiRuntimeGuard } = require('../apps/trends/shared/lib/runtime-target-guard');

const PRODUCTION_DEPLOYMENT_PATH = path.join(
    'apps', 'trends', 'trends-api', 'deployment', 'production'
);
const MANIFEST_PATH = path.join(PRODUCTION_DEPLOYMENT_PATH, 'manifest.json');
const RUNTIME_ENV_PATH = path.join(PRODUCTION_DEPLOYMENT_PATH, '.env.trends-api.production');
const FIXED_PRODUCTION_ENV = Object.freeze({
    TRENDS_ENV: 'production',
    TRENDS_SUPABASE_TARGET_ENV: 'production',
    TRENDS_API_BASE_URL: 'https://trendapi.hangadac.com',
    TRENDS_DEVELOPMENT_SUPABASE_URL: 'https://bvtlwjbmjnfphxlrkzhm.supabase.co',
    TRENDS_DEVELOPMENT_API_BASE_URL: 'https://trendapi-dev.hangadac.com',
    TRENDS_READ_TOKEN_ISSUER: 'bloggenius-license',
    TRENDS_READ_TOKEN_AUDIENCE: 'trends-api'
});

function normalizeText(value) {
    return String(value || '').trim();
}

function readManifest(repoRoot, fsImpl = fs) {
    return JSON.parse(fsImpl.readFileSync(path.join(repoRoot, MANIFEST_PATH), 'utf8'));
}

function assertSecret(value, name, options = {}) {
    const normalized = normalizeText(value);
    if (!normalized || /(?:replace-with|change-me|placeholder|todo|example)/i.test(normalized)) {
        throw new Error(`${name} is not configured`);
    }
    const minimumLength = Number.isInteger(options.minimumLength) ? options.minimumLength : 24;
    if (normalized.length < minimumLength) {
        throw new Error(`${name} must be at least ${minimumLength} characters`);
    }
    return normalized;
}

function loadProductionRuntimeEnvironment(repoRoot, options = {}) {
    const fsImpl = options.fs || fs;
    const envPath = path.join(repoRoot, RUNTIME_ENV_PATH);
    if (!fsImpl.existsSync(envPath)) {
        throw new Error(`${RUNTIME_ENV_PATH} is required`);
    }
    const fileValues = parseEnvFile(fsImpl.readFileSync(envPath, 'utf8'));
    return Object.freeze({
        ...(options.env || process.env),
        ...fileValues,
        ...FIXED_PRODUCTION_ENV
    });
}

function inspectProductionTransition(options = {}) {
    const repoRoot = path.resolve(options.repoRoot || path.join(__dirname, '..'));
    const env = options.env || loadProductionRuntimeEnvironment(repoRoot, options);
    const manifest = options.manifest || readManifest(repoRoot, options.fs || fs);
    const environment = assertTrendsEnvironment(env.TRENDS_ENV);
    const failures = [];
    const warnings = [];
    const expectedApiUrl = manifest.service.public_base_url.replace(/\/+$/, '');
    let guard = null;

    try {
        guard = resolveApiRuntimeGuard({ environment, env });
    } catch (error) {
        failures.push(`runtime_target_guard: ${error.message}`);
    }

    if (environment !== 'production') failures.push('environment_must_be_production');
    if (normalizeText(env.TRENDS_API_BASE_URL).replace(/\/+$/, '') !== expectedApiUrl) {
        failures.push('production_api_url_mismatch');
    }
    if (normalizeText(env.TRENDS_READ_TOKEN_ISSUER) !== manifest.token_contract.issuer) {
        failures.push('token_issuer_mismatch');
    }
    if (normalizeText(env.TRENDS_READ_TOKEN_AUDIENCE) !== manifest.token_contract.audience) {
        failures.push('token_audience_mismatch');
    }
    for (const name of ['SUPABASE_SECRET_KEY', 'TRENDS_READ_TOKEN_SECRET']) {
        try {
            assertSecret(env[name], name);
        } catch (_error) {
            failures.push(`${name.toLowerCase()}_not_configured`);
        }
    }
    try {
        const ingestToken = assertSecret(env.TRENDS_API_TOKEN, 'TRENDS_API_TOKEN', {
            minimumLength: 1
        });
        if (ingestToken.length < 24) {
            warnings.push('trends_api_token_rotation_recommended');
        }
    } catch (_error) {
        failures.push('trends_api_token_not_configured');
    }

    const supabaseHost = guard?.supabaseEndpointHost || (() => {
        try { return new URL(env.SUPABASE_URL).host; } catch (_error) { return 'invalid'; }
    })();

    return Object.freeze({
        schemaVersion: 1,
        environment,
        ready: failures.length === 0,
        preparationOnly: true,
        deployment: Object.freeze({
            hostname: new URL(expectedApiUrl).hostname,
            containerName: manifest.service.container_name,
            containerPort: manifest.service.container_port,
            candidateHostPort: manifest.service.candidate_host_port,
            legacyHostPort: manifest.service.legacy_host_port,
            ingressOwner: manifest.transition_policy.ingress_owner,
            supabaseHost
        }),
        tokenContract: Object.freeze({
            issuerConfigured: normalizeText(env.TRENDS_READ_TOKEN_ISSUER) === manifest.token_contract.issuer,
            audienceConfigured: normalizeText(env.TRENDS_READ_TOKEN_AUDIENCE) === manifest.token_contract.audience,
            signingSecretConfigured: !failures.includes('trends_read_token_secret_not_configured')
        }),
        transition: Object.freeze({
            candidateRunsInParallel: manifest.transition_policy.candidate_runs_in_parallel,
            trafficCutoverRequiresApproval:
                manifest.transition_policy.traffic_cutover_requires_explicit_approval,
            legacyRemovalRequiresApproval:
                manifest.transition_policy.legacy_service_removal_requires_explicit_approval,
            rollbackUpstreamPort: manifest.transition_policy.rollback_upstream_port
        }),
        failures: Object.freeze(failures),
        warnings: Object.freeze(warnings)
    });
}

function formatResult(result) {
    const lines = [
        'Trends API Production transition preflight',
        `Decision: ${result.ready ? 'READY FOR CANDIDATE VALIDATION' : 'NOT READY'}`,
        `Environment: ${result.environment}`,
        `Public API: https://${result.deployment.hostname}`,
        `Candidate: ${result.deployment.containerName} / host:${result.deployment.candidateHostPort} -> container:${result.deployment.containerPort}`,
        `Legacy rollback port: ${result.deployment.legacyHostPort}`,
        `Supabase host: ${result.deployment.supabaseHost}`,
        `Traffic cutover approval: ${result.transition.trafficCutoverRequiresApproval ? 'required' : 'not required'}`,
        `Legacy removal approval: ${result.transition.legacyRemovalRequiresApproval ? 'required' : 'not required'}`,
        'Side effects: none (inspection only)'
    ];
    if (result.failures.length) lines.push(`Failures: ${result.failures.join(', ')}`);
    if (result.warnings.length) lines.push(`Warnings: ${result.warnings.join(', ')}`);
    lines.push('Secret values are never printed.');
    return `${lines.join('\n')}\n`;
}

function runCli(options = {}) {
    const argv = options.argv || process.argv.slice(2);
    const unknown = argv.filter((item) => item !== '--json');
    if (unknown.length) throw new Error(`Unknown argument: ${unknown[0]}`);
    const result = inspectProductionTransition(options);
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
        process.stderr.write(`Trends API Production transition preflight failed: ${error.message}\n`);
        process.exitCode = 1;
    }
}

module.exports = {
    FIXED_PRODUCTION_ENV,
    MANIFEST_PATH,
    PRODUCTION_DEPLOYMENT_PATH,
    RUNTIME_ENV_PATH,
    assertSecret,
    formatResult,
    inspectProductionTransition,
    loadProductionRuntimeEnvironment,
    readManifest,
    runCli
};
