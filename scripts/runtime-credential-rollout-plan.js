#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { evaluateDeploymentPreflight } = require('../src/environment/deployment-guard');
const { resolveCurrentBranch } = require('./environment-preflight');
const { loadDevelopmentEnvironment } = require('./project-environment');

const ROLLOUT_MANIFEST = 'supabase/runtime-credential-security-rollout.json';
const EXPECTED_PHASES = Object.freeze([
    'preflight',
    'database_dry_run',
    'database_migrate',
    'function_deploy',
    'safe_http_smoke',
    'semantic_provider_smoke',
    'development_evidence',
    'dev_push'
]);

function normalizeText(value) {
    return String(value || '').trim();
}

function readJson(filePath, fsImpl = fs) {
    return JSON.parse(fsImpl.readFileSync(filePath, 'utf8'));
}

function inspectRolloutInputs(options = {}) {
    const repoRoot = path.resolve(options.repoRoot || path.join(__dirname, '..'));
    const fsImpl = options.fs || fs;
    const manifest = options.manifest || readJson(path.join(repoRoot, ROLLOUT_MANIFEST), fsImpl);
    const hostedManifest = readJson(path.join(repoRoot, 'supabase/hosted-development-manifest.json'), fsImpl);
    const functionConfig = fsImpl.readFileSync(path.join(repoRoot, 'supabase/config.toml'), 'utf8');
    const missing = [];

    for (const migration of manifest.migrations || []) {
        if (!/^\d{12,14}_[a-z0-9_]+[.]sql$/.test(migration)
            || !fsImpl.existsSync(path.join(repoRoot, 'supabase/migrations', migration))) {
            missing.push(`migration:${migration}`);
        }
    }
    for (const edgeFunction of manifest.edge_functions || []) {
        const name = normalizeText(edgeFunction?.name);
        if (!name || !fsImpl.existsSync(path.join(repoRoot, 'supabase/functions', name, 'index.ts'))) {
            missing.push(`function:${name || '(empty)'}`);
        }
    }

    const validSecretNames = (manifest.edge_functions || []).every((edgeFunction) => (
        Array.isArray(edgeFunction.required_secret_names)
        && edgeFunction.required_secret_names.every((name) => /^[A-Z][A-Z0-9_]+$/.test(name))
    ));
    if (!validSecretNames) missing.push('secret_name_contract');
    const hostedFunctions = new Map((hostedManifest.edge_functions || []).map((item) => [item.name, item]));
    const hostedSecretNames = new Set((hostedManifest.edge_function_environment || []).map((item) => item.name));
    for (const edgeFunction of manifest.edge_functions || []) {
        const hostedFunction = hostedFunctions.get(edgeFunction.name);
        if (!hostedFunction || hostedFunction.verify_jwt !== edgeFunction.verify_jwt) {
            missing.push(`hosted_function_contract:${edgeFunction.name}`);
        }
        const escapedName = edgeFunction.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const configPattern = new RegExp(
            `\\[functions\\.${escapedName}\\][\\s\\S]*?verify_jwt\\s*=\\s*${edgeFunction.verify_jwt}(?:\\s|$)`
        );
        if (!configPattern.test(functionConfig)) missing.push(`function_config_contract:${edgeFunction.name}`);
        for (const secretName of edgeFunction.required_secret_names || []) {
            if (!hostedSecretNames.has(secretName)) missing.push(`hosted_secret_contract:${secretName}`);
        }
    }
    if (JSON.stringify(manifest.ordered_phases) !== JSON.stringify(EXPECTED_PHASES)) {
        missing.push('ordered_phase_contract');
    }
    if (manifest.target !== 'development') missing.push('target_not_development');
    if (manifest.production_mutation_allowed !== false) missing.push('production_mutation_not_denied');

    return Object.freeze({ manifest, missing: Object.freeze(missing), valid: missing.length === 0 });
}

