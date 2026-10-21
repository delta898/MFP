'use strict';

const Ajv2020 = require('ajv/dist/2020');
const { normalizeTrigger, normalizeUserCommandRule } = require('../../../../services/memory/user-command-rules');

const schemaValidator = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true, validateFormats: false });

function containsSensitiveField(value, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 6) return false;
    return Object.entries(value).some(([key, item]) => (
        /(api.?key|access.?token|refresh.?token|password|secret|credential)/i.test(key)
        || containsSensitiveField(item, depth + 1)
    ));
}

function previewValue(value, depth = 0) {
    if (depth > 3) return '[생략]';
    if (typeof value === 'string') return value.slice(0, 300);
    if (Array.isArray(value)) return value.slice(0, 10).map((item) => previewValue(item, depth + 1));
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).slice(0, 20).map(([key, item]) => [key, previewValue(item, depth + 1)]));
}

function createAgentUserRuleCapabilities(deps = {}) {
    const listAgentCapabilities = typeof deps.listAgentCapabilities === 'function' ? deps.listAgentCapabilities : () => [];
    const eventStore = deps.eventStore || {};

    function resolveTarget(params = {}, context = {}) {
        const actionId = String(params.action?.action_id || '').trim();
        const capability = listAgentCapabilities().find((item) => item.id === actionId);
        if (!capability || !capability.agentExposure || capability.agentExposure.discoverable === false || capability.agentExposure.allowUserRuleTarget === false) {
            throw Object.assign(new Error('현재 사용할 수 있는 Agent 기능에서 규칙의 실행 대상을 찾지 못했습니다.'), { code: 'USER_RULE_ACTION_UNAVAILABLE' });
        }
        const rawParams = params.action?.params && typeof params.action.params === 'object' && !Array.isArray(params.action.params)
            ? params.action.params
            : {};
        if (containsSensitiveField(rawParams)) {
            throw Object.assign(new Error('인증 정보나 비밀 값은 개인 규칙에 저장할 수 없습니다.'), { code: 'USER_RULE_SENSITIVE_INPUT' });
        }
        const validateSchema = schemaValidator.compile({ $schema: 'https://json-schema.org/draft/2020-12/schema', ...capability.agentExposure.inputSchema });
        if (!validateSchema(rawParams)) {
            throw Object.assign(new Error(`규칙 입력이 ‘${capability.agentExposure.title}’ 기능의 입력 조건에 맞지 않습니다.`), { code: 'USER_RULE_ACTION_PARAMS_INVALID' });
        }
        return Promise.resolve(capability.validate(rawParams, context)).then((validation) => {
            if (!validation?.ok) {
                throw Object.assign(new Error((validation?.errors || ['기능 입력을 확인해 주세요.']).join(' ')), { code: 'USER_RULE_ACTION_PARAMS_INVALID' });
            }
            const normalized = normalizeUserCommandRule({
                trigger: params.trigger,
                action_id: capability.id,
                action_params: validation.normalizedParams || rawParams
            });
            return { capability, rule: normalized };
        });
    }

    function requireUserId(context = {}) {
        const userId = String(context?.user?.id || '').trim();
        if (!userId) throw Object.assign(new Error('사용자를 확인할 수 없어 개인 규칙을 관리할 수 없습니다.'), { code: 'USER_RULE_USER_REQUIRED' });
        return userId;
    }

    function storeUnavailable(method) {
        return typeof eventStore[method] !== 'function';
    }

    async function findRuleByTrigger(userId, trigger) {
        const normalizedTrigger = normalizeTrigger(trigger);
        if (typeof eventStore.getUserCommandRuleByTrigger === 'function') {
            return eventStore.getUserCommandRuleByTrigger(userId, normalizedTrigger);
        }
        const rules = await eventStore.listUserCommandRules(userId, { limit: 100 });
        return rules.find((rule) => rule.normalized_trigger === normalizedTrigger) || null;
    }

    return [
        {
            id: 'agent.user_rules.create',
            type: 'agent.command', domain: 'agent.user_rules', name: 'create',
            effect: 'local_change', confirmPolicy: 'required',
            agentExposure: {
                category: '개인화 규칙', title: '개인 실행 규칙 저장',
                allowUserRuleTarget: false,
                description: '사용자가 정한 짧은 문구를 현재 등록된 Agent 기능 하나와 입력값에 연결해 저장합니다.',
                useWhen: '사용자가 특정 문구를 반복해서 특정 Agent 기능으로 실행하도록 기억해 달라고 명시적으로 요청합니다.',
                avoidWhen: '사용자가 반복 규칙 저장을 요청하지 않았거나, 대상 기능을 현재 카탈로그에서 찾을 수 없거나, 여러 기능을 조합하는 workflow를 요청합니다.',
                inputSchema: {
                    type: 'object', additionalProperties: false, required: ['trigger', 'action'],
                    properties: {
                        trigger: { type: 'string', minLength: 2, maxLength: 80 },
                        action: {
                            type: 'object', additionalProperties: false, required: ['action_id', 'params'],
                            properties: {
                                action_id: { type: 'string', minLength: 1, maxLength: 240 },
                                params: { type: 'object' }
                            }
                        }
                    }
                },
                outputDescription: '사용자가 승인한 개인 실행 규칙을 저장하고 다음 요청부터 정확한 문구 일치 시 적용합니다.',
                examples: ['앞으로 “[ideas]”라고 하면 여행 글감 3개를 추천해줘']
            },
            async validate(params = {}, context = {}) {
                const errors = [];
                if (!String(context?.user?.id || '').trim()) errors.push('개인 규칙을 저장할 사용자를 확인할 수 없습니다.');
                try {
                    const { rule } = await resolveTarget(params, context);
                    if (typeof eventStore.listUserCommandRules === 'function' && context?.user?.id) {
                        const existing = await eventStore.listUserCommandRules(context.user.id, { limit: 100 });
                        if (existing.some((item) => item.normalized_trigger === rule.normalized_trigger)) {
                            errors.push('같은 실행 문구의 개인 규칙이 이미 있습니다. 다른 문구를 사용하거나 기존 규칙을 정리해 주세요.');
                        }
                    }
                } catch (error) { errors.push(error.message); }
                if (storeUnavailable('createUserCommandRule') || eventStore.disabled === true) errors.push('개인 규칙 저장소가 준비되지 않았습니다.');
                return { ok: errors.length === 0, errors, normalizedParams: params };
            },
            async preview(params = {}, context = {}) {
                const { capability, rule } = await resolveTarget(params, context);
                return {
                    summary: `“${rule.trigger}”라고 입력하면 ‘${capability.agentExposure.title}’ 기능을 실행하는 개인 규칙을 저장합니다. 이 기능의 실행 확인 정책은 그대로 적용됩니다.`,
                    before: {},
                    after: { trigger: rule.trigger, action_id: capability.id, action_title: capability.agentExposure.title, action_params: previewValue(rule.action_params) }
                };
            },
            async execute(params = {}, context = {}) {
                const userId = requireUserId(context);
                const { capability, rule } = await resolveTarget(params, context);
                const saved = await eventStore.createUserCommandRule({
                    ...rule,
                    user_id: userId,
                    owner_id: context?.memory?.owner_memory?.owner_user_id || eventStore.getLocalOwnerIdentity?.()?.owner_user_id,
                    channel: context?.channel || 'telegram',
                    username: context?.user?.username || ''
                });
                if (!saved) throw new Error('개인 규칙을 저장하지 못했습니다. Memory 저장소 상태를 확인해 주세요.');
                return {
                    success: true,
                    message: `“${saved.trigger}” 개인 규칙을 저장했습니다. 이 문구만 입력하면 ‘${capability.agentExposure.title}’ 기능을 실행합니다. 실행 자체에 확인이 필요한 기능은 매번 별도 확인을 받습니다.`,
                    data: { rule: saved }, sideEffects: ['user_command_rule_created']
                };
            }
        },
        {
            id: 'agent.user_rules.list',
            type: 'agent.query', domain: 'agent.user_rules', name: 'list',
            effect: 'read_only', confirmPolicy: 'never',
            agentExposure: {
                category: '개인화 규칙', title: '개인 실행 규칙 확인',
                allowUserRuleTarget: false,
                description: '사용자가 직접 저장한 실행 문구와 연결된 기능을 확인합니다.',
                useWhen: '사용자가 기억시킨 문구, 개인 실행 규칙 또는 바로가기를 확인합니다.',
                avoidWhen: '사용자가 학습된 글쓰기·주제 선호나 일반 대화 기록만 확인합니다.',
                inputSchema: { type: 'object', properties: {}, additionalProperties: false },
                outputDescription: '현재 활성화되거나 비활성화된 개인 실행 규칙 목록을 반환합니다.',
                examples: ['내가 기억시킨 실행 규칙 보여줘']
            },
            validate() { return { ok: true, errors: [], normalizedParams: {} }; },
            async preview(_params, context = {}) {
                const userId = requireUserId(context);
                const rules = storeUnavailable('listUserCommandRules') || eventStore.disabled === true ? [] : await eventStore.listUserCommandRules(userId, { limit: 50 });
                return { summary: '저장된 개인 실행 규칙을 확인합니다.', before: { count: rules.length }, after: {} };
            },
            async execute(_params, context = {}) {
                const userId = requireUserId(context);
                if (storeUnavailable('listUserCommandRules') || eventStore.disabled === true) return { success: true, message: '개인 규칙 저장소를 사용할 수 없어 저장된 규칙을 확인하지 못했습니다.', data: { rules: [] }, sideEffects: [] };
                const rules = await eventStore.listUserCommandRules(userId, { limit: 50 });
                const lines = rules.map((rule) => {
                    const target = listAgentCapabilities().find((item) => (
                        item.id === rule.action_id
                    ));
                    const title = target?.agentExposure?.title || '현재 이용할 수 없는 기능';
                    return `• “${rule.trigger}” → ${title}${rule.status === 'disabled' ? ' (사용 안 함)' : ''}`;
                });
                return { success: true, message: rules.length ? `개인 실행 규칙입니다.\n${lines.join('\n')}` : '저장된 개인 실행 규칙이 없습니다.', data: { rules }, sideEffects: [] };
            }
        },
        {
            id: 'agent.user_rules.delete',
            type: 'agent.command', domain: 'agent.user_rules', name: 'delete',
            effect: 'local_change', confirmPolicy: 'required',
            agentExposure: {
                category: '개인화 규칙', title: '개인 실행 규칙 삭제',
                allowUserRuleTarget: false,
                description: '사용자가 지정한 개인 실행 규칙 하나를 삭제합니다.',
                useWhen: '사용자가 삭제할 실행 문구를 명확히 지정해 개인 규칙 삭제를 요청합니다.',
                avoidWhen: '사용자가 규칙을 일시 중지하거나 어떤 규칙을 삭제할지 불명확합니다.',
                inputSchema: {
                    type: 'object', additionalProperties: false, required: ['trigger'],
                    properties: { trigger: { type: 'string', minLength: 2, maxLength: 80 } }
                },
                outputDescription: '지정된 개인 실행 규칙을 삭제합니다.',
                examples: ['“[ideas]” 규칙을 삭제해줘']
            },
            validate(params = {}, context = {}) {
                const errors = [];
                if (!String(context?.user?.id || '').trim()) errors.push('개인 규칙을 관리할 사용자를 확인할 수 없습니다.');
                if (!String(params.trigger || '').trim()) errors.push('삭제할 규칙의 실행 문구를 지정해 주세요.');
                if (storeUnavailable('deleteUserCommandRule') || eventStore.disabled === true) errors.push('개인 규칙 저장소가 준비되지 않았습니다.');
                return { ok: errors.length === 0, errors, normalizedParams: { trigger: String(params.trigger || '').trim() } };
            },
            async preview(params = {}, context = {}) {
                const userId = requireUserId(context);
                const rule = await findRuleByTrigger(userId, params.trigger);
                if (!rule) throw Object.assign(new Error('해당 개인 실행 규칙을 찾지 못했습니다.'), { code: 'USER_RULE_NOT_FOUND' });
                return { summary: `“${rule.trigger}” 개인 실행 규칙을 삭제합니다.`, before: { trigger: rule.trigger }, after: {} };
            },
            async execute(params = {}, context = {}) {
                const userId = requireUserId(context);
                const rule = await findRuleByTrigger(userId, params.trigger);
                if (!rule) throw Object.assign(new Error('해당 개인 실행 규칙을 찾지 못했습니다.'), { code: 'USER_RULE_NOT_FOUND' });
                await eventStore.deleteUserCommandRule(userId, rule.id);
                return { success: true, message: `“${rule.trigger}” 개인 실행 규칙을 삭제했습니다.`, data: { rule_id: rule.id }, sideEffects: ['user_command_rule_deleted'] };
            }
        },
        {
            id: 'agent.user_rules.set_status',
            type: 'agent.command', domain: 'agent.user_rules', name: 'set_status',
            effect: 'local_change', confirmPolicy: 'required',
            agentExposure: {
                category: '개인화 규칙', title: '개인 실행 규칙 사용 전환',
                allowUserRuleTarget: false,
                description: '저장한 개인 실행 규칙을 잠시 사용하지 않도록 하거나 다시 활성화합니다.',
                useWhen: '사용자가 특정 개인 규칙을 잠시 끄거나 다시 켜 달라고 요청합니다.',
                avoidWhen: '사용자가 규칙 삭제를 원하거나 대상을 지정하지 않았습니다.',
                inputSchema: {
                    type: 'object', additionalProperties: false, required: ['trigger', 'status'],
                    properties: {
                        trigger: { type: 'string', minLength: 2, maxLength: 80 },
                        status: { type: 'string', enum: ['active', 'disabled'] }
                    }
                },
                outputDescription: '개인 규칙의 사용 상태를 변경합니다.',
                examples: ['“[ideas]” 규칙을 잠시 꺼줘']
            },
            validate(params = {}, context = {}) {
                const errors = [];
                if (!String(context?.user?.id || '').trim()) errors.push('개인 규칙을 관리할 사용자를 확인할 수 없습니다.');
                if (!String(params.trigger || '').trim()) errors.push('변경할 규칙의 실행 문구를 지정해 주세요.');
                if (!['active', 'disabled'].includes(params.status)) errors.push('규칙 상태를 확인해 주세요.');
                if (storeUnavailable('setUserCommandRuleStatus') || eventStore.disabled === true) errors.push('개인 규칙 저장소가 준비되지 않았습니다.');
                return { ok: errors.length === 0, errors, normalizedParams: { trigger: String(params.trigger || '').trim(), status: params.status } };
            },
            async preview(params = {}, context = {}) {
                const userId = requireUserId(context);
                const rule = await findRuleByTrigger(userId, params.trigger);
                if (!rule) throw Object.assign(new Error('해당 개인 실행 규칙을 찾지 못했습니다.'), { code: 'USER_RULE_NOT_FOUND' });
                const statusText = params.status === 'active' ? '다시 켭니다' : '잠시 끕니다';
                return { summary: `“${rule.trigger}” 개인 실행 규칙을 ${statusText}.`, before: { status: rule.status }, after: { status: params.status } };
            },
            async execute(params = {}, context = {}) {
                const userId = requireUserId(context);
                const rule = await findRuleByTrigger(userId, params.trigger);
                if (!rule) throw Object.assign(new Error('해당 개인 실행 규칙을 찾지 못했습니다.'), { code: 'USER_RULE_NOT_FOUND' });
                const updated = await eventStore.setUserCommandRuleStatus(userId, rule.id, params.status);
                if (!updated) throw Object.assign(new Error('개인 실행 규칙 상태를 변경하지 못했습니다.'), { code: 'USER_RULE_UPDATE_FAILED' });
                return { success: true, message: `“${updated.trigger}” 개인 실행 규칙을 ${updated.status === 'active' ? '다시 켰습니다' : '잠시 껐습니다'}.`, data: { rule: updated }, sideEffects: ['user_command_rule_updated'] };
            }
        }
    ];
}

module.exports = { createAgentUserRuleCapabilities };
