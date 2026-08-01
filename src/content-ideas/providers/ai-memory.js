const Utils = require('../../utils');

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
        if (depth === 0) return text.slice(start, index + 1).trim();
    }

    return '';
}

function buildFallbackIdeas(input = {}, context = {}) {
    const query = String(input.query || '').trim();
    const preferences = Array.isArray(context?.memory?.preferences) ? context.memory.preferences : [];
    const recentArtifacts = Array.isArray(context?.memory?.recent_artifacts) ? context.memory.recent_artifacts : [];
    const ideas = [];

    const trendsTimePref = preferences.find((item) => item.name === 'preferred_trends_collect_time');
    if (query) {
        ideas.push({
            title: `${query} 관점에서 바로 써볼 수 있는 글`,
            summary: `${query}와 관련된 실전형 팁이나 경험 정리를 중심으로 짧게 정리하는 글감입니다.`,
            reason: '사용자 요청에 직접 포함된 주제를 우선 반영했습니다.',
            keywords: [query],
            source: 'fallback'
        });
    }
    if (trendsTimePref?.value?.time) {
        ideas.push({
            title: `${trendsTimePref.value.time} 트렌드 수집 결과를 엮은 요약형 글`,
            summary: '최근 선호 시간대의 트렌드 수집 결과를 바탕으로 핵심 이슈를 정리하는 글감입니다.',
            reason: '저장된 트렌드 수집 선호 시간을 반영했습니다.',
            keywords: ['트렌드', trendsTimePref.value.time],
            source: 'fallback'
        });
    }

    if (ideas.length === 0) {
        ideas.push({
            title: '최근 작업 패턴을 바탕으로 한 운영형 콘텐츠 정리',
            summary: '최근 설정 변경과 작업 실행을 정리해 운영 노하우를 공유하는 글감입니다.',
            reason: '현재 기억에서 뚜렷한 주제 신호가 부족해 운영형 아이디어를 제안합니다.',
            keywords: ['운영', '자동화'],
            source: 'fallback'
        });
    }

    const recentTitles = new Set(recentArtifacts.map((item) => String(item?.title || '').trim().toLowerCase()).filter(Boolean));
    return ideas.filter((item) => !recentTitles.has(String(item?.title || '').trim().toLowerCase()));
}

function normalizeIdeas(rawIdeas = []) {
    return rawIdeas.map((item, index) => ({
        id: `idea_${Date.now()}_${index + 1}`,
        title: String(item?.title || '').trim(),
        summary: String(item?.summary || '').trim(),
        reason: String(item?.reason || '').trim(),
        keywords: Array.isArray(item?.keywords) ? item.keywords.map((keyword) => String(keyword || '').trim()).filter(Boolean) : [],
        source: String(item?.source || 'memory_ai').trim()
    })).filter((item) => item.title);
}

function removeRepeatedIdeas(ideas = [], context = {}, query = '') {
    const recentArtifacts = Array.isArray(context?.memory?.recent_artifacts) ? context.memory.recent_artifacts : [];
    const recentTitles = new Set(recentArtifacts.map((item) => String(item?.title || '').trim().toLowerCase()).filter(Boolean));
    const normalizedQuery = String(query || '').trim().toLowerCase();

    const filtered = ideas.filter((item) => {
        const title = String(item?.title || '').trim().toLowerCase();
        if (!title) return false;
        if (recentTitles.has(title)) return false;
        return true;
    });

    if (filtered.length > 0) return filtered;

    return ideas.filter((item) => {
        const title = String(item?.title || '').trim().toLowerCase();
        if (!title) return false;
        if (recentTitles.has(title) && normalizedQuery && title.includes(normalizedQuery)) return true;
        return !recentTitles.has(title);
    });
}

function applyArtifactFeedback(ideas = [], context = {}) {
    const preferences = Array.isArray(context?.memory?.preferences) ? context.memory.preferences : [];
    const feedbackMap = new Map();
    preferences.forEach((item) => {
        const name = String(item?.name || '').trim();
        if (!name.startsWith('artifact_feedback.')) return;
        feedbackMap.set(name.replace(/^artifact_feedback\./, ''), item.value || {});
    });

    return ideas.filter((idea) => {
        const title = String(idea?.title || '').trim();
        if (!title) return false;
        const feedback = feedbackMap.get(title);
        if (!feedback || typeof feedback !== 'object') return true;
        const helpful = Number(feedback.helpful_count || 0);
        const notHelpful = Number(feedback.not_helpful_count || 0);
        return notHelpful <= helpful;
    }).map((idea) => ({
        ...idea,
        feedback_key: String(idea?.title || '').trim()
    }));
}

