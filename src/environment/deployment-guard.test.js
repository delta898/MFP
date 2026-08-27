'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    DEPLOYMENT_OPERATIONS,
    assertDeploymentOperation,
    evaluateDeploymentPreflight
} = require('./deployment-guard');

const DEV_ENV = Object.freeze({
    BLOGGENIUS_DEVELOPMENT_SUPABASE_PROJECT_NAME: 'BlogGenius Development',
    BLOGGENIUS_DEVELOPMENT_SUPABASE_PROJECT_REF: 'development-ref'
});
const PROD_ENV = Object.freeze({
    BLOGGENIUS_PRODUCTION_SUPABASE_PROJECT_NAME: 'BlogGenius Production',
    BLOGGENIUS_PRODUCTION_SUPABASE_PROJECT_REF: 'production-ref'
});

test('deployment operations cover database, function, cron, seed, and fixture changes', () => {
    assert.deepEqual(Object.keys(DEPLOYMENT_OPERATIONS), [
        'database-migrate',
        'database-reset',
        'database-seed',
        'fixture-load',
        'function-deploy',
        'cron-deploy'
    ]);
    assert.equal(assertDeploymentOperation(' FUNCTION-DEPLOY '), 'function-deploy');
    assert.throws(() => assertDeploymentOperation(''), /Unknown deployment operation/);
});

test('feature branch can preflight local database reset without consulting a hosted link', () => {
    const result = evaluateDeploymentPreflight({
        target: 'local',
        branch: 'feature/development-environment-03-deploy-guard',
        operation: 'database-reset',
        linkedProject: { name: 'Production', ref: 'production-ref' }
    });

    assert.equal(result.allowed, true);
    assert.equal(result.project.name, 'BlogGenius Local');
    assert.equal(result.project.ref, 'local');
    assert.equal(result.linkedProject.status, 'not_required');
});

test('feature branch cannot target hosted development even when the link matches', () => {
    const result = evaluateDeploymentPreflight({
        target: 'development',
        branch: 'feature/something',
        operation: 'function-deploy',
        env: DEV_ENV,
        linkedProject: { name: 'BlogGenius Development', ref: 'development-ref' }
    });

    assert.equal(result.allowed, false);
    assert.ok(result.reasons.includes('branch_target_denied'));
});

test('dev branch requires the hosted development project ref and name to match the current link', () => {
    const matched = evaluateDeploymentPreflight({
        target: 'development',
        branch: 'dev',
        operation: 'function-deploy',
        env: DEV_ENV,
        linkedProject: { name: 'BlogGenius Development', ref: 'development-ref' }
    });
    const mismatched = evaluateDeploymentPreflight({
        target: 'development',
        branch: 'dev',
        operation: 'function-deploy',
        env: DEV_ENV,
        linkedProject: { name: 'BlogGenius Production', ref: 'production-ref' }
    });

    assert.equal(matched.allowed, true);
    assert.equal(matched.linkedProject.status, 'matched');
    assert.equal(mismatched.allowed, false);
    assert.ok(mismatched.reasons.includes('linked_project_ref_mismatch'));
});

test('hosted target fails closed when its project identity is not configured', () => {
    const result = evaluateDeploymentPreflight({
        target: 'development',
        branch: 'dev',
        operation: 'database-migrate',
        env: {},
        linkedProject: { name: 'Anything', ref: 'anything' }
    });

    assert.equal(result.allowed, false);
    assert.ok(result.reasons.includes('target_project_not_configured'));
});

test('production migration requires release branch, matching link, and ref confirmation', () => {
    const base = {
        target: 'production',
        operation: 'database-migrate',
        env: PROD_ENV,
        linkedProject: { name: 'BlogGenius Production', ref: 'production-ref' }
    };

    const noApproval = evaluateDeploymentPreflight({ ...base, branch: 'release/v0.4.0' });
    const wrongBranch = evaluateDeploymentPreflight({
        ...base,
        branch: 'dev',
        productionApproval: 'production-ref'
    });
    const allowed = evaluateDeploymentPreflight({
        ...base,
        branch: 'release/v0.4.0',
        productionApproval: 'production-ref'
    });

    assert.equal(noApproval.allowed, false);
    assert.ok(noApproval.reasons.includes('production_approval_required'));
    assert.equal(wrongBranch.allowed, false);
    assert.ok(wrongBranch.reasons.includes('branch_target_denied'));
    assert.equal(allowed.allowed, true);
    assert.equal(allowed.productionApprovalVerified, true);
});

test('reset, seed, and fixture operations are unconditionally rejected for production', () => {
    for (const operation of ['database-reset', 'database-seed', 'fixture-load']) {
        const result = evaluateDeploymentPreflight({
            target: 'production',
            branch: 'main',
            operation,
            env: PROD_ENV,
            linkedProject: { name: 'BlogGenius Production', ref: 'production-ref' },
            productionApproval: 'production-ref'
        });
        assert.equal(result.allowed, false, operation);
        assert.ok(
            result.reasons.includes('operation_target_denied')
                || result.reasons.includes('production_operation_prohibited'),
            operation
        );
    }
});
