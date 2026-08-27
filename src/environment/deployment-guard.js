'use strict';

const manifest = require('./manifest');
const {
    ENVIRONMENTS,
    ENVIRONMENT_NAMES,
    assertEnvironmentName,
    evaluateBranchTarget
} = require('./contract');

const DEPLOYMENT_OPERATIONS = Object.freeze({
    'database-migrate': Object.freeze({
        surface: 'database',
        allowedTargets: ENVIRONMENT_NAMES,
        destructiveDatabaseOperation: false,
        productionProhibited: false
    }),
    'database-reset': Object.freeze({
        surface: 'database',
        allowedTargets: Object.freeze([ENVIRONMENTS.LOCAL]),
        destructiveDatabaseOperation: true,
        productionProhibited: true
    }),
    'database-seed': Object.freeze({
        surface: 'database',
        allowedTargets: Object.freeze([ENVIRONMENTS.LOCAL, ENVIRONMENTS.DEVELOPMENT]),
        destructiveDatabaseOperation: false,
        productionProhibited: true
    }),
    'fixture-load': Object.freeze({
        surface: 'test_data',
        allowedTargets: Object.freeze([ENVIRONMENTS.LOCAL, ENVIRONMENTS.DEVELOPMENT]),
        destructiveDatabaseOperation: false,
        productionProhibited: true
    }),
    'function-deploy': Object.freeze({
        surface: 'edge_functions',
        allowedTargets: Object.freeze([ENVIRONMENTS.DEVELOPMENT, ENVIRONMENTS.PRODUCTION]),
        destructiveDatabaseOperation: false,
        productionProhibited: false
    }),
    'cron-deploy': Object.freeze({
        surface: 'cron',
        allowedTargets: Object.freeze([ENVIRONMENTS.DEVELOPMENT, ENVIRONMENTS.PRODUCTION]),
        destructiveDatabaseOperation: false,
        productionProhibited: false
    })
});

function normalizeText(value) {
    return String(value || '').trim();
}

function assertDeploymentOperation(value) {
    const operation = normalizeText(value).toLowerCase();
    if (!Object.hasOwn(DEPLOYMENT_OPERATIONS, operation)) {
        throw new Error(
            `Unknown deployment operation: ${operation || '(empty)'}. `
            + `Expected one of: ${Object.keys(DEPLOYMENT_OPERATIONS).join(', ')}.`
        );
    }
    return operation;
}

function resolveTargetProject(targetEnvironment, env = process.env, environmentManifest = manifest) {
    const target = assertEnvironmentName(targetEnvironment);
    const profile = environmentManifest?.profiles?.[target];
    if (!profile) {
        return Object.freeze({ target, name: '', ref: '', configured: false });
    }

    const name = normalizeText(profile.project_name)
        || normalizeText(env[profile.project_name_source]);
    const ref = normalizeText(profile.project_ref)
        || normalizeText(env[profile.project_ref_source]);

    return Object.freeze({
        target,
        name,
        ref,
        configured: Boolean(name && ref)
    });
}

function evaluateDeploymentPreflight(options = {}) {
    const target = assertEnvironmentName(options.target);
    const operation = assertDeploymentOperation(options.operation);
    const descriptor = DEPLOYMENT_OPERATIONS[operation];
    const environmentManifest = options.manifest || manifest;
    const profile = environmentManifest?.profiles?.[target] || {};
    const branchEvaluation = evaluateBranchTarget(options.branch, target);
    const project = resolveTargetProject(target, options.env || {}, environmentManifest);
    const linkedProject = options.linkedProject || null;
    const reasons = [];

    if (!branchEvaluation.allowed) reasons.push('branch_target_denied');
    if (!descriptor.allowedTargets.includes(target)) reasons.push('operation_target_denied');
    if (!project.configured) reasons.push('target_project_not_configured');

    if (descriptor.destructiveDatabaseOperation
        && profile.allows_destructive_database_operations !== true) {
        reasons.push('destructive_database_operation_denied');
    }
    if (target === ENVIRONMENTS.PRODUCTION && descriptor.productionProhibited) {
        reasons.push('production_operation_prohibited');
    }

    let linkedProjectStatus = 'not_required';
    if (target !== ENVIRONMENTS.LOCAL) {
        linkedProjectStatus = 'missing';
        if (!linkedProject) {
            reasons.push('linked_project_missing');
        } else {
            const linkedRef = normalizeText(linkedProject.ref);
            const linkedName = normalizeText(linkedProject.name);
            if (!linkedRef || linkedRef !== project.ref) {
                linkedProjectStatus = 'ref_mismatch';
                reasons.push('linked_project_ref_mismatch');
            } else if (linkedName && project.name && linkedName !== project.name) {
                linkedProjectStatus = 'name_mismatch';
                reasons.push('linked_project_name_mismatch');
            } else {
                linkedProjectStatus = 'matched';
            }
        }
    }

    const productionApprovalRequired = target === ENVIRONMENTS.PRODUCTION;
    const productionApprovalVerified = productionApprovalRequired
        ? Boolean(project.ref && normalizeText(options.productionApproval) === project.ref)
        : false;
    if (productionApprovalRequired && !productionApprovalVerified) {
        reasons.push('production_approval_required');
    }

    return Object.freeze({
        schemaVersion: 1,
        allowed: reasons.length === 0,
        target,
        branch: normalizeText(options.branch),
        branchPolicy: branchEvaluation.policyId,
        operation,
        surface: descriptor.surface,
        project,
        linkedProject: Object.freeze({
            status: linkedProjectStatus,
            name: normalizeText(linkedProject?.name),
            ref: normalizeText(linkedProject?.ref)
        }),
        productionApprovalRequired,
        productionApprovalVerified,
        reasons: Object.freeze(reasons)
    });
}

module.exports = {
    DEPLOYMENT_OPERATIONS,
    assertDeploymentOperation,
    resolveTargetProject,
    evaluateDeploymentPreflight
};
