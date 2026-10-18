const { normalizePlan } = require('./planner-contract');

function buildActionFingerprint(action = {}) {
    return JSON.stringify({
        type: String(action.type || '').trim(),
        domain: String(action.domain || '').trim(),
        name: String(action.name || '').trim(),
        params: action.params && typeof action.params === 'object' ? action.params : {}
    });
}

function dedupeActions(actions = []) {
    const seen = new Set();
    const deduped = [];

    for (const action of Array.isArray(actions) ? actions : []) {
        const fingerprint = buildActionFingerprint(action);
        if (seen.has(fingerprint)) continue;
        seen.add(fingerprint);
        deduped.push(action);
    }

    return deduped;
}

function getActionPriority(action = {}) {
    const type = String(action.type || '').trim();
    switch (type) {
        case 'agent.query':
            return 10;
        case 'setting.query':
            return 20;
        case 'setting.update':
            return 30;
        case 'job.run':
            return 40;
        case 'content.register':
            return 50;
        case 'content.generate':
            return 60;
        case 'content.publish':
            return 70;
        default:
            return 999;
    }
}

function orderActions(actions = []) {
    return [...(Array.isArray(actions) ? actions : [])]
        .sort((left, right) => getActionPriority(left) - getActionPriority(right));
}

function resolveConfirmationMode(actions = []) {
    return (Array.isArray(actions) ? actions : []).some((action) => action.requires_confirmation === true)
        ? 'plan'
        : 'none';
}

function buildGoal(actions = []) {
    const normalizedActions = Array.isArray(actions) ? actions : [];
    const primary = normalizedActions.find((action) => String(action.type || '').trim() !== 'setting.query')
        || normalizedActions[0]
        || {};
    return String(primary.reason || `${primary.domain || 'agent'}.${primary.name || 'action'}`).trim();
}

function buildPreconditions(action = {}, envelope = {}) {
    const preconditions = [];
    const domain = String(action.domain || '').trim();
    const name = String(action.name || '').trim();

    if (domain === 'content.idea' && name === 'suggest') {
        const routing = envelope.routing && typeof envelope.routing === 'object' ? envelope.routing : {};
        const contentIdeaProviders = Array.isArray(routing.content_ideas) ? routing.content_ideas : [];
        if (contentIdeaProviders.length > 0) {
            preconditions.push({
                type: 'knowledge_provider_available',
                route: 'content_ideas',
                provider_ids: contentIdeaProviders
            });
        }
    }

    if (domain === 'agent.recommendations' && name === 'get') {
        const routing = envelope.routing && typeof envelope.routing === 'object' ? envelope.routing : {};
        const recommendationProviders = Array.isArray(routing.recommendations) ? routing.recommendations : [];
        if (recommendationProviders.length > 0) {
            preconditions.push({
                type: 'knowledge_provider_available',
                route: 'recommendations',
                provider_ids: recommendationProviders
            });
        }
    }

    return preconditions;
}

function findSupersededConfirmationId(actions = [], envelope = {}) {
    const pendingConfirmations = Array.isArray(envelope.pending_confirmations) ? envelope.pending_confirmations : [];
    if (pendingConfirmations.length === 0) return '';

    const updateDomains = new Set(
        (Array.isArray(actions) ? actions : [])
            .filter((action) => String(action.type || '').trim() === 'setting.update')
            .map((action) => String(action.domain || '').trim())
            .filter(Boolean)
    );
    if (updateDomains.size === 0) return '';

    const latestSameDomain = [...pendingConfirmations].reverse().find((item) => {
        const planSteps = Array.isArray(item?.plan?.steps) ? item.plan.steps : [];
        return planSteps.some((step) => {
            const action = step?.action || {};
            return String(action.type || '').trim() === 'setting.update'
                && updateDomains.has(String(action.domain || '').trim());
        });
    });

    return String(latestSameDomain?.id || '').trim();
}

function buildPlanFromActions(envelope = {}) {
    const deduped = dedupeActions(envelope.actions || []);
    const ordered = orderActions(deduped);
    const goal = buildGoal(ordered);
    const supersedesConfirmationId = findSupersededConfirmationId(ordered, envelope);

    return normalizePlan({
        plan_id: `plan_${envelope.message_id || Date.now()}`,
        goal,
        reason: goal,
        confirmation_mode: resolveConfirmationMode(ordered),
        conversation_id: String(envelope.conversation_id || '').trim(),
        message_id: String(envelope.message_id || '').trim(),
        supersedes_confirmation_id: supersedesConfirmationId,
        steps: ordered.map((action, index) => ({
            id: `step_${index + 1}`,
            action,
            preconditions: buildPreconditions(action, envelope),
            requires_confirmation: action.requires_confirmation === true
        }))
    });
}

module.exports = {
    buildActionFingerprint,
    dedupeActions,
    orderActions,
    resolveConfirmationMode,
    buildGoal,
    buildPreconditions,
    findSupersededConfirmationId,
    buildPlanFromActions
};
