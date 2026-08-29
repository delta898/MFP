#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { loadDevelopmentEnvironment } = require('./project-environment');

const DEFAULT_MANIFEST_PATH = 'supabase/hosted-development-manifest.json';

function normalizeText(value) {
    return String(value || '').trim();
}

function loadManifest(repoRoot, fsImpl = fs) {
    return JSON.parse(fsImpl.readFileSync(path.join(repoRoot, DEFAULT_MANIFEST_PATH), 'utf8'));
}

function inspectHostedDevelopmentReadiness(options = {}) {
    const repoRoot = path.resolve(options.repoRoot || path.join(__dirname, '..'));
    const env = options.env || process.env;
    const manifest = options.manifest || loadManifest(repoRoot, options.fs || fs);
    const requiredSources = manifest.connection.required_sources || [];
    const missingSources = requiredSources.filter((source) => !normalizeText(env[source]));
    const environment = normalizeText(env.BLOGGENIUS_ENV).toLowerCase();
    const developmentUrl = normalizeText(env[manifest.project.url_source]).replace(/\/+$/, '');
    const productionUrl = normalizeText(env[manifest.project.production_url_source]).replace(/\/+$/, '');
    const policyViolations = [];

    if (environment && environment !== 'development') {
        policyViolations.push('environment_must_be_development');
    }
    if (developmentUrl && !/^https:\/\//i.test(developmentUrl)) {
        policyViolations.push('development_supabase_url_must_use_https');
    }
    if (developmentUrl && productionUrl && developmentUrl === productionUrl) {
        policyViolations.push('development_supabase_url_matches_production');
    }
    if (manifest.safety.manual_publish !== true) policyViolations.push('manual_publish_must_be_enabled');
    if (manifest.safety.automated_publish !== false) policyViolations.push('automated_publish_must_be_disabled');
    if (manifest.safety.live_publish !== false) policyViolations.push('live_publish_alias_must_be_disabled');
    if (manifest.safety.live_payment !== false) policyViolations.push('live_payment_must_be_disabled');
    if (manifest.safety.cron_activation !== false) policyViolations.push('cron_must_start_disabled');

    return Object.freeze({
        schemaVersion: 2,
        target: manifest.target,
        ready: missingSources.length === 0 && policyViolations.length === 0,
        project: Object.freeze({
            configured: missingSources.length === 0,
            missingSources: Object.freeze(missingSources),
            url: developmentUrl
        }),
        edgeFunctionEnvironment: Object.freeze({
            provisioningOwner: 'supabase_environment_provider',
            requiredNames: Object.freeze(manifest.edge_function_environment
                .filter((item) => item.required_for_core)
                .map((item) => item.name)),
            optionalNames: Object.freeze(manifest.edge_function_environment
                .filter((item) => !item.required_for_core)
                .map((item) => item.name))
        }),
        safety: Object.freeze({
            notificationModes: Object.freeze([...manifest.safety.notification_modes]),
            defaultNotificationMode: manifest.safety.default_notification_mode,
            manualPublish: manifest.safety.manual_publish,
            automatedPublish: manifest.safety.automated_publish,
            livePublish: manifest.safety.live_publish,
            livePayment: manifest.safety.live_payment,
            cronActivation: manifest.safety.cron_activation,
            paidProviderSmokeTest: manifest.safety.paid_provider_smoke_test
        }),
        policyViolations: Object.freeze(policyViolations)
    });
}

function formatReadiness(result) {
    const lines = [
        'BlogGenius development Supabase readiness',
        `Decision: ${result.ready ? 'READY' : 'NOT READY'}`,
        `Target: ${result.target}`,
        `Project config: ${result.project.configured ? 'configured' : 'missing'}`,
        `Supabase URL: ${result.project.url || '(not configured)'}`,
        'Edge Function configuration owner: Supabase environment provider',
        `Required Edge Function settings declared: ${result.edgeFunctionEnvironment.requiredNames.length}`,
        `Notifications: ${result.safety.defaultNotificationMode} by default`,
        `Manual publish: ${result.safety.manualPublish ? 'enabled' : 'blocked'}`,
        `Automated publish: ${result.safety.automatedPublish ? 'enabled' : 'blocked'}`,
        `Live payment: ${result.safety.livePayment ? 'enabled' : 'blocked'}`,
        `Cron activation: ${result.safety.cronActivation ? 'enabled' : 'deferred'}`,
        `Paid provider smoke test: ${result.safety.paidProviderSmokeTest ? 'enabled' : 'blocked'}`
    ];
    if (result.project.missingSources.length) {
        lines.push(`Missing connection sources: ${result.project.missingSources.join(', ')}`);
    }
    if (result.policyViolations.length) {
        lines.push(`Policy violations: ${result.policyViolations.join(', ')}`);
    }
    lines.push('BlogGenius does not inspect or mutate provider-managed secrets.');
    return `${lines.join('\n')}\n`;
}

function runCli(options = {}) {
    const args = options.argv || process.argv.slice(2);
    const unknown = args.filter((arg) => arg !== '--json');
    if (unknown.length) throw new Error(`Unknown argument: ${unknown[0]}`);
    const result = inspectHostedDevelopmentReadiness(options);
    return Object.freeze({
        exitCode: result.ready ? 0 : 1,
        output: args.includes('--json')
            ? `${JSON.stringify(result, null, 2)}\n`
            : formatReadiness(result),
        result
    });
}

if (require.main === module) {
    try {
        const outcome = runCli({ env: loadDevelopmentEnvironment() });
        process.stdout.write(outcome.output);
        process.exitCode = outcome.exitCode;
    } catch (error) {
        process.stderr.write(`Development Supabase readiness failed: ${error.message}\n`);
        process.exitCode = 1;
    }
}

module.exports = {
    DEFAULT_MANIFEST_PATH,
    loadManifest,
    inspectHostedDevelopmentReadiness,
    formatReadiness,
    runCli
};
