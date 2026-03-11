const Logger = require('../logger');
const Utils = require('../utils');

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

async function parseTelegramAgentEnvelope(messageText, context = {}) {
    const conversationId = String(context.conversationId || '').trim();
    const messageId = String(context.messageId || '').trim();
    const recentEvents = Array.isArray(context.memory?.recent_events) ? context.memory.recent_events.slice(0, 6) : [];
    const recentMessages = Array.isArray(context.memory?.recent_messages) ? context.memory.recent_messages.slice(0, 4) : [];
    const recentActions = Array.isArray(context.memory?.recent_actions) ? context.memory.recent_actions.slice(0, 4) : [];
    const recentSettingChanges = Array.isArray(context.memory?.recent_setting_changes) ? context.memory.recent_setting_changes.slice(0, 4) : [];
    const preferences = Array.isArray(context.memory?.preferences) ? context.memory.preferences.slice(0, 5) : [];
    const pendingConfirmations = Array.isArray(context.memory?.pending_confirmations) ? context.memory.pending_confirmations.slice(0, 3) : [];

    const prompt = `당신은 블로그 자동화 시스템의 Agent Control Parser 입니다.
사용자 메시지를 아래 capability 범위 안에서만 해석해 action envelope JSON으로 반환하세요.

[허용 capability]
1. agent.pending.get
2. agent.preferences.get_summary
3. agent.suggestions.get
4. content.idea.suggest
5. jobs.trends.run_collect
6. settings.trends.get_time
7. settings.trends.set_time
8. settings.trends.get_categories
9. settings.trends.add_category
10. settings.trends.remove_category
11. settings.blog_auto.get_enabled
12. settings.blog_auto.set_enabled
13. settings.blog_auto.get_time_window
14. settings.blog_auto.set_time_window
15. settings.telegram.get_chat_ai_mode
16. settings.telegram.set_chat_ai_mode
17. settings.custom_ai.get_summary

[액션 매핑 규칙]
- 확인 대기 요청 조회는 type: "agent.query"
- 조회는 type: "setting.query"
- 변경은 type: "setting.update"
- 작업 실행은 type: "job.run"
- 글감 추천은 type: "content.generate"
- domain / name은 capability 이름에 맞춰 정확히 작성
- 확인이 필요한 변경은 requires_confirmation 값을 비워도 됨. 시스템이 보정함.
- 지원 범위를 벗어나면 actions는 빈 배열 [] 로 반환

[파라미터 규칙]
- 시간은 반드시 "HH:MM"
- 블로그 자동 포스팅 시간대 변경은 params에 { "start_time": "09:00", "end_time": "18:00" }
- Telegram 채팅 AI 변경은 params에 { "mode": "default" | "custom" }
- 카테고리 추가/삭제는 params에 { "category": "..." }
- 활성화 변경은 params에 { "enabled": true | false }
- "지금 바꾸려는 설정이 뭐였지", "확인 대기 중인 요청 뭐야" 같은 질의는 agent.pending.get 으로 해석
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
  "actions": [
    {
      "id": "act_1",
      "type": "agent.query | setting.query | setting.update | job.run | content.generate",
      "domain": "agent.pending | agent.preferences | agent.suggestions | content.idea | jobs.trends | settings.trends | settings.blog_auto | settings.telegram | settings.custom_ai",
      "name": "get | get_summary | suggest | run_collect | get_time | set_time | get_categories | add_category | remove_category | get_enabled | set_enabled | get_time_window | set_time_window | get_chat_ai_mode | set_chat_ai_mode",
      "params": {},
      "reason": "간단한 한국어 설명"
    }
  ]
}

[사용자 메시지]
${messageText}`;

    Logger.debug('🧠 [AgentParser] Telegram agent action parsing...');
    const rawResult = await Utils.callTelegramChatModel(prompt);
    if (!rawResult) return { version: '1.0', conversation_id: conversationId, message_id: messageId, actions: [] };

    const jsonText = extractFirstJsonObject(rawResult);
    if (!jsonText) {
        Logger.debug(`[AgentParser] JSON object not found. raw=${String(rawResult).slice(0, 300)}`);
        return { version: '1.0', conversation_id: conversationId, message_id: messageId, actions: [] };
    }

    try {
        return JSON.parse(jsonText);
    } catch (error) {
        Logger.debug(`[AgentParser] JSON parse failed: ${error.message} raw=${jsonText.slice(0, 300)}`);
        return { version: '1.0', conversation_id: conversationId, message_id: messageId, actions: [] };
    }
}

module.exports = {
    parseTelegramAgentEnvelope
};
