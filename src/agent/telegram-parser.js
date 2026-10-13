function buildEnvelope(conversationId, messageId, actions = []) {
    return {
        version: '1.0',
        conversation_id: conversationId,
        message_id: messageId,
        route: actions.length > 0 ? 'agent' : 'unsupported',
        actions,
        legacy_actions: [],
        meta: {},
        reply: { text: '', suggestion: '' }
    };
}

function normalizeText(raw) {
    return String(raw || '').trim();
}

function extractStrictTime(raw) {
    const text = normalizeText(raw);
    const match = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    if (!match) return '';
    return `${String(match[1]).padStart(2, '0')}:${match[2]}`;
}

function extractStrictTimeWindow(raw) {
    const text = normalizeText(raw);
    const match = text.match(/([01]?\d|2[0-3]):([0-5]\d)\s*[~\-]\s*([01]?\d|2[0-3]):([0-5]\d)/);
    if (!match) return null;
    return {
        start_time: `${String(match[1]).padStart(2, '0')}:${match[2]}`,
        end_time: `${String(match[3]).padStart(2, '0')}:${match[4]}`
    };
}

function tryParseDeterministicEnvelope(messageText, context = {}) {
    const text = normalizeText(messageText);
    const lower = text.toLowerCase();
    const conversationId = String(context.conversationId || '').trim();
    const messageId = String(context.messageId || '').trim();
    const pendingConfirmations = Array.isArray(context.memory?.pending_confirmations) ? context.memory.pending_confirmations : [];

    if (pendingConfirmations.length > 0
        && /(그거|그것|아까|방금|지금 대기|대기 중인|확인 대기)/.test(text)
        && /(적용|승인|진행)/.test(text)) {
        return buildEnvelope(conversationId, messageId, [{
            id: 'act_1',
            type: 'agent.command',
            domain: 'agent.pending',
            name: 'apply_latest',
            params: {},
            reason: '가장 최근 확인 대기 중인 요청 적용'
        }]);
    }

    if (pendingConfirmations.length > 0
        && /(그거|그것|아까|방금|지금 대기|대기 중인|확인 대기)/.test(text)
        && /(취소|거절|중단)/.test(text)) {
        return buildEnvelope(conversationId, messageId, [{
            id: 'act_1',
            type: 'agent.command',
            domain: 'agent.pending',
            name: 'reject_latest',
            params: {},
            reason: '가장 최근 확인 대기 중인 요청 취소'
        }]);
    }

    if (/(너 누구|넌 누구|뭐하는 봇|뭐하는 에이전트|정체가 뭐)/.test(text)) {
        return buildEnvelope(conversationId, messageId, [{
            id: 'act_1',
            type: 'agent.query',
            domain: 'agent.meta',
            name: 'get_identity',
            params: {},
            reason: 'Agent 정체성과 역할 안내'
        }]);
    }

    const isHelpLike = /(사용법|사용 방법|어떻게 써|어떻게 사용|가이드|도움말)/.test(text);
    const looksLikeContentCommand = /(주제|글감|추가|등록|발행|추천|써줘|작성|포스팅)/.test(text);
    if (isHelpLike && !looksLikeContentCommand) {
        return buildEnvelope(conversationId, messageId, [{
            id: 'act_1',
            type: 'agent.query',
            domain: 'agent.meta',
            name: 'get_help',
            params: {},
            reason: 'Agent 사용법 안내'
        }]);
    }

    if ((/(지금|현재)/.test(text) && /(몇시|시간)/.test(text))
        && !/트렌드 수집 시간|트렌드 수집시간|자동 블로그 포스팅 시간대|블로그 자동 포스팅 시간대/.test(text)) {
        return buildEnvelope(conversationId, messageId, [{
            id: 'act_1',
            type: 'agent.query',
            domain: 'agent.meta',
            name: 'get_current_time',
            params: {},
            reason: '현재 시각 확인'
        }]);
    }

    if ((lower.includes('트렌드 수집 시간') || lower.includes('트렌드 수집시간'))
        && /(바꿔|변경|설정)/.test(text)) {
        const time = extractStrictTime(text);
        if (time) {
            return buildEnvelope(conversationId, messageId, [{
                id: 'act_1',
                type: 'setting.update',
                domain: 'settings.trends',
                name: 'set_time',
                params: { time },
                reason: `트렌드 수집 시간을 ${time}로 변경`
            }]);
        }
    }

    if ((lower.includes('자동 블로그 포스팅 시간대') || lower.includes('블로그 자동 포스팅 시간대') || lower.includes('블로그 자동 포스팅 시간대를'))
        && /(바꿔|변경|설정)/.test(text)) {
        const window = extractStrictTimeWindow(text);
        if (window) {
            return buildEnvelope(conversationId, messageId, [{
                id: 'act_1',
                type: 'setting.update',
                domain: 'settings.blog_auto',
                name: 'set_time_window',
                params: window,
                reason: `블로그 자동 포스팅 허용 시간대를 ${window.start_time}~${window.end_time}로 변경`
            }]);
        }
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

const LEGACY_ACTIONS = new Set([
    'register_topic',
    'publish_article',
    'update_config',
    'run_job',
    'query_data'
]);
const LEGACY_CONFIG_KEYS = new Set([
    'PUBLISH_AUTO_INTERVAL_MIN',
    'PUBLISH_AUTO_ENABLED',
    'PUBLISH_AUTO_HEADLESS',
    'image_gen',
    'NAVER_ID',
    'TYPING_SPEED'
]);
const LEGACY_JOB_NAMES = new Set(['trends', 'rss', 'shopping', 'publish']);
const LEGACY_QUERY_TYPES = new Set(['status', 'system', 'topics', 'shopping', 'stats', 'insight']);

function normalizeLegacyActions(actions) {
    if (!Array.isArray(actions) || actions.length === 0) return [];
    return actions.map((item) => {
        const action = String(item?.action || '').trim();
        if (!LEGACY_ACTIONS.has(action) || !item?.params || typeof item.params !== 'object' || Array.isArray(item.params)) {
            return null;
        }
        const params = item.params;
        if (action === 'register_topic' && !String(params.theme || '').trim()) return null;
        if (action === 'publish_article'
            && params.target !== undefined
            && !['all', 'naver', 'wordpress'].includes(String(params.target).trim().toLowerCase())) return null;
        if (action === 'update_config') {
            const updates = params.config_updates;
            if (!updates || typeof updates !== 'object' || Array.isArray(updates)) return null;
            if (Object.keys(updates).length === 0 || Object.keys(updates).some((key) => !LEGACY_CONFIG_KEYS.has(key))) return null;
        }
        if (action === 'run_job' && !LEGACY_JOB_NAMES.has(String(params.job_name || '').trim().toLowerCase())) return null;
        if (action === 'query_data' && !LEGACY_QUERY_TYPES.has(String(params.query_type || '').trim().toLowerCase())) return null;
        return { action, params };
    });
}

async function routeTelegramMessage(messageText, context = {}) {
    const conversationId = String(context.conversationId || '').trim();
    const messageId = String(context.messageId || '').trim();
    const logger = context.logger || require('../logger');
    const utils = context.modelCaller ? null : require('../utils');
    const modelCaller = context.modelCaller || utils.callTelegramChatModel.bind(utils);
    const deterministic = tryParseDeterministicEnvelope(messageText, context);
    if (deterministic) {
        return deterministic;
    }
    const recentEvents = Array.isArray(context.memory?.recent_events) ? context.memory.recent_events.slice(0, 6) : [];
    const recentMessages = Array.isArray(context.memory?.recent_messages) ? context.memory.recent_messages.slice(0, 4) : [];
    const recentActions = Array.isArray(context.memory?.recent_actions) ? context.memory.recent_actions.slice(0, 4) : [];
    const recentSettingChanges = Array.isArray(context.memory?.recent_setting_changes) ? context.memory.recent_setting_changes.slice(0, 4) : [];
    const preferences = Array.isArray(context.memory?.preferences) ? context.memory.preferences.slice(0, 5) : [];
    const pendingConfirmations = Array.isArray(context.memory?.pending_confirmations) ? context.memory.pending_confirmations.slice(0, 3) : [];

    const prompt = `당신은 BlogGenius의 Telegram 대화 라우터입니다.
사용자 메시지에 직접 답하거나, 아래 Agent capability 또는 legacy 호환 작업으로 연결하세요. 키워드만 맞춘 기계적 분기 대신 문맥과 사용자의 의도를 해석하세요.

[허용 capability]
1. agent.pending.get
2. agent.pending.apply_latest
3. agent.pending.reject_latest
4. agent.meta.get_help
5. agent.meta.get_identity
6. agent.meta.get_current_time
7. agent.preferences.get_summary
8. agent.suggestions.get
9. content.idea.suggest
10. jobs.trends.run_collect
11. settings.trends.get_time
12. settings.trends.set_time
13. settings.trends.get_categories
14. settings.trends.add_category
15. settings.trends.remove_category
16. settings.blog_auto.get_enabled
17. settings.blog_auto.set_enabled
18. settings.blog_auto.get_time_window
19. settings.blog_auto.set_time_window
20. settings.chat_model.get_summary

[Legacy 호환 작업]
아래 기능은 기존 사용자의 흐름을 유지하기 위한 실행 경로입니다. 새 권한을 만들지 말고, 요청이 이들 중 하나에 해당할 때만 legacy_actions를 사용하세요.
1. register_topic: params { theme, keywords?, platforms?, options? }
2. publish_article: params { target?: "all" | "naver" | "wordpress", targetRowIndices?: number[] }
3. update_config: params { config_updates: { "PUBLISH_AUTO_INTERVAL_MIN" | "PUBLISH_AUTO_ENABLED" | "PUBLISH_AUTO_HEADLESS" | "image_gen" | "NAVER_ID" | "TYPING_SPEED": value } }; 위 목록 외 설정 키는 사용하지 않습니다.
4. run_job: params { job_name: "trends" | "rss" | "shopping" | "publish" }
5. query_data: params { query_type: "status" | "system" | "topics" | "shopping" | "stats" | "insight", query_params?: {} }

[Legacy action 해석 기준]
- 사용자가 글감/주제를 시트에 저장해 달라고 하면 register_topic을 선택합니다. theme은 사용자가 말한 주제를 보존하고, keywords/platforms/options는 사용자가 명시한 경우에만 채웁니다.
- 사용자가 특정 행 또는 새 주제를 블로그에 올려 달라고 하면 publish_article을 선택합니다. 새 글을 등록한 뒤 발행까지 명시했다면 register_topic과 publish_article을 함께 반환합니다.
- “저장만” 요청은 발행을 포함하지 않습니다. 사용자가 직접 말하지 않은 플랫폼, 카테고리, 게시 상태를 임의로 지정하지 않습니다.
- update_config는 사용자가 설정 변경을 명시했을 때만 사용합니다. 모든 설정 변경은 기존 확인 절차를 거칩니다.
- run_job과 query_data는 각각 작업 실행과 조회 요청에만 사용하고, 질의형 일반 대화를 작업으로 바꾸지 않습니다.

[액션 매핑 규칙]
- 확인 대기 요청 조회는 type: "agent.query"
- 확인 대기 요청 적용/취소는 type: "agent.command"
- 조회는 type: "setting.query"
- 변경은 type: "setting.update"
- 작업 실행은 type: "job.run"
- 글감 추천은 type: "content.generate"
- domain / name은 capability 이름에 맞춰 정확히 작성
- 확인이 필요한 변경은 requires_confirmation 값을 비워도 됨. 시스템이 보정함.
- Agent 지원 범위를 벗어나면 actions는 빈 배열 [] 로 반환

[라우트 선택]
- BlogGenius 기능 실행은 route="agent"와 actions 또는 route="legacy"와 legacy_actions 중 하나로 반환하세요.
- 사용자의 일반 질문, 인사, 의견 교환, 설명 요청은 route="reply"로 직접 답하세요. 실행 action을 추측하지 마세요.
- 기능 실행이 불가능하거나 요청이 불명확하면 route="unsupported"로 현재 가능한 범위와 다음 선택지를 자연스럽게 설명하세요.
- 직접 답변만 있을 때 reply의 text에 답을 넣습니다. 실행 요청에도 도움이 되는 짧은 설명을 붙일 수 있습니다.
- 요청한 일에 먼저 답한 뒤, 더 나은 방법이 실제로 도움이 될 때만 reply의 suggestion에 이유와 함께 제안을 씁니다. 제안은 실행하지 않으며, 요청을 대체하지 않습니다.
- legacy 동작을 기존 범위보다 넓히지 마세요. actions와 legacy_actions를 동시에 채우지 마세요.

[파라미터 규칙]
- 시간은 반드시 "HH:MM"
- 블로그 자동 포스팅 시간대 변경은 params에 { "start_time": "09:00", "end_time": "18:00" }
- 카테고리 추가/삭제는 params에 { "category": "..." }
- 활성화 변경은 params에 { "enabled": true | false }
- "지금 바꾸려는 설정이 뭐였지", "확인 대기 중인 요청 뭐야" 같은 질의는 agent.pending.get 으로 해석
- "그거 적용해", "그거 취소해", "아까 그거 적용", "방금 대기 중인 거 취소" 같은 질의는 agent.pending.apply_latest / agent.pending.reject_latest 로 해석
- "넌 누구니", "너 뭐하는 봇이야", "사용법이 어떻게 돼", "어떻게 써?", "지금 몇시야?" 같은 질의는 agent.meta.get_identity / agent.meta.get_help / agent.meta.get_current_time 로 해석
- "내 성향 알려줘", "내 선호 요약 보여줘", "내가 어떤 설정을 선호하는지 알려줘" 같은 질의는 agent.preferences.get_summary 로 해석
- "추천해줘", "지금 기준으로 추천할 것 있어?", "다음에 뭘 하면 좋을까?" 같은 질의는 agent.suggestions.get 으로 해석
- "글감 추천해줘", "새로운 글감 하나 추천해줄래?", "주제 아이디어 줘", "콘텐츠 아이디어 추천해줘" 같은 질의는 content.idea.suggest 로 해석
- 글감 추천은 params에 { "limit": 1~5, "query": "사용자 요청에서 추출한 주제나 원문" } 형태로 작성
- "트렌드 수집 시작해줘", "지금 트렌드 수집 실행해", "트렌드 지금 수집해줘" 같은 질의는 jobs.trends.run_collect 로 해석

[최근 메모리]
${recentEvents.length > 0 ? recentEvents.map((item) => {
    const payload = item.payload && typeof item.payload === 'object' ? JSON.stringify(item.payload).slice(0, 160) : '{}';
    return `- ${item.event_type}: ${payload}`;
}).join('\n') : '- 없음'}

[최근 메시지]
${recentMessages.length > 0 ? recentMessages.map((item) => `- [${item.role}] ${String(item.text || '').slice(0, 120)}`).join('\n') : '- 없음'}

[최근 action]
${recentActions.length > 0 ? recentActions.map((item) => `- ${item.domain}.${item.name} (${item.status})`).join('\n') : '- 없음'}

[최근 설정 변경]
${recentSettingChanges.length > 0 ? recentSettingChanges.map((item) => `- ${item.setting_key}: ${JSON.stringify(item.after).slice(0, 120)}`).join('\n') : '- 없음'}

[선호 요약]
${preferences.length > 0 ? preferences.map((item) => `- ${item.name}: ${JSON.stringify(item.value).slice(0, 120)} (confidence=${item.confidence.toFixed(2)}, evidence=${item.evidence_count})`).join('\n') : '- 없음'}

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
  "route": "agent | legacy | reply | unsupported",
  "actions": [
    {
      "id": "act_1",
      "type": "agent.query | agent.command | setting.query | setting.update | job.run | content.generate",
      "domain": "agent.pending | agent.meta | agent.preferences | agent.suggestions | content.idea | jobs.trends | settings.trends | settings.blog_auto | settings.chat_model",
      "name": "get | apply_latest | reject_latest | get_help | get_identity | get_current_time | get_summary | suggest | run_collect | get_time | set_time | get_categories | add_category | remove_category | get_enabled | set_enabled | get_time_window | set_time_window",
      "params": {},
      "reason": "간단한 한국어 설명"
    }
  ],
  "legacy_actions": [
    { "action": "register_topic | publish_article | update_config | run_job | query_data", "params": {} }
  ],
  "meta": { "explicit_params": [] },
  "reply": { "text": "직접 답변 또는 실행 전 설명", "suggestion": "선택적 제안; 없으면 빈 문자열" }
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
        const route = ['agent', 'legacy', 'reply', 'unsupported'].includes(parsed?.route)
            ? parsed.route
            : (Array.isArray(parsed?.actions) && parsed.actions.length > 0 ? 'agent' : 'unsupported');
        const actions = Array.isArray(parsed?.actions) ? parsed.actions : [];
        const legacyActions = normalizeLegacyActions(parsed?.legacy_actions);
        const reply = parsed?.reply && typeof parsed.reply === 'object' ? parsed.reply : {};

        if (route === 'agent' && actions.length === 0) return buildEnvelope(conversationId, messageId, []);
        if (route === 'legacy' && legacyActions.length === 0) return buildEnvelope(conversationId, messageId, []);
        if (route === 'agent' && legacyActions.length > 0) return buildEnvelope(conversationId, messageId, []);
        if (route === 'legacy' && actions.length > 0) return buildEnvelope(conversationId, messageId, []);
        if (route === 'legacy' && legacyActions.some((item) => !item)) return buildEnvelope(conversationId, messageId, []);
        if (route === 'reply' && (actions.length > 0 || legacyActions.length > 0)) return buildEnvelope(conversationId, messageId, []);
        if (route === 'unsupported' && (actions.length > 0 || legacyActions.length > 0)) return buildEnvelope(conversationId, messageId, []);

        return {
            version: '1.0',
            conversation_id: conversationId,
            message_id: messageId,
            route,
            actions: route === 'agent' ? actions : [],
            legacy_actions: route === 'legacy' ? legacyActions : [],
            meta: parsed?.meta && typeof parsed.meta === 'object' ? parsed.meta : {},
            reply: {
                text: String(reply.text || '').trim(),
                suggestion: String(reply.suggestion || '').trim()
            }
        };
    } catch (error) {
        logger.debug(`[AgentParser] JSON parse failed: ${error.message} raw=${jsonText.slice(0, 300)}`);
        return buildEnvelope(conversationId, messageId, []);
    }
}

module.exports = {
    routeTelegramMessage,
    tryParseDeterministicEnvelope
};
