function normalizeString(value) {
    return String(value || '').trim();
}

function normalizeConfirmationToken(input = {}) {
    return {
        token_type: normalizeString(input.token_type || 'agent.confirmation') || 'agent.confirmation',
        confirmation_id: normalizeString(input.confirmation_id),
        channel: normalizeString(input.channel || 'telegram') || 'telegram',
        user_id: normalizeString(input.user_id),
        conversation_id: normalizeString(input.conversation_id),
        status: normalizeString(input.status || 'pending') || 'pending',
        kind: normalizeString(input.kind || 'confirmation') || 'confirmation',
        issued_at: normalizeString(input.issued_at),
        expires_at: normalizeString(input.expires_at),
        plan_id: normalizeString(input.plan_id),
        action_count: Number.isFinite(Number(input.action_count)) ? Math.max(0, Number(input.action_count)) : 0,
        superseded_confirmation_id: normalizeString(input.superseded_confirmation_id)
    };
}

function validateConfirmationToken(input = {}) {
    const token = normalizeConfirmationToken(input);
    const errors = [];

    if (token.token_type !== 'agent.confirmation') {
        errors.push(`token.token_type이 올바르지 않습니다: ${token.token_type}`);
    }
    if (!token.confirmation_id) errors.push('token.confirmation_id가 필요합니다.');
    if (!token.user_id) errors.push('token.user_id가 필요합니다.');
    if (!token.conversation_id) errors.push('token.conversation_id가 필요합니다.');

    return {
        ok: errors.length === 0,
        errors,
        token
    };
}

function buildConfirmationToken(confirmation = {}) {
    const planSteps = Array.isArray(confirmation?.plan?.steps) ? confirmation.plan.steps : [];
    const actions = Array.isArray(confirmation?.actions) ? confirmation.actions : [];

    return normalizeConfirmationToken({
        token_type: 'agent.confirmation',
        confirmation_id: normalizeString(confirmation.id),
        channel: normalizeString(confirmation.channel || 'telegram') || 'telegram',
        user_id: normalizeString(confirmation.userId),
        conversation_id: normalizeString(confirmation.conversationId),
        status: normalizeString(confirmation.status || 'pending') || 'pending',
        kind: normalizeString(confirmation.kind || 'confirmation') || 'confirmation',
        issued_at: normalizeString(confirmation.createdAt),
        expires_at: normalizeString(confirmation.expiresAt),
        plan_id: normalizeString(confirmation?.plan?.plan_id),
        action_count: planSteps.length > 0 ? planSteps.length : actions.length,
        superseded_confirmation_id: normalizeString(confirmation.supersededConfirmationId)
    });
}

function resolveConfirmationId(input = {}) {
    if (typeof input === 'string') {
        return normalizeString(input);
    }
    if (input && typeof input === 'object') {
        return normalizeString(input.confirmation_id || input.confirmationId || input.id || input.token?.confirmation_id);
    }
    return '';
}

module.exports = {
    normalizeConfirmationToken,
    validateConfirmationToken,
    buildConfirmationToken,
    resolveConfirmationId
};
