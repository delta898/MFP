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
    const first = (Array.isArray(actions) ? actions : [])[0] || {};
    return String(first.reason || `${first.domain || 'agent'}.${first.name || 'action'}`).trim();
}

function buildPreconditions(action = {}, envelope = {}) {
    const preconditions = [];
    const domain = String(action.domain || '').trim();
    const name = String(action.name || '').trim();
    const params = action.params && typeof action.params === 'object' ? action.params : {};

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

    if (domain === 'agent.suggestions' && name === 'get') {
        const routing = envelope.routing && typeof envelope.routing === 'object' ? envelope.routing : {};
        const suggestionProviders = Array.isArray(routing.suggestions) ? routing.suggestions : [];
        if (suggestionProviders.length > 0) {
            preconditions.push({
                type: 'knowledge_provider_available',
                route: 'suggestions',
                provider_ids: suggestionProviders
            });
        }
    }

    if (domain === 'settings.trends' && (name === 'add_category' || name === 'remove_category')) {
        preconditions.push({
            type: 'trend_category_catalog_available',
            category: String(params.category || '').trim()
        });
    }

    return preconditions;
}

function buildPlanFromActions(envelope = {}) {
    const deduped = dedupeActions(envelope.actions || []);
    const ordered = orderActions(deduped);
    const goal = buildGoal(ordered);

    return normalizePlan({
        plan_id: `plan_${envelope.message_id || Date.now()}`,
        goal,
        reason: goal,
        confirmation_mode: resolveConfirmationMode(ordered),
        conversation_id: String(envelope.conversation_id || '').trim(),
        message_id: String(envelope.message_id || '').trim(),
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
    buildPlanFromActions
};
