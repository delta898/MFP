'use strict';

const ENVIRONMENT_SCHEMA_VERSION = 1;

const ENVIRONMENTS = Object.freeze({
    LOCAL: 'local',
    DEVELOPMENT: 'development',
    PRODUCTION: 'production'
});

const ENVIRONMENT_NAMES = Object.freeze(Object.values(ENVIRONMENTS));

const BRANCH_TARGET_POLICIES = Object.freeze([
    Object.freeze({
        id: 'main',
        matches: (branch) => branch === 'main',
        allowedTargets: ENVIRONMENT_NAMES
    }),
    Object.freeze({
        id: 'release',
        matches: (branch) => branch.startsWith('release/'),
        allowedTargets: ENVIRONMENT_NAMES
    }),
    Object.freeze({
        id: 'dev',
        matches: (branch) => branch === 'dev',
        allowedTargets: Object.freeze([
            ENVIRONMENTS.LOCAL,
            ENVIRONMENTS.DEVELOPMENT
        ])
    }),
    Object.freeze({
        id: 'feature',
        matches: (branch) => branch.startsWith('feature/'),
        allowedTargets: Object.freeze([ENVIRONMENTS.LOCAL])
    })
]);

const FALLBACK_BRANCH_POLICY = Object.freeze({
    id: 'unclassified',
    allowedTargets: Object.freeze([ENVIRONMENTS.LOCAL])
});

function normalizeEnvironmentName(value) {
    return String(value || '').trim().toLowerCase();
}

function isEnvironmentName(value) {
    return ENVIRONMENT_NAMES.includes(normalizeEnvironmentName(value));
}

function assertEnvironmentName(value) {
    const normalized = normalizeEnvironmentName(value);
    if (!ENVIRONMENT_NAMES.includes(normalized)) {
        throw new Error(
            `Unknown BlogGenius environment: ${normalized || '(empty)'}. `
            + `Expected one of: ${ENVIRONMENT_NAMES.join(', ')}.`
        );
    }
    return normalized;
}

function getBranchTargetPolicy(branchName) {
    const branch = String(branchName || '').trim();
    const matched = BRANCH_TARGET_POLICIES.find((policy) => policy.matches(branch));
    const policy = matched || FALLBACK_BRANCH_POLICY;

    return Object.freeze({
        branch,
        policyId: policy.id,
        allowedTargets: Object.freeze([...policy.allowedTargets]),
        productionCandidate: policy.allowedTargets.includes(ENVIRONMENTS.PRODUCTION)
    });
}

function evaluateBranchTarget(branchName, targetEnvironment) {
    const target = assertEnvironmentName(targetEnvironment);
    const policy = getBranchTargetPolicy(branchName);
    const allowed = policy.allowedTargets.includes(target);

    return Object.freeze({
        ...policy,
        target,
        allowed,
        requiresExplicitProductionApproval: allowed && target === ENVIRONMENTS.PRODUCTION,
        reason: allowed
            ? 'branch_target_candidate_allowed'
            : 'branch_target_candidate_denied'
    });
}

module.exports = {
    ENVIRONMENT_SCHEMA_VERSION,
    ENVIRONMENTS,
    ENVIRONMENT_NAMES,
    normalizeEnvironmentName,
    isEnvironmentName,
    assertEnvironmentName,
    getBranchTargetPolicy,
    evaluateBranchTarget
};
