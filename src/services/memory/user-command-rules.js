'use strict';

function normalizeTrigger(value) {
    return String(value || '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ko-KR');
}

function normalizeUserCommandRule(input = {}) {
    const trigger = String(input.trigger || '').normalize('NFKC').trim().replace(/\s+/g, ' ');
    const normalizedTrigger = normalizeTrigger(trigger);
    const actionId = String(input.action_id || '').trim();
    const params = input.action_params ?? input.params ?? {};
    if (trigger.length < 2 || trigger.length > 80 || /[\u0000-\u001f\u007f]/u.test(trigger)) {
        throw Object.assign(new Error('규칙을 실행할 짧은 문구를 2~80자 사이로 입력해 주세요.'), { code: 'USER_RULE_TRIGGER_INVALID' });
    }
    if (!normalizedTrigger) throw Object.assign(new Error('실행 문구가 필요합니다.'), { code: 'USER_RULE_TRIGGER_INVALID' });
    if (!actionId) throw Object.assign(new Error('연결할 Agent 기능을 확인해 주세요.'), { code: 'USER_RULE_ACTION_INVALID' });
    if (!params || typeof params !== 'object' || Array.isArray(params)) {
        throw Object.assign(new Error('기능에 전달할 값은 객체여야 합니다.'), { code: 'USER_RULE_PARAMS_INVALID' });
    }
    return {
        trigger,
        normalized_trigger: normalizedTrigger,
        action_id: actionId,
        action_params: params
    };
}

function matchUserCommandRule(message, rules = []) {
    const normalizedMessage = normalizeTrigger(message);
    if (!normalizedMessage) return null;
    return (Array.isArray(rules) ? rules : []).find((rule) => (
        rule?.status !== 'disabled'
        && normalizeTrigger(rule?.trigger) === normalizedMessage
    )) || null;
}

module.exports = { normalizeTrigger, normalizeUserCommandRule, matchUserCommandRule };
