'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { evaluateBranchTarget, getBranchTargetPolicy } = require('./branch-target-policy');

test('feature and dev branches may use local and development, never production', () => {
    assert.equal(evaluateBranchTarget('feature/environment-01', 'local').allowed, true);
    assert.equal(evaluateBranchTarget('feature/environment-01', 'development').allowed, true);
    assert.equal(evaluateBranchTarget('feature/environment-01', 'production').allowed, false);
    assert.equal(evaluateBranchTarget('dev', 'local').allowed, true);
    assert.equal(evaluateBranchTarget('dev', 'development').allowed, true);
    assert.equal(evaluateBranchTarget('dev', 'production').allowed, false);
});

test('main and release branches are production candidates but still require approval', () => {
    for (const branch of ['main', 'release/v1.0.0']) {
        const result = evaluateBranchTarget(branch, 'production');
        assert.equal(result.allowed, true);
        assert.equal(result.productionCandidate, true);
        assert.equal(result.requiresExplicitProductionApproval, true);
    }
    assert.equal(evaluateBranchTarget('main', 'local').requiresExplicitProductionApproval, false);
});

test('unclassified branches fail closed to local-only candidates', () => {
    const policy = getBranchTargetPolicy('experiment/foo');
    assert.equal(policy.policyId, 'unclassified');
    assert.deepEqual(policy.allowedTargets, ['local']);
    assert.equal(evaluateBranchTarget('experiment/foo', 'production').allowed, false);
});
