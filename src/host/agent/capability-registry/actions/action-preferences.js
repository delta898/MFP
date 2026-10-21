'use strict';

const { getPersonalizableParameter, validatePreferenceValue } = require('../../../../services/memory/user-action-preferences');

function createAgentActionPreferenceCapabilities(deps = {}) {
    const eventStore = deps.eventStore || {};
    const listAgentCapabilities = typeof deps.listAgentCapabilities === 'function' ? deps.listAgentCapabilities : () => [];
    if (eventStore.disabled === true
        || typeof eventStore.upsertUserActionPreference !== 'function'
        || typeof eventStore.listUserActionPreferences !== 'function'
        || typeof eventStore.deleteUserActionPreference !== 'function') return [];

    function userId(context = {}) {
        const id = String(context?.user?.id || '').trim();
        if (!id) throw Object.assign(new Error('개인 기본 설정을 관리할 사용자를 확인할 수 없습니다.'), { code: 'USER_ACTION_PREFERENCE_USER_REQUIRED' });
        return id;
    }

    function resolve(params = {}) {
        const actionId = String(params.action_id || '').trim();
        const capability = listAgentCapabilities().find((item) => item.id === actionId);
        if (!capability) throw Object.assign(new Error('현재 사용할 수 있는 Agent 기능에서 기본값 대상을 찾지 못했습니다.'), { code: 'USER_ACTION_PREFERENCE_ACTION_UNAVAILABLE' });
        const validation = validatePreferenceValue(capability, params.parameter_path, params.value);
        if (!validation.ok) throw Object.assign(new Error(validation.error), { code: 'USER_ACTION_PREFERENCE_VALUE_INVALID' });
        return { capability, parameter: validation.parameter };
    }

    function unavailable() {
        return eventStore.disabled === true || typeof eventStore.upsertUserActionPreference !== 'function';
    }

    return [
        {
            id: 'agent.personalization.set_default', type: 'agent.command', domain: 'agent.personalization', name: 'set_default',
            effect: 'local_change', confirmPolicy: 'required',
            agentExposure: {
                category: '개인화', title: '기능 기본 설정 기억',
                description: '사용자가 직접 지정한 기능의 선택 항목 기본값을 개인 설정으로 기억합니다. 실행 확인과 필수 정보 질문은 줄이지 않습니다.',
                useWhen: '사용자가 특정 기능의 선택값을 이후 요청부터 기본으로 사용하도록 기억해 달라고 합니다.',
                avoidWhen: '사용자가 이번 요청만 다르게 실행하거나, 선택 항목이 기능에서 개인 기본값 저장 대상으로 선언되지 않았습니다.',
                personalizableParameters: {},
                inputSchema: {
                    type: 'object', additionalProperties: false, required: ['action_id', 'parameter_path', 'value'],
                    properties: {
                        action_id: { type: 'string', minLength: 1, maxLength: 240 },
                        parameter_path: { type: 'string', minLength: 1, maxLength: 120 },
                        value: { type: ['boolean', 'string', 'integer', 'number'] }
                    }
                },
                outputDescription: '사용자가 승인한 기능 기본값을 저장하거나 갱신합니다.',
                examples: ['앞으로 글감 등록할 때 이미지 생성은 기본으로 꺼줘', '블로그 글감 저장 시 외부 참고자료는 항상 사용해줘']
            },
            validate(params = {}, context = {}) {
                const errors = [];
                if (!String(context?.user?.id || '').trim()) errors.push('개인 기본 설정을 저장할 사용자를 확인할 수 없습니다.');
                try { resolve(params); } catch (error) { errors.push(error.message); }
                if (unavailable()) errors.push('개인 설정 저장소를 사용할 수 없습니다.');
                return { ok: errors.length === 0, errors, normalizedParams: params };
            },
            async preview(params = {}, context = {}) {
                const currentUser = userId(context);
                const { capability, parameter } = resolve(params);
                const current = typeof eventStore.getUserActionPreference === 'function'
                    ? await eventStore.getUserActionPreference(currentUser, capability.id, parameter.path)
                    : null;
                return {
                    summary: `‘${capability.agentExposure.title}’ 기능에서 ‘${parameter.title}’을(를) 이후 요청의 기본값으로 기억합니다. 현재 요청에서 다른 값을 말하면 그 요청을 우선하며, 실행 확인 정책은 그대로 적용됩니다.`,
                    before: { value: current?.value ?? null },
                    after: { value: params.value }
                };
            },
            async execute(params = {}, context = {}) {
                const currentUser = userId(context);
                const { capability, parameter } = resolve(params);
                const saved = await eventStore.upsertUserActionPreference({
                    user_id: currentUser,
                    owner_id: context?.memory?.owner_memory?.owner_user_id || eventStore.getLocalOwnerIdentity?.()?.owner_user_id,
                    channel: context?.channel || 'telegram',
                    username: context?.user?.username || '',
                    action_id: capability.id,
                    parameter_path: parameter.path,
                    value: params.value
                });
                if (!saved) throw new Error('개인 기본 설정을 저장하지 못했습니다.');
                return {
                    success: true,
                    message: `‘${capability.agentExposure.title}’ 기능의 ‘${parameter.title}’ 기본값을 기억했습니다. 현재 요청에서 다른 값을 지정하면 그 값을 우선하고, 실행 확인은 계속 받습니다.`,
                    data: { preference: saved }, sideEffects: ['user_action_preference_saved']
                };
            }
        },
        {
            id: 'agent.personalization.list_defaults', type: 'agent.query', domain: 'agent.personalization', name: 'list_defaults',
            effect: 'read_only', confirmPolicy: 'never',
            agentExposure: {
                category: '개인화', title: '기억한 기능 기본 설정 확인',
                description: '사용자가 직접 지정해 저장한 기능별 기본값을 확인합니다.',
                useWhen: '사용자가 자신이 요청해 기억시킨 기능 기본값을 확인합니다.',
                avoidWhen: '사용자가 행동에서 추정한 선호 요약을 확인합니다.',
                inputSchema: { type: 'object', additionalProperties: false, properties: {} },
                outputDescription: '저장된 기능 기본값과 해당 기능의 현재 이용 가능 여부를 보여줍니다.',
                examples: ['내가 정한 기본 설정 보여줘']
            },
            validate() { return { ok: true, errors: [], normalizedParams: {} }; },
            async preview(_params, context = {}) {
                const values = typeof eventStore.listUserActionPreferences === 'function'
                    ? await eventStore.listUserActionPreferences(userId(context), { limit: 50 }) : [];
                return { summary: '사용자가 직접 저장한 기능 기본값을 조회합니다.', before: { count: values.length }, after: {} };
            },
            async execute(_params, context = {}) {
                const values = typeof eventStore.listUserActionPreferences === 'function'
                    ? await eventStore.listUserActionPreferences(userId(context), { limit: 50 }) : [];
                const catalog = new Map(listAgentCapabilities().map((item) => [item.id, item]));
                const lines = values.map((item) => {
                    const capability = catalog.get(item.action_id);
                    const parameter = capability && validatePreferenceValue(capability, item.parameter_path, item.value).parameter;
                    return `• ${capability?.agentExposure?.title || '현재 사용할 수 없는 기능'} / ${parameter?.title || item.parameter_path}: ${JSON.stringify(item.value)}`;
                });
                return { success: true, message: values.length ? `기억한 기능 기본 설정입니다.\n${lines.join('\n')}` : '직접 저장한 기능 기본 설정이 없습니다.', data: { preferences: values }, sideEffects: [] };
            }
        },
        {
            id: 'agent.personalization.delete_default', type: 'agent.command', domain: 'agent.personalization', name: 'delete_default',
            effect: 'local_change', confirmPolicy: 'required',
            agentExposure: {
                category: '개인화', title: '기능 기본 설정 삭제',
                description: '사용자가 직접 저장한 특정 기능 기본값을 삭제합니다.',
                useWhen: '사용자가 특정 기능의 기억된 기본값을 지우거나 잊어달라고 합니다.',
                avoidWhen: '삭제할 기능이나 선택 항목이 모호합니다.',
                inputSchema: {
                    type: 'object', additionalProperties: false, required: ['action_id', 'parameter_path'],
                    properties: { action_id: { type: 'string', minLength: 1, maxLength: 240 }, parameter_path: { type: 'string', minLength: 1, maxLength: 120 } }
                },
                outputDescription: '지정한 기능 기본값을 삭제합니다.',
                examples: ['글감 저장 이미지 기본값 기억을 지워줘']
            },
            validate(params = {}, context = {}) {
                const errors = [];
                if (!String(context?.user?.id || '').trim()) errors.push('개인 기본 설정을 관리할 사용자를 확인할 수 없습니다.');
                if (!String(params.action_id || '').trim() || !String(params.parameter_path || '').trim()) errors.push('삭제할 기능과 선택 항목을 지정해 주세요.');
                const capability = listAgentCapabilities().find((item) => item.id === params.action_id);
                if (!getPersonalizableParameter(capability, params.parameter_path)) errors.push('해당 기능에서 개인 기본값으로 저장하도록 허용한 선택 항목이 아닙니다.');
                if (eventStore.disabled === true || typeof eventStore.deleteUserActionPreference !== 'function') errors.push('개인 설정 저장소를 사용할 수 없습니다.');
                return { ok: errors.length === 0, errors, normalizedParams: params };
            },
            async preview(params = {}, context = {}) {
                const currentUser = userId(context);
                const capability = listAgentCapabilities().find((item) => item.id === params.action_id);
                const parameter = getPersonalizableParameter(capability, params.parameter_path);
                const current = await eventStore.getUserActionPreference?.(currentUser, params.action_id, params.parameter_path);
                return {
                    summary: `‘${capability?.agentExposure?.title || params.action_id}’ 기능의 ‘${parameter?.title || params.parameter_path}’ 기본값을 삭제합니다.`,
                    before: { value: current?.value ?? null }, after: {}
                };
            },
            async execute(params = {}, context = {}) {
                const deleted = await eventStore.deleteUserActionPreference(userId(context), params.action_id, params.parameter_path);
                return { success: true, message: deleted ? '기능 기본값을 삭제했습니다.' : '해당 기능 기본값이 이미 없습니다.', data: { deleted }, sideEffects: deleted ? ['user_action_preference_deleted'] : [] };
            }
        }
    ];
}

module.exports = { createAgentActionPreferenceCapabilities };
