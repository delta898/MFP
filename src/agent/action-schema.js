const MAX_ACTIONS_PER_MESSAGE = 3;

const ALLOWED_ACTION_TYPES = new Set([
    'agent.query',
    'agent.command',
    'setting.query',
    'setting.update',
    'job.run',
    'content.register',
    'content.publish',
    'content.generate'
]);

function buildCapabilityId(domain, name) {
    return `${String(domain || '').trim()}.${String(name || '').trim()}`;
}

function normalizeAction(action = {}) {
    return {
        id: String(action.id || '').trim(),
        type: String(action.type || '').trim(),
        domain: String(action.domain || '').trim(),
        name: String(action.name || '').trim(),
        params: (action.params && typeof action.params === 'object' && !Array.isArray(action.params)) ? action.params : {},
        requires_confirmation: action.requires_confirmation === true,
        reason: String(action.reason || '').trim()
    };
}

function normalizeEnvelope(envelope = {}) {
    return {
        version: String(envelope.version || '1.0').trim() || '1.0',
        conversation_id: String(envelope.conversation_id || '').trim(),
        message_id: String(envelope.message_id || '').trim(),
        actions: Array.isArray(envelope.actions) ? envelope.actions.map(normalizeAction) : []
    };
}

function validateActionEnvelope(envelope = {}, capabilityRegistry) {
    const normalized = normalizeEnvelope(envelope);
    const errors = [];

    if (!Array.isArray(normalized.actions) || normalized.actions.length === 0) {
        errors.push('actions는 최소 1개 이상이어야 합니다.');
    }

    if (normalized.actions.length > MAX_ACTIONS_PER_MESSAGE) {
        errors.push(`actions는 최대 ${MAX_ACTIONS_PER_MESSAGE}개까지 허용됩니다.`);
    }

    const distinctDomains = new Set();

    normalized.actions.forEach((action, index) => {
        const prefix = `actions[${index}]`;

        if (!action.type || !ALLOWED_ACTION_TYPES.has(action.type)) {
            errors.push(`${prefix}.type이 허용되지 않습니다.`);
        }
        if (!action.domain) errors.push(`${prefix}.domain이 필요합니다.`);
        if (!action.name) errors.push(`${prefix}.name이 필요합니다.`);
        if (!action.id) errors.push(`${prefix}.id가 필요합니다.`);
        if (action.params === null || typeof action.params !== 'object' || Array.isArray(action.params)) {
            errors.push(`${prefix}.params는 object여야 합니다.`);
        }

        if (action.domain) distinctDomains.add(action.domain);

        const capabilityId = buildCapabilityId(action.domain, action.name);
        const capability = capabilityRegistry?.get ? capabilityRegistry.get(capabilityId) : null;
        if (!capability) {
            errors.push(`${prefix}가 등록되지 않은 capability를 참조합니다: ${capabilityId}`);
            return;
        }

        if (capability.type && capability.type !== action.type) {
            errors.push(`${prefix}.type이 capability 정의와 일치하지 않습니다.`);
        }

        if (capability.confirmPolicy === 'required') {
            action.requires_confirmation = true;
        } else if (capability.confirmPolicy === 'never') {
            action.requires_confirmation = false;
        }
    });

    if (distinctDomains.size > 3) {
        errors.push('한 요청에서 3개를 초과하는 서로 다른 domain을 동시에 사용할 수 없습니다.');
    }

    return {
        ok: errors.length === 0,
        errors,
        envelope: normalized
    };
}

module.exports = {
    MAX_ACTIONS_PER_MESSAGE,
    ALLOWED_ACTION_TYPES,
    buildCapabilityId,
    normalizeAction,
    normalizeEnvelope,
    validateActionEnvelope
};
