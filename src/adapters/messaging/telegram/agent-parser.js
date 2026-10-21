const { matchUserCommandRule } = require('../../../services/memory/user-command-rules');
const { validateActionEnvelope } = require('../../../host/agent/contracts/action-schema');

function buildEnvelope(conversationId, messageId, actions = []) {
    return {
        version: '1.0',
        conversation_id: conversationId,
        message_id: messageId,
        route: actions.length > 0 ? 'agent' : 'unsupported',
        actions,
        meta: {},
        reply: { text: '', recommendation: '' }
    };
}

function matchUserRuleEnvelope(messageText, context = {}) {
    const rule = matchUserCommandRule(messageText, context.memory?.user_rules);
    if (!rule) return null;
    const capability = listAgentActions(context.capabilityRegistry)
        .find((item) => item.action_id === rule.action_id);
    if (!capability) {
        return {
            ...buildEnvelope(context.conversationId, context.messageId),
            route: 'reply',
            reply: { text: `“${rule.trigger}” 규칙의 기능이 현재 등록되어 있지 않아 실행하지 않았습니다. 기존 규칙을 삭제한 뒤 현재 기능으로 다시 등록해 주세요.`, recommendation: '' }
        };
    }
    const actionId = `action_${String(rule.id || 'user_rule').replace(/[^a-zA-Z0-9_-]/g, '_')}_${String(context.messageId || Date.now()).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
    return buildEnvelope(context.conversationId, context.messageId, [{
        id: actionId,
        action_id: capability.id,
        type: capability.type,
        domain: capability.domain,
        name: capability.name,
        params: rule.action_params || {},
        requires_confirmation: capability.confirmationPolicy === 'required',
        reason: `사용자가 저장한 “${rule.trigger}” 실행 규칙`
    }]);
}

function normalizeText(raw) {
    return String(raw || '').trim();
}

function listAgentActions(capabilityRegistry) {
    const capabilities = typeof capabilityRegistry?.listAgentActions === 'function'
        ? capabilityRegistry.listAgentActions()
        : [];
    return capabilities
        .map((capability) => {
            const id = String(capability?.id || '').trim();
            const domain = String(capability?.domain || '').trim();
            const name = String(capability?.name || '').trim();
            if (!id || !domain || !name || !String(capability?.type || '').trim()) return null;
            return {
                id,
                action_id: id,
                domain,
                name,
                type: String(capability.type).trim(),
                kind: String(capability.agentExposure?.kind || 'atomic').trim(),
                title: String(capability.agentExposure?.title || id).trim(),
                description: String(capability.agentExposure?.description || '').trim(),
                useWhen: String(capability.agentExposure?.useWhen || '').trim(),
                avoidWhen: String(capability.agentExposure?.avoidWhen || '').trim(),
                inputSchema: capability.agentExposure?.inputSchema || { type: 'object', properties: {}, additionalProperties: false },
                parameterSemantics: capability.agentExposure?.parameterSemantics || {},
                outputDescription: String(capability.agentExposure?.outputDescription || '').trim(),
                requiredInputQuestions: capability.agentExposure?.requiredInputQuestions || {},
                optionalInputSuggestions: capability.agentExposure?.optionalInputSuggestions || {},
                personalizableParameters: capability.agentExposure?.personalizableParameters || {},
                effect: String(capability.effect || '').trim(),
                confirmationPolicy: String(capability.confirmPolicy || '').trim(),
                availabilityNote: String(capability.agentExposure?.availabilityNote || '').trim(),
                examples: Array.isArray(capability.agentExposure?.examples)
                    ? capability.agentExposure.examples.map((item) => String(item || '').trim()).filter(Boolean)
                    : []
            };
        })
        .filter(Boolean);
}

function formatAgentActionCatalog(actions = []) {
    if (actions.length === 0) return '- 현재 등록된 Agent 기능 없음';
    return actions.map((action) => {
        const examples = action.examples.length > 0 ? `; 예: ${action.examples.join(' / ')}` : '';
        const output = action.outputDescription ? `; 결과: ${action.outputDescription}` : '';
        const availability = action.availabilityNote ? `; 이용 조건: ${action.availabilityNote}` : '';
        const requiredQuestions = Object.keys(action.requiredInputQuestions).length > 0 ? `; 필수 정보 질문=${JSON.stringify(action.requiredInputQuestions)}` : '';
        const optionalSuggestions = Object.keys(action.optionalInputSuggestions).length > 0 ? `; 선택 정보 제안=${JSON.stringify(action.optionalInputSuggestions)}` : '';
        const personalizable = Object.keys(action.personalizableParameters).length > 0 ? `; 사용자가 저장 가능한 기본 설정=${JSON.stringify(action.personalizableParameters)}` : '';
        return `- action_id=${action.id} (type=${action.type}, kind=${action.kind}, effect=${action.effect}, confirmation=${action.confirmationPolicy}): ${action.title} — ${action.description}; 사용 시점=${action.useWhen}; 사용하지 않을 때=${action.avoidWhen}; inputSchema=${JSON.stringify(action.inputSchema)}; parameterSemantics=${JSON.stringify(action.parameterSemantics)}${requiredQuestions}${optionalSuggestions}${personalizable}${output}${availability}${examples}`;
    }).join('\n');
}

function tryParseDeterministicEnvelope(messageText, context = {}) {
    const text = normalizeText(messageText);
    const conversationId = String(context.conversationId || '').trim();
    const messageId = String(context.messageId || '').trim();
    const command = text.split(/\s+/)[0].split('@')[0].toLowerCase();
    if (command === '/start' || command === '/help') {
        return buildEnvelope(conversationId, messageId, [{
            id: 'act_1',
            action_id: 'agent.meta.get_help',
            type: 'agent.query',
            domain: 'agent.meta',
            name: 'get_help',
            params: {},
            reason: '현재 Telegram에서 가능한 기능 안내'
        }]);
    }

    return null;
}

function stripCodeFence(raw) {
    return String(raw || '')
        .trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
}

function extractFirstJsonObject(raw) {
    const text = stripCodeFence(raw);
    const start = text.indexOf('{');
    if (start < 0) return '';

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < text.length; index += 1) {
        const char = text[index];

        if (inString) {
            if (escaped) {
                escaped = false;
                continue;
            }
            if (char === '\\') {
                escaped = true;
                continue;
            }
            if (char === '"') inString = false;
            continue;
        }

        if (char === '"') {
            inString = true;
            continue;
        }
        if (char === '{') depth += 1;
        if (char === '}') depth -= 1;

        if (depth === 0) {
            return text.slice(start, index + 1).trim();
        }
    }

    return '';
}

async function routeTelegramMessage(messageText, context = {}) {
    const conversationId = String(context.conversationId || '').trim();
    const messageId = String(context.messageId || '').trim();
    const logger = context.logger || require('../../../utilities/logging/logger');
    const deterministic = tryParseDeterministicEnvelope(messageText, context);
    if (deterministic) {
        return deterministic;
    }
    const matchedUserRule = matchUserRuleEnvelope(messageText, context);
    if (matchedUserRule) return matchedUserRule;
    const modelCaller = context.modelCaller;
    if (typeof modelCaller !== 'function') throw new Error('AI Gateway text generation is unavailable for Telegram routing.');
    const agentActions = listAgentActions(context.capabilityRegistry);
    logger.info?.(`[AgentParser] action catalog loaded count=${agentActions.length} ids=${agentActions.map((item) => item.action_id).join(',') || 'none'}`);
    const recentEvents = Array.isArray(context.memory?.recent_events) ? context.memory.recent_events.slice(0, 10) : [];
    const recentMessages = Array.isArray(context.memory?.recent_messages) ? context.memory.recent_messages.slice(0, 8) : [];
    const recentActions = Array.isArray(context.memory?.recent_actions) ? context.memory.recent_actions.slice(0, 4) : [];
    const recentSettingChanges = Array.isArray(context.memory?.recent_setting_changes) ? context.memory.recent_setting_changes.slice(0, 4) : [];
    const preferences = Array.isArray(context.memory?.preferences) ? context.memory.preferences.slice(0, 5) : [];
    const userActionPreferences = Array.isArray(context.memory?.user_action_preferences) ? context.memory.user_action_preferences.slice(0, 30) : [];
    const pendingConfirmations = Array.isArray(context.memory?.pending_confirmations) ? context.memory.pending_confirmations.slice(0, 3) : [];
    const recentOutcomes = recentEvents
        .filter((item) => item?.event_type === 'capability.action.executed')
        .map((item) => {
            const payload = item.payload && typeof item.payload === 'object' ? item.payload : {};
            const action = payload.action && typeof payload.action === 'object' ? payload.action : {};
            const result = payload.result && typeof payload.result === 'object' ? payload.result : {};
            const output = result.data && typeof result.data === 'object' ? result.data : {};
            return {
                action_id: String(action.action_id || `${action.domain || ''}.${action.name || ''}`),
                input: action.params && typeof action.params === 'object' ? action.params : {},
                success: result.success !== false,
                message: String(result.message || '').slice(0, 500),
                output
            };
        })
        .slice(0, 6);

    const prompt = `당신은 BlogGenius의 Telegram 대화 라우터입니다.
사용자 메시지에 직접 답하거나, 아래 Agent action catalog의 action 하나를 선택하세요. 키워드만 맞춘 기계적 분기 대신 문맥과 사용자의 의도를 해석하세요.

[현재 허용 Agent action catalog]
다음 목록은 현재 등록되어 실행 가능한 Agent action 계약입니다. 각 action의 고유 식별자는 action_id입니다. 반환할 때 action_id를 그대로 사용하고 type/domain/name을 만들지 마세요. 목록에 없는 기능을 만들어 내지 마세요.
${formatAgentActionCatalog(agentActions)}

- 사용자의 목적과 가장 잘 맞는 action을 의미에 따라 고르고, 입력은 해당 action의 inputSchema에 맞춥니다. 스키마에 없는 필드는 만들지 않습니다.
- Agent의 기본 원칙은 “찾을 수 있거나 해결할 수 있으면 최대한 해결한다”입니다. 요청이 불완전해 보여도 곧바로 사용자에게 내부 ID나 버전을 묻지 말고, 최근 대화와 최근 action의 구조화된 결과에서 먼저 대상을 찾아 연결하거나 실행 가능한 대안을 구성하세요.
- “그 원고”, “방금 만든 글”, “해당 항목”처럼 앞선 대상을 가리키면 최근 action 결과와 대화에서 후보를 찾습니다. 정확히 하나로 특정되면 그 결과의 식별자와 버전 및 아직 유효한 요청 옵션을 재사용하세요. 여러 후보가 남거나 필요한 정보를 확인할 수 없을 때만 무엇을 가리키는지 짧게 물으세요. 추측한 식별자를 만들거나 다른 대상에 적용하지 마세요.
- 이전 action이 부분 성공한 경우에도 결과의 성공/실패와 남아 있는 산출물을 확인하세요. 실패한 후속 단계 때문에 이미 저장된 원고나 생성 결과를 버리지 말고, 그 산출물을 이어서 사용할 수 있는 action을 우선 탐색하세요.
- 각 action의 사용 시점과 사용하지 않을 조건을 비교해 선택하세요. examples는 표현 예시일 뿐 완전한 phrase 목록이 아닙니다.
- parameterSemantics에서 role이 explicit_constraint인 입력은 현재 요청이 지정한 범위를 보존하는 값입니다. 개인화 기억이나 외부 후보로 그 범위를 바꾸지 마세요. 해당 조건을 입력으로 받지 않는 action은 선택하지 말고 질문하거나 지원 불가를 안내하세요.
- personalization_context는 현재 요청의 명시 조건을 만족하는 후보 안에서만 선택 근거로 사용하세요. 현재 요청과 기억이 충돌하면 현재 요청을 따릅니다.
- 사용자가 직접 승인해 저장한 기능 기본 설정은 해당 기능의 비어 있는 선택 항목에만 적용합니다. 이번 요청에서 값이 명시되면 이번 요청을 우선합니다. 개인 기본값은 필수 입력을 대신하거나 실행 확인 정책을 바꾸지 않습니다.
- kind가 application_workflow인 action은 검증된 여러 단계의 제품 업무를 수행하므로, 같은 목적의 원자 action을 임의로 나열하는 것보다 우선 선택합니다.
- 여러 action을 함께 선택하는 것은 사용자가 여러 작업을 요청했거나 각 작업이 서로 독립적일 때만 합니다. 다른 action의 결과를 임의로 다음 입력에 연결하지 않습니다.
- effect는 read_only(조회), generated_output(저장되지 않는 생성 결과), local_change(앱 내부 변경), external_side_effect(외부 서비스 변경), persistent_automation(지속 실행)으로 구분합니다. confirmation=required는 Host가 실행 전 확인을 받으며, never도 사용자의 요청 범위를 넓히거나 누락된 동의를 대신하지 않습니다.
- 확인 정책은 Host가 action 선언과 실행 효과에 따라 결정하므로 모델이 requires_confirmation을 정하거나 생략 여부로 우회하지 않습니다.
- 등록된 action으로 요청을 이행할 수 없으면 actions는 빈 배열 []로 반환하고 unsupported 경로를 선택합니다.

[라우트 선택]
- BlogGenius 기능 실행은 route="agent"와 actions로 반환하세요.
- 사용자의 일반 질문, 인사, 의견 교환, 설명 요청은 route="reply"로 직접 답하세요. 실행 action을 추측하지 마세요.
- 필수 정보가 빠졌거나 후보가 겹쳐 안전하게 선택할 수 없으면 action을 실행하지 말고 route="reply"로 필요한 내용을 묻는 짧은 질문 하나를 하세요.
- 입력 스키마의 필수 값은 MUST입니다. 누락된 필수 값을 기억이나 기본값으로 추정하지 말고 질문하세요. 후보가 하나로 명확하고 필수 값이 모두 있으면 불필요한 확인 질문을 하지 마세요.
- 선택 값은 NICE to do입니다. action을 막지 말고 action descriptor의 선택 정보 제안을 짧게 안내하세요. 선택 정보를 필수처럼 되묻지 마세요.
- 등록된 기능으로 수행할 수 없는 요청이면 route="unsupported"로 현재 가능한 범위와 다음 선택지를 자연스럽게 설명하세요.
- 직접 답변만 있을 때 reply의 text에 답을 넣습니다. 실행 요청에도 도움이 되는 짧은 설명을 붙일 수 있습니다.
- 요청한 일에 먼저 답한 뒤, 도움이 될 추천이 있을 때만 reply의 recommendation에 이유와 함께 씁니다. 추천은 실행하지 않으며, 요청을 대체하지 않습니다.

[파라미터 규칙]
- 각 action의 입력 형식, 필수 값, 허용 값은 catalog에 함께 제공된 inputSchema를 따릅니다.
- 필요 값이 문맥에서 확인되지 않으면 임의로 추정하지 말고 위 규칙대로 focused clarification을 합니다.
- 사용자가 특정 문구를 앞으로의 실행 규칙으로 저장해 달라고 명시하면 agent.user_rules.create를 선택합니다. 연결 대상은 현재 catalog에 표시된 action_id를 action.action_id로 그대로 전달하는 단일 action이어야 하며, 입력은 그 action의 inputSchema에 맞춥니다. 등록되지 않은 기능이나 여러 action을 조합하는 규칙은 저장하지 말고 먼저 설명하거나 질문합니다.
- 저장 규칙은 사용자가 승인한 뒤에만 활성화됩니다. 등록된 트리거와 메시지가 정확히 일치할 때만 저장 인자 그대로 실행하며, 대상 action의 현재 확인 정책도 그대로 적용됩니다.
- 사용자가 저장 규칙을 확인·삭제·일시 중지·재활성화해 달라고 하면 해당 agent.user_rules action을 선택하고, 어떤 규칙인지 모호하면 먼저 확인합니다.
- 사용자가 특정 기능의 선택 항목을 이후 요청부터 기본값으로 기억해 달라고 명시하면 agent.personalization.set_default를 선택합니다. 대상 action_id와 parameter_path는 카탈로그의 사용자가 저장 가능한 기본 설정 선언에서 고르고, 현재 요청의 값이 아니라 사용자가 앞으로 적용하라고 한 값을 저장합니다. 저장 전 확인은 Host가 요구합니다.
- 사용자가 직접 저장한 기능 기본값을 조회하거나 지워달라고 하면 agent.personalization.list_defaults 또는 agent.personalization.delete_default를 선택합니다. inferred preference와 명시적으로 저장한 기본값을 같은 것으로 설명하지 않습니다.

[최근 메모리]
${recentEvents.length > 0 ? recentEvents.map((item) => {
    const payload = item.payload && typeof item.payload === 'object' ? JSON.stringify(item.payload).slice(0, 160) : '{}';
    return `- ${item.event_type}: ${payload}`;
}).join('\n') : '- 없음'}

[최근 메시지]
${recentMessages.length > 0 ? recentMessages.map((item) => `- [${item.role}] ${String(item.text || '').slice(0, 500)}`).join('\n') : '- 없음'}

[최근 실행 결과와 산출물]
${recentOutcomes.length > 0 ? recentOutcomes.map((item) => `- ${JSON.stringify(item).slice(0, 1600)}`).join('\n') : '- 없음'}

[최근 action]
${recentActions.length > 0 ? recentActions.map((item) => `- ${item.domain}.${item.name} (${item.status})`).join('\n') : '- 없음'}

[최근 설정 변경]
${recentSettingChanges.length > 0 ? recentSettingChanges.map((item) => `- ${item.setting_key}: ${JSON.stringify(item.after).slice(0, 120)}`).join('\n') : '- 없음'}

[선호 요약]
${preferences.length > 0 ? preferences.map((item) => `- ${item.name}: ${JSON.stringify(item.value).slice(0, 120)} (confidence=${item.confidence.toFixed(2)}, evidence=${item.evidence_count})`).join('\n') : '- 없음'}

[사용자가 직접 저장한 기능 기본값]
${userActionPreferences.length > 0 ? userActionPreferences.map((item) => `- action_id=${item.action_id}; parameter_path=${item.parameter_path}; value=${JSON.stringify(item.value)}`).join('\n') : '- 없음'}

[확인 대기 중 작업]
${pendingConfirmations.length > 0 ? pendingConfirmations.map((item) => {
    const preview = Array.isArray(item.previews) && item.previews[0] ? (item.previews[0].preview?.summary || '') : '';
    return `- ${item.id}: ${preview}`;
}).join('\n') : '- 없음'}

[출력 형식]
반드시 JSON object 하나만 반환하세요. 설명 금지.
{
  "version": "1.0",
  "conversation_id": "${conversationId}",
  "message_id": "${messageId}",
  "route": "agent | reply | unsupported",
  "actions": [
    {
      "action_id": "선택한 catalog action의 action_id",
      "params": {},
      "reason": "간단한 한국어 설명"
    }
  ],
  "meta": { "explicit_params": [] },
  "reply": { "text": "직접 답변 또는 실행 전 설명", "recommendation": "선택적 추천; 없으면 빈 문자열" }
}

[사용자 메시지]
${messageText}`;

    logger.debug('🧠 [AgentParser] Telegram unified request parsing...');
    const rawResult = await modelCaller(prompt);
    if (!rawResult) return buildEnvelope(conversationId, messageId, []);

    const jsonText = extractFirstJsonObject(rawResult);
    if (!jsonText) {
        logger.debug(`[AgentParser] JSON object not found. raw=${String(rawResult).slice(0, 300)}`);
        return buildEnvelope(conversationId, messageId, []);
    }

    try {
        const parsed = JSON.parse(jsonText);
        const actions = Array.isArray(parsed?.actions) ? parsed.actions : [];
        const route = ['agent', 'reply', 'unsupported'].includes(parsed?.route)
            ? parsed.route
            : (actions.length > 0 ? 'agent' : 'unsupported');
        const reply = parsed?.reply && typeof parsed.reply === 'object' ? parsed.reply : {};

        const allowedCapabilityIds = new Set(agentActions.map((item) => item.action_id));
        if (route === 'agent' && actions.some((action) => !allowedCapabilityIds.has(String(action?.action_id || '').trim()))) {
            logger.debug('[AgentParser] Model selected a capability outside the runtime catalog.');
            return buildEnvelope(conversationId, messageId, []);
        }

        if (route === 'agent' && actions.length === 0) return buildEnvelope(conversationId, messageId, []);
        if (route === 'agent' && actions.length === 0) return buildEnvelope(conversationId, messageId, []);
        if (route === 'reply' && actions.length > 0) return buildEnvelope(conversationId, messageId, []);
        if (route === 'unsupported' && actions.length > 0) return buildEnvelope(conversationId, messageId, []);

        let recommendation = String(reply.recommendation || '').trim();
        if (route === 'agent' && typeof context.capabilityRegistry?.getAgentAction === 'function') {
            const candidateActions = actions.map((action, index) => ({
                id: String(action?.id || `inv_${index + 1}`).trim(),
                action_id: String(action?.action_id || '').trim(),
                params: action?.params && typeof action.params === 'object' && !Array.isArray(action.params) ? action.params : {},
                reason: String(action?.reason || '').trim()
            }));
            const validation = validateActionEnvelope({
                version: '1.0', conversation_id: conversationId, message_id: messageId,
                actions: candidateActions
            }, context.capabilityRegistry);
            const missingFields = Array.from(new Set(validation.errors.flatMap((error) =>
                [...String(error).matchAll(/must have required property '([^']+)'/g)].map((match) => match[1])
            )));
            if (missingFields.length > 0) {
                const capability = context.capabilityRegistry.getAgentAction(candidateActions[0]?.action_id);
                const questions = capability?.agentExposure?.requiredInputQuestions || {};
                const question = missingFields.map((field) => questions[field]).find((item) => String(item || '').trim());
                return {
                    ...buildEnvelope(conversationId, messageId),
                    route: 'reply',
                    reply: {
                        text: String(question || '요청을 진행하는 데 필요한 정보를 확인하지 못했어요. 필요한 조건을 조금 더 알려주시겠어요?').trim(),
                        recommendation: ''
                    }
                };
            }

            for (const action of candidateActions) {
                const capability = context.capabilityRegistry.getAgentAction(action.action_id);
                const suggestions = capability?.agentExposure?.optionalInputSuggestions || {};
                for (const [field, message] of Object.entries(suggestions)) {
                    if (!Object.prototype.hasOwnProperty.call(action.params, field) && String(message || '').trim()) {
                        recommendation = [recommendation, String(message).trim()].filter(Boolean).join('\n');
                    }
                }
            }
        }

        const envelope = {
            version: '1.0',
            conversation_id: conversationId,
            message_id: messageId,
            route,
            actions: route === 'agent' ? actions.map((action, index) => ({
                id: String(action?.id || `inv_${index + 1}`).trim(),
                action_id: String(action?.action_id || '').trim(),
                params: action?.params && typeof action.params === 'object' && !Array.isArray(action.params) ? action.params : {},
                reason: String(action?.reason || '').trim()
            })) : [],
            meta: parsed?.meta && typeof parsed.meta === 'object' ? parsed.meta : {},
            reply: {
                text: String(reply.text || '').trim(),
                recommendation
            }
        };
        logger.info?.(`[AgentParser] decision route=${envelope.route} actions=${envelope.actions.map((action) => action.action_id).join(',') || 'none'}${envelope.route === 'unsupported' ? ' decision=model_unsupported' : ''}`);
        return envelope;
    } catch (error) {
        logger.debug(`[AgentParser] JSON parse failed: ${error.message} raw=${jsonText.slice(0, 300)}`);
        return buildEnvelope(conversationId, messageId, []);
    }
}

module.exports = {
    routeTelegramMessage,
    tryParseDeterministicEnvelope,
    listAgentActions,
    matchUserRuleEnvelope
};
