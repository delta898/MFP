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

function buildSingleActionPlan(envelope = {}) {
    const actions = Array.isArray(envelope.actions) ? envelope.actions : [];
    const primaryAction = actions[0] || {};
    const primaryReason = primaryAction.reason || `${primaryAction.domain || 'agent'}.${primaryAction.name || 'action'}`;

    return normalizePlan({
        plan_id: `plan_${envelope.message_id || Date.now()}`,
        goal: primaryReason,
        reason: primaryReason,
        confirmation_mode: actions.some((action) => action.requires_confirmation === true) ? 'plan' : 'none',
        conversation_id: String(envelope.conversation_id || '').trim(),
        message_id: String(envelope.message_id || '').trim(),
        steps: actions.map((action, index) => ({
            id: `step_${index + 1}`,
            action,
            preconditions: [],
            requires_confirmation: action.requires_confirmation === true
        }))
    });
}

module.exports = {
    normalizePlanStep,
    normalizePlan,
    validatePlan,
    buildSingleActionPlan
};