function createAiMemoryContentIdeaProvider() {
    return {
        id: 'ai-memory-content-ideas',

        async generate(input = {}, context = {}) {
            const query = String(input.query || '').trim();
            const limit = Math.max(1, Math.min(5, Number(input.limit || 3)));
            const preferences = Array.isArray(context?.memory?.preferences) ? context.memory.preferences.slice(0, 6) : [];
            const recentActions = Array.isArray(context?.memory?.recent_actions) ? context.memory.recent_actions.slice(0, 5) : [];
            const recentSettingChanges = Array.isArray(context?.memory?.recent_setting_changes) ? context.memory.recent_setting_changes.slice(0, 5) : [];
            const recentArtifacts = Array.isArray(context?.memory?.recent_artifacts) ? context.memory.recent_artifacts.slice(0, 8) : [];
            const trendKnowledge = Array.isArray(context?.knowledge)
                ? context.knowledge
                    .filter((entry) => String(entry?.kind || '').trim() === 'trends')
                    .flatMap((entry) => Array.isArray(entry.items) ? entry.items : [])
                    .slice(0, 8)
                : [];

            const prompt = `당신은 블로그 글감 추천기입니다.
사용자 요청과 현재 기억을 바탕으로 한국어 글감 아이디어를 JSON으로만 반환하세요.

[목표]
- 사용자가 바로 글로 발전시킬 수 있는 실용적인 글감 추천
- 너무 일반적인 운영 추천 금지
- AI 모델 설정 자체를 글감으로 추천하는 운영 조언 금지
- 최근 이미 추천한 제목과 같은 제목 반복 금지
- 제목은 구체적이고, summary는 1~2문장
- ideas는 정확히 ${limit}개 이하

[출력 형식]
{
  "ideas": [
    {
      "title": "구체적인 글감 제목",
      "summary": "어떤 관점으로 풀어쓸지 짧은 설명",
      "reason": "왜 이 글감을 추천하는지",
      "keywords": ["키워드1", "키워드2"]
    }
  ]
}

[사용자 요청]
${query || '새로운 글감 추천'}

[선호 요약]
${preferences.length > 0 ? preferences.map((item) => `- ${item.name}: ${JSON.stringify(item.value)}`).join('\n') : '- 없음'}

[최근 action]
${recentActions.length > 0 ? recentActions.map((item) => `- ${item.domain}.${item.name}`).join('\n') : '- 없음'}

[최근 설정 변경]
${recentSettingChanges.length > 0 ? recentSettingChanges.map((item) => `- ${item.setting_key}: ${JSON.stringify(item.after)}`).join('\n') : '- 없음'}

[최근 추천된 글감]
${recentArtifacts.length > 0 ? recentArtifacts.map((item) => `- ${item.title}: ${String(item.summary || '').slice(0, 100)}`).join('\n') : '- 없음'}

[외부 트렌드 신호]
${trendKnowledge.length > 0 ? trendKnowledge.map((item) => `- ${item.title}: ${String(item.summary || '').slice(0, 100)}`).join('\n') : '- 없음'}`;

            try {
                const raw = await Utils.callChatText(prompt, 3, {
                    usageLabel: 'Agent Content Idea AI'
                });
                const jsonText = extractFirstJsonObject(raw);
                if (!jsonText) {
                    return { ideas: applyArtifactFeedback(removeRepeatedIdeas(normalizeIdeas(buildFallbackIdeas(input, context)), context, query), context).slice(0, limit) };
                }
                const parsed = JSON.parse(jsonText);
                const ideas = Array.isArray(parsed?.ideas) ? parsed.ideas : [];
                if (ideas.length === 0) {
                    return { ideas: applyArtifactFeedback(removeRepeatedIdeas(normalizeIdeas(buildFallbackIdeas(input, context)), context, query), context).slice(0, limit) };
                }
                return {
                    ideas: applyArtifactFeedback(removeRepeatedIdeas(normalizeIdeas(ideas), context, query), context).slice(0, limit)
                };
            } catch (_error) {
                return { ideas: applyArtifactFeedback(removeRepeatedIdeas(normalizeIdeas(buildFallbackIdeas(input, context)), context, query), context).slice(0, limit) };
            }
        }
    };
}

module.exports = {
    createAiMemoryContentIdeaProvider
};