function buildRolloutPlan(options = {}) {
    const repoRoot = path.resolve(options.repoRoot || path.join(__dirname, '..'));
    const env = options.env || process.env;
    const inputs = inspectRolloutInputs({ ...options, repoRoot });
    const branch = options.branch ?? resolveCurrentBranch(repoRoot, options.spawn || spawnSync, env);
    const projectRef = normalizeText(env.BLOGGENIUS_DEVELOPMENT_SUPABASE_PROJECT_REF);
    const preflights = [
        evaluateDeploymentPreflight({
            target: 'development',
            operation: 'database-migrate',
            branch,
            env,
            explicitProjectRef: projectRef
        }),
        evaluateDeploymentPreflight({
            target: 'development',
            operation: 'function-deploy',
            branch,
            env,
            explicitProjectRef: projectRef
        })
    ];
    const commands = Object.freeze([
        'npm run env:development:ready',
        'supabase db push --dry-run --project-ref "$BLOGGENIUS_DEVELOPMENT_SUPABASE_PROJECT_REF"',
        'supabase db push --project-ref "$BLOGGENIUS_DEVELOPMENT_SUPABASE_PROJECT_REF"',
        ...inputs.manifest.edge_functions.map((item) => (
            `supabase functions deploy ${item.name} --project-ref "$BLOGGENIUS_DEVELOPMENT_SUPABASE_PROJECT_REF"`
        )),
        'npm run env:development:smoke'
    ]);

    return Object.freeze({
        schemaVersion: 1,
        target: 'development',
        branch,
        allowed: inputs.valid && preflights.every((item) => item.allowed),
        remoteMutationsExecuted: false,
        productionMutationAllowed: false,
        inputs,
        preflights: Object.freeze(preflights),
        commands
    });
}

function formatRolloutPlan(plan) {
    const lines = [
        'BlogGenius runtime credential Development rollout plan',
        `Decision: ${plan.allowed ? 'READY' : 'BLOCKED'}`,
        `Branch: ${plan.branch || '(unavailable)'}`,
        'Remote mutations executed: no',
        'Production mutation allowed: no',
        'Migrations:'
    ];
    for (const migration of plan.inputs.manifest.migrations) lines.push(`  - ${migration}`);
    lines.push('Edge Functions:');
    for (const edgeFunction of plan.inputs.manifest.edge_functions) {
        lines.push(`  - ${edgeFunction.name} (verify_jwt=${edgeFunction.verify_jwt})`);
        lines.push(`    required secret names: ${edgeFunction.required_secret_names.join(', ')}`);
    }
    if (plan.inputs.missing.length) lines.push(`Missing/invalid: ${plan.inputs.missing.join(', ')}`);
    for (const preflight of plan.preflights) {
        lines.push(`${preflight.allowed ? 'READY' : 'BLOCKED'} ${preflight.operation}`);
        if (preflight.reasons.length) lines.push(`  Reasons: ${preflight.reasons.join(', ')}`);
    }
    lines.push('Operator commands after merge into local dev (DB password may be prompted):');
    for (const command of plan.commands) lines.push(`  ${command}`);
    lines.push('Semantic provider smoke remains approval-gated.');
    return `${lines.join('\n')}\n`;
}

function runCli(options = {}) {
    const args = options.argv || process.argv.slice(2);
    const unknown = args.filter((arg) => arg !== '--json');
    if (unknown.length) throw new Error(`Unknown argument: ${unknown[0]}`);
    const plan = buildRolloutPlan(options);
    return {
        exitCode: plan.allowed ? 0 : 1,
        output: args.includes('--json')
            ? `${JSON.stringify(plan, null, 2)}\n`
            : formatRolloutPlan(plan),
        plan
    };
}

if (require.main === module) {
    try {
        const result = runCli({ env: loadDevelopmentEnvironment() });
        process.stdout.write(result.output);
        process.exitCode = result.exitCode;
    } catch (error) {
        process.stderr.write(`Runtime credential rollout planning failed: ${error.message}\n`);
        process.exitCode = 1;
    }
}

module.exports = {
    ROLLOUT_MANIFEST,
    EXPECTED_PHASES,
    inspectRolloutInputs,
    buildRolloutPlan,
    formatRolloutPlan,
    runCli
};
