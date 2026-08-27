#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { evaluateDeploymentPreflight } = require('../src/environment/deployment-guard');
const { resolveCurrentBranch } = require('./environment-preflight');
const {
    loadManifest,
    inspectHostedDevelopmentReadiness
} = require('./hosted-development-readiness');
const { loadProjectEnvironment } = require('./project-environment');

const HANDOFF_STEPS = Object.freeze([
    Object.freeze({ name: 'migrations', operation: 'database-migrate' }),
    Object.freeze({ name: 'seed', operation: 'database-seed' }),
    Object.freeze({ name: 'functions', operation: 'function-deploy' })
]);

function normalizeText(value) {
    return String(value || '').trim();
}

function buildPlan(options = {}) {
    const repoRoot = path.resolve(options.repoRoot || path.join(__dirname, '..'));
    const env = options.env || process.env;
    const manifest = options.manifest || loadManifest(repoRoot, options.fs);
    const readiness = inspectHostedDevelopmentReadiness({ repoRoot, env, manifest });
    const branch = options.branch ?? resolveCurrentBranch(
        repoRoot,
        options.spawn || spawnSync,
        env
    );
    const endpoint = normalizeText(env[manifest.project.url_source]).replace(/\/+$/, '');
    const steps = HANDOFF_STEPS.map((step) => Object.freeze({
        ...step,
        preflight: evaluateDeploymentPreflight({
            target: 'development',
            operation: step.operation,
            branch,
            env,
            explicitSupabaseUrl: endpoint
        })
    }));

    return Object.freeze({
        schemaVersion: 1,
        target: 'development',
        executionOwner: 'supabase_environment_provider',
        branch,
        endpoint,
        readiness,
        allowed: readiness.ready && steps.every((step) => step.preflight.allowed),
        artifacts: Object.freeze({
            migrations: manifest.database.migration_directory,
            seed: manifest.database.seed_file,
            functions: 'supabase/functions',
            manifest: 'supabase/hosted-development-manifest.json'
        }),
        steps: Object.freeze(steps)
    });
}

function formatPlan(plan) {
    const lines = [
        'BlogGenius development Supabase handoff plan',
        `Decision: ${plan.allowed ? 'READY' : 'BLOCKED'}`,
        `Branch: ${plan.branch || '(unavailable)'}`,
        `Supabase URL: ${plan.endpoint || '(not configured)'}`,
        'Execution owner: Supabase environment provider',
        'BlogGenius remote mutations: none'
    ];
    for (const step of plan.steps) {
        lines.push(`${step.preflight.allowed ? 'READY' : 'BLOCKED'} ${step.name} (${step.operation})`);
        if (step.preflight.reasons.length) {
            lines.push(`  Reasons: ${step.preflight.reasons.join(', ')}`);
        }
    }
    lines.push('Artifacts:');
    for (const [name, artifactPath] of Object.entries(plan.artifacts)) {
        lines.push(`  ${name}: ${artifactPath}`);
    }
    lines.push('Secrets and infrastructure lifecycle are owned by the Supabase environment provider.');
    return `${lines.join('\n')}\n`;
}

function runCli(options = {}) {
    const args = options.argv || process.argv.slice(2);
    const unknown = args.filter((arg) => arg !== '--json');
    if (unknown.length) throw new Error(`Unknown argument: ${unknown[0]}`);
    const plan = buildPlan(options);
    return Object.freeze({
        exitCode: plan.allowed ? 0 : 1,
        output: args.includes('--json')
            ? `${JSON.stringify(plan, null, 2)}\n`
            : formatPlan(plan),
        plan
    });
}

if (require.main === module) {
    try {
        const outcome = runCli({ env: loadProjectEnvironment() });
        process.stdout.write(outcome.output);
        process.exitCode = outcome.exitCode;
    } catch (error) {
        process.stderr.write(`Development Supabase handoff planning failed: ${error.message}\n`);
        process.exitCode = 1;
    }
}

module.exports = {
    HANDOFF_STEPS,
    buildPlan,
    formatPlan,
    runCli
};
