'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    ENVIRONMENTS,
    ENVIRONMENT_NAMES,
    assertEnvironmentName,
    evaluateBranchTarget,
    getBranchTargetPolicy,
    isEnvironmentName
} = require('./contract');

test('environment contract exposes only local, development, and production', () => {
    assert.deepEqual(ENVIRONMENT_NAMES, ['local', 'development', 'production']);
    assert.equal(ENVIRONMENTS.LOCAL, 'local');
    assert.equal(ENVIRONMENTS.DEVELOPMENT, 'development');
    assert.equal(ENVIRONMENTS.PRODUCTION, 'production');
});

test('environment names are strict and do not silently alias dev to development', () => {
    assert.equal(isEnvironmentName(' DEVELOPMENT '), true);
    assert.equal(assertEnvironmentName(' Production '), 'production');
    assert.equal(isEnvironmentName('dev'), false);
    assert.throws(() => assertEnvironmentName('dev'), /Unknown BlogGenius environment/);
    assert.throws(() => assertEnvironmentName(''), /\(empty\)/);
});

test('feature branches are local-only candidates', () => {
    const local = evaluateBranchTarget('feature/environment-01', 'local');
    const development = evaluateBranchTarget('feature/environment-01', 'development');
    const production = evaluateBranchTarget('feature/environment-01', 'production');

    assert.equal(local.allowed, true);
    assert.equal(development.allowed, false);
    assert.equal(production.allowed, false);
});

test('dev can target local and development but not production', () => {
    assert.equal(evaluateBranchTarget('dev', 'local').allowed, true);
    assert.equal(evaluateBranchTarget('dev', 'development').allowed, true);
    assert.equal(evaluateBranchTarget('dev', 'production').allowed, false);
});

test('main and release branches are production candidates, not automatic approvals', () => {
    for (const branch of ['main', 'release/v0.4.0']) {
        const result = evaluateBranchTarget(branch, 'production');
        assert.equal(result.allowed, true);
        assert.equal(result.productionCandidate, true);
        assert.equal(result.requiresExplicitProductionApproval, true);
    }
});

test('main local work does not claim that production approval is currently required', () => {
    const result = evaluateBranchTarget('main', 'local');
    assert.equal(result.allowed, true);
    assert.equal(result.productionCandidate, true);
    assert.equal(result.requiresExplicitProductionApproval, false);
});

test('unclassified branches fail closed to local-only candidates', () => {
    const policy = getBranchTargetPolicy('experiment/foo');
    assert.equal(policy.policyId, 'unclassified');
    assert.deepEqual(policy.allowedTargets, ['local']);
    assert.equal(evaluateBranchTarget('experiment/foo', 'production').allowed, false);
});
