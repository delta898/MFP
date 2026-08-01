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

function buildPreflightQueryAction(action = {}) {
    const domain = String(action.domain || '').trim();
    const name = String(action.name || '').trim();

    if (domain === 'settings.trends' && name === 'set_time') {
        return {
            id: `${action.id}_precheck`,
            type: 'setting.query',
            domain,
            name: 'get_time',
            params: {},
            requires_confirmation: false,
            reason: '현재 트렌드 수집 시간을 먼저 조회'
        };
    }

    if (domain === 'settings.trends' && (name === 'add_category' || name === 'remove_category')) {
        return {
            id: `${action.id}_precheck`,
            type: 'setting.query',
            domain,
            name: 'get_categories',
            params: {},
            requires_confirmation: false,
            reason: '현재 트렌드 수집 카테고리를 먼저 조회'
        };
    }

    if (domain === 'settings.blog_auto' && name === 'set_enabled') {
        return {
            id: `${action.id}_precheck`,
            type: 'setting.query',
            domain,
            name: 'get_enabled',
            params: {},
            requires_confirmation: false,
            reason: '현재 블로그 자동 포스팅 활성화 상태를 먼저 조회'
        };
    }

    if (domain === 'settings.blog_auto' && name === 'set_time_window') {
        return {
            id: `${action.id}_precheck`,
            type: 'setting.query',
            domain,
            name: 'get_time_window',
            params: {},
            requires_confirmation: false,
            reason: '현재 블로그 자동 포스팅 허용 시간대를 먼저 조회'
        };
    }

    return null;
}

function expandActions(actions = []) {
    const expanded = [];
    const existingFingerprints = new Set((Array.isArray(actions) ? actions : []).map(buildActionFingerprint));

    for (const action of Array.isArray(actions) ? actions : []) {
        if (String(action.type || '').trim() === 'setting.update') {
            const preflight = buildPreflightQueryAction(action);
            if (preflight) {
                const fingerprint = buildActionFingerprint(preflight);
                if (!existingFingerprints.has(fingerprint)) {
                    expanded.push(preflight);
                    existingFingerprints.add(fingerprint);
                }
            }
        }
        expanded.push(action);
    }

    return expanded;
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
    const expanded = expandActions(envelope.actions || []);
    const deduped = dedupeActions(expanded);
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
    buildPreflightQueryAction,
    expandActions,
    dedupeActions,
    orderActions,
    resolveConfirmationMode,
    buildGoal,
    buildPreconditions,
    findSupersededConfirmationId,
    buildPlanFromActions
};
