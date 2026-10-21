const Ajv2020 = require('ajv/dist/2020');

const MAX_ACTIONS_PER_MESSAGE = 3;

const agentInputValidators = new WeakMap();
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true, validateFormats: false });

function validateAgentInput(action, capability, prefix, errors) {
    const schema = capability?.agentExposure?.inputSchema;
    if (!schema) return;

    let validate = agentInputValidators.get(capability);
    if (!validate) {
        try {
            validate = ajv.compile({
                $schema: 'https://json-schema.org/draft/2020-12/schema',
                ...schema
            });
            agentInputValidators.set(capability, validate);
        } catch (error) {
            errors.push(`${prefix}의 Agent inputSchema가 올바르지 않습니다: ${error.message}`);
            return;
        }
    }

    if (!validate(action.params)) {
        const issues = (validate.errors || []).map((item) => `${item.instancePath || '/'} ${item.message}`).join('; ');
        errors.push(`${prefix}.params가 action inputSchema와 일치하지 않습니다: ${issues}`);
    }
}

function normalizeAction(action = {}) {
    return {
        id: String(action.id || '').trim(),
        action_id: String(action.action_id || '').trim(),
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

    normalized.actions.forEach((action, index) => {
        const prefix = `actions[${index}]`;

        if (!action.action_id) errors.push(`${prefix}.action_id가 필요합니다.`);
        if (!action.id) errors.push(`${prefix}.id가 필요합니다.`);
        if (action.params === null || typeof action.params !== 'object' || Array.isArray(action.params)) {
            errors.push(`${prefix}.params는 object여야 합니다.`);
        }

        const capabilityId = action.action_id;
        const capability = capabilityRegistry?.getAgentAction
            ? capabilityRegistry.getAgentAction(capabilityId)
            : capabilityRegistry?.get ? capabilityRegistry.get(capabilityId) : null;
        if (!capability) {
            errors.push(`${prefix}가 등록되지 않은 capability를 참조합니다: ${capabilityId}`);
            return;
        }
        if (!capability.agentExposure) {
            errors.push(`${prefix}는 Agent action catalog에 등록되지 않은 capability입니다.`);
            return;
        }

        action.type = String(capability.type || '').trim();
        action.domain = String(capability.domain || '').trim();
        action.name = String(capability.name || '').trim();
        validateAgentInput(action, capability, prefix, errors);

        if (capability.confirmPolicy === 'required') {
            action.requires_confirmation = true;
        } else if (capability.confirmPolicy === 'never') {
            action.requires_confirmation = false;
        }
    });

    return {
        ok: errors.length === 0,
        errors,
        envelope: normalized
    };
}

module.exports = {
    MAX_ACTIONS_PER_MESSAGE,
    normalizeAction,
    normalizeEnvelope,
    validateActionEnvelope
};
