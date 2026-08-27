'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    parseArgs,
    resolveCurrentBranch,
    formatPreflightText,
    runCli
} = require('./environment-preflight');

test('preflight CLI requires an explicit target and operation', () => {
    assert.throws(() => parseArgs(['check']), /--target is required/);
    assert.throws(
        () => parseArgs(['check', '--target', 'local']),
        /--operation is required/
    );
    assert.throws(
        () => parseArgs(['check', '--target', 'local', '--operation', 'database-reset', '--wat']),
        /Unknown argument/
    );
});

test('branch resolution uses trusted GitHub branch metadata only for detached checkouts', () => {
    const detached = () => ({ status: 0, stdout: '', stderr: '' });
    assert.equal(
        resolveCurrentBranch('/repo', detached, {
            GITHUB_REF_TYPE: 'branch',
            GITHUB_REF_NAME: 'dev'
        }),
        'dev'
    );
    assert.equal(
        resolveCurrentBranch('/repo', detached, {
            GITHUB_REF_TYPE: 'tag',
            GITHUB_REF_NAME: 'v0.4.0'
        }),
        ''
    );
});

test('local dry-run preflight prints the safe operation context', () => {
    const outcome = runCli({
        argv: ['check', '--target', 'local', '--operation', 'database-reset'],
        branch: 'feature/environment',
        env: {},
        linkedProject: { name: 'Production project', ref: 'production-ref' }
    });

    assert.equal(outcome.exitCode, 0);
    assert.match(outcome.output, /Decision: ALLOWED/);
    assert.match(outcome.output, /Target: local/);
    assert.match(outcome.output, /Project: BlogGenius Local/);
    assert.match(outcome.output, /Mode: dry-run preflight/);
    assert.doesNotMatch(outcome.output, /secret|publishable/i);
});

test('denied preflight exits nonzero and explains every failed gate', () => {
    const outcome = runCli({
        argv: ['check', '--target', 'production', '--operation', 'database-migrate'],
        branch: 'dev',
        env: {
            BLOGGENIUS_PRODUCTION_SUPABASE_PROJECT_NAME: 'Production project',
            BLOGGENIUS_PRODUCTION_SUPABASE_PROJECT_REF: 'production-ref'
        },
        linkedProject: { name: 'Development project', ref: 'development-ref' }
    });

    assert.equal(outcome.exitCode, 1);
    assert.match(outcome.output, /Decision: DENIED/);
    assert.match(outcome.output, /branch_target_denied/);
    assert.match(outcome.output, /linked_project_ref_mismatch/);
    assert.match(outcome.output, /production_approval_required/);
});

test('JSON output contains safe preflight fields and no environment object', () => {
    const outcome = runCli({
        argv: ['check', '--target', 'development', '--operation', 'cron-deploy', '--json'],
        branch: 'dev',
        env: {
            BLOGGENIUS_DEVELOPMENT_SUPABASE_PROJECT_NAME: 'Development project',
            BLOGGENIUS_DEVELOPMENT_SUPABASE_PROJECT_REF: 'development-ref',
            SOME_SECRET: 'must-not-appear'
        },
        linkedProject: { name: 'Development project', ref: 'development-ref' }
    });
    const parsed = JSON.parse(outcome.output);

    assert.equal(outcome.exitCode, 0);
    assert.equal(parsed.allowed, true);
    assert.equal(parsed.operation, 'cron-deploy');
    assert.equal(outcome.output.includes('must-not-appear'), false);
    assert.equal(Object.hasOwn(parsed, 'env'), false);
});

test('text formatter never prints a supplied production approval token', () => {
    const outcome = runCli({
        argv: [
            'check', '--target', 'production', '--operation', 'function-deploy',
            '--approve-production', 'production-ref'
        ],
        branch: 'main',
        env: {
            BLOGGENIUS_PRODUCTION_SUPABASE_PROJECT_NAME: 'Production project',
            BLOGGENIUS_PRODUCTION_SUPABASE_PROJECT_REF: 'production-ref'
        },
        linkedProject: { name: 'Production project', ref: 'production-ref' }
    });

    assert.equal(outcome.exitCode, 0);
    assert.match(formatPreflightText(outcome.result), /Production approval: verified/);
    assert.equal(formatPreflightText(outcome.result).includes('--approve-production'), false);
});
