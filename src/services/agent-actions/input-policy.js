'use strict';

function normalizeQuestionMap(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function getActionInputPolicy(action = {}) {
    const exposure = action.agentExposure || {};
    const declared = normalizeQuestionMap(exposure.inputPolicy);
    const required = {};
    const optional = {};
    const optionalDefinitions = {};

    for (const [field, policy] of Object.entries(declared)) {
        if (!policy || typeof policy !== 'object' || Array.isArray(policy)) continue;
        if (['required', 'conditional_required'].includes(policy.kind) && String(policy.question || '').trim()) {
            required[field] = String(policy.question).trim();
        } else if (policy.kind === 'optional' && String(policy.prompt || '').trim()) {
            optional[field] = String(policy.prompt).trim();
            optionalDefinitions[field] = { ...policy, prompt: String(policy.prompt).trim() };
        }
    }

    // Keep older action descriptors working while they are migrated to inputPolicy.
    for (const [field, question] of Object.entries(normalizeQuestionMap(exposure.requiredInputQuestions))) {
        if (!required[field] && String(question || '').trim()) required[field] = String(question).trim();
    }
    for (const [field, prompt] of Object.entries(normalizeQuestionMap(exposure.optionalInputSuggestions))) {
        if (!optional[field] && String(prompt || '').trim()) optional[field] = String(prompt).trim();
        if (!optionalDefinitions[field] && String(prompt || '').trim()) {
            optionalDefinitions[field] = { kind: 'optional', prompt: String(prompt).trim(), label: field };
        }
    }

    return { required, optional, optionalDefinitions };
}

function formatInputPolicy(policy = {}) {
    const parts = [];
    const required = normalizeQuestionMap(policy.required);
    const optional = normalizeQuestionMap(policy.optional);
    if (Object.keys(required).length > 0) parts.push(`필수 정보 질문=${JSON.stringify(required)}`);
    if (Object.keys(optional).length > 0) {
        parts.push(`사용자가 선택 항목을 지정했지만 값이 불명확하면 먼저 물어보고, 언급하지 않은 항목은 action 기본값을 사용합니다. 선택 정보=${JSON.stringify(optional)}`);
    }
    return parts.join('; ');
}

module.exports = { getActionInputPolicy, formatInputPolicy };
