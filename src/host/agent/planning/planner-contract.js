function normalizePlanStep(step = {}) {
    const action = step.action && typeof step.action === 'object' ? step.action : null;
    return {
        id: String(step.id || '').trim(),
        action,
        preconditions: Array.isArray(step.preconditions) ? step.preconditions : [],
        requires_confirmation: step.requires_confirmation === true
    };
}

function normalizePlan(input = {}) {
    return {
        plan_id: String(input.plan_id || '').trim(),
        goal: String(input.goal || '').trim(),
        reason: String(input.reason || '').trim(),
        confirmation_mode: String(input.confirmation_mode || 'none').trim() || 'none',
        conversation_id: String(input.conversation_id || '').trim(),
        message_id: String(input.message_id || '').trim(),
        supersedes_confirmation_id: String(input.supersedes_confirmation_id || '').trim(),
        steps: Array.isArray(input.steps) ? input.steps.map(normalizePlanStep) : []
    };
}

function validatePlan(plan = {}) {
    const normalized = normalizePlan(plan);
    const errors = [];

    if (!normalized.plan_id) errors.push('plan.plan_id가 필요합니다.');
    if (!Array.isArray(normalized.steps) || normalized.steps.length === 0) {
        errors.push('plan.steps는 최소 1개 이상이어야 합니다.');
    }

    normalized.steps.forEach((step, index) => {
        const prefix = `steps[${index}]`;
        if (!step.id) errors.push(`${prefix}.id가 필요합니다.`);
        if (!step.action || typeof step.action !== 'object') {
            errors.push(`${prefix}.action이 필요합니다.`);
        }
    });

    return {
        ok: errors.length === 0,
        errors,
        plan: normalized
    };
}

module.exports = {
    normalizePlanStep,
    normalizePlan,
    validatePlan
};
