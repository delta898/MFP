const Utils = require('../../utils');
const Logger = require('../../logger');

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
    const candidates = Array.isArray(context?.recommendationCandidates) ? context.recommendationCandidates : [];

    for (const candidate of candidates.slice(0, 5)) {
        const topicSeed = String(candidate?.topic_seed || '').trim();
        if (!topicSeed) continue;
        ideas.push({
            title: `${topicSeed} 관련해서 지금 정리해볼 핵심 포인트`,
            summary: `${topicSeed} 관련 정보를 독자가 바로 활용할 수 있는 경험과 실전 팁 중심으로 풀어내는 글감입니다.`,
            reason: String(candidate?.explanation || '사용자 기억과 최신 지식 근거를 반영했습니다.'),
            keywords: [topicSeed],
            source: 'candidate_fallback',
            candidate_id: String(candidate?.id || '').trim()
        });
    }

    const trendsTimePref = preferences.find((item) => item.name === 'preferred_trends_collect_time');
    if (query && ideas.length === 0) {
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
        source: String(item?.source || 'memory_ai').trim(),
        candidate_id: String(item?.candidate_id || '').trim()
    })).filter((item) => item.title);
}

function buildContentIdeaResponseSchema(candidates = []) {
    const candidateIds = candidates.map((candidate) => String(candidate?.id || '').trim()).filter(Boolean);
    if (candidateIds.length === 0) return null;

    return {
        type: 'object',
        additionalProperties: false,
        required: ['ideas'],
        properties: {
            ideas: {
                type: 'array',
                minItems: candidateIds.length,
                maxItems: candidateIds.length,
                items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['candidate_id', 'title', 'summary', 'keywords'],
                    properties: {
                        candidate_id: { type: 'string', enum: candidateIds },
                        title: { type: 'string' },
                        summary: { type: 'string' },
                        keywords: {
                            type: 'array',
                            minItems: 2,
                            maxItems: 3,
                            items: { type: 'string' }
                        }
                    }
                }
            }
        }
    };
}

function keepIdeasWithinCandidates(ideas = [], candidates = [], input = {}, context = {}) {
    const allowedCandidates = Array.isArray(candidates) ? candidates : [];
    if (allowedCandidates.length === 0) return ideas;
    const allowedIds = new Set(allowedCandidates.map((candidate) => String(candidate?.id || '').trim()).filter(Boolean));
    const accepted = ideas.filter((idea) => idea.candidate_id && allowedIds.has(idea.candidate_id));
    const acceptedIds = new Set(accepted.map((idea) => idea.candidate_id));
    const missingCandidates = allowedCandidates.filter((candidate) => !acceptedIds.has(String(candidate?.id || '').trim()));
    if (missingCandidates.length === 0) return accepted;

    const fallbackIdeas = normalizeIdeas(buildFallbackIdeas(input, {
        ...context,
        recommendationCandidates: missingCandidates
    }));
    return [...accepted, ...fallbackIdeas];
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
            const recommendationCandidates = Array.isArray(context?.recommendationCandidates)
                ? context.recommendationCandidates.slice(0, limit)
                : [];
            const selectedCandidates = recommendationCandidates.filter((candidate) => String(candidate?.id || '').trim());
            const responseSchema = buildContentIdeaResponseSchema(selectedCandidates);

            const prompt = `당신은 블로그 글감 문구 편집기입니다.
주제 선택은 프로그램이 이미 끝냈습니다. 후보를 추가, 교체, 병합하거나 순서를 바꾸지 마세요.

각 후보마다 정확히 한 개씩 한국어 글감 문구를 작성하세요.
- candidate_id는 입력값을 그대로 한 번씩 사용
- title: 24~52자, 구체적인 블로그 제목
- summary: 한 문장, 90자 이내
- keywords: 2~3개
- 제공된 문맥과 다른 동음이의어, 인물, 작품, 브랜드 또는 제품으로 주제를 바꾸지 않기
- 자연스러운 한국어만 사용하고 '을(를)' 같은 placeholder는 사용 금지
- JSON 외의 텍스트와 Markdown은 금지

[선택된 후보]
${selectedCandidates.length > 0 ? selectedCandidates.map((item) => `- id=${item.id} | 주제=${item.topic_seed} | 문맥=${item.semantic_context || '추가 문맥 없음'}`).join('\n') : `- id 없음 | 주제=${query || '새 글감'}`}`;

            const buildFallbackResult = (reason) => {
                const ideas = applyArtifactFeedback(
                    removeRepeatedIdeas(normalizeIdeas(buildFallbackIdeas(input, context)), context, query),
                    context
                ).slice(0, limit);
                Logger.warn(`⚠️ [Agent Content Idea AI] 기본 추천으로 전환 (${reason}, ${ideas.length}건)`);
                return { ideas };
            };

            try {
                // Interactive recommendations should fall back quickly when the provider is rate-limited.
                const raw = await Utils.callChatText(prompt, 1, {
                    usageLabel: 'Agent Content Idea AI',
                    maxTokens: 1024,
                    temperature: 0.4,
                    responseMimeType: 'application/json',
                    responseJsonSchema: responseSchema,
                    reasoningEffort: 'minimal',
                    logTokenUsage: true
                });
                const jsonText = extractFirstJsonObject(raw);
                if (!jsonText) {
                    return buildFallbackResult('JSON 응답 없음');
                }
                const parsed = JSON.parse(jsonText);
                const ideas = Array.isArray(parsed?.ideas) ? parsed.ideas : [];
                if (ideas.length === 0) {
                    return buildFallbackResult('추천 결과 없음');
                }
                const candidateBoundIdeas = keepIdeasWithinCandidates(
                    normalizeIdeas(ideas),
                    recommendationCandidates,
                    input,
                    context
                );
                const normalizedIdeas = applyArtifactFeedback(removeRepeatedIdeas(candidateBoundIdeas, context, query), context).slice(0, limit);
                Logger.info(`✅ [Agent Content Idea AI] 글감 추천 완료 (${normalizedIdeas.length}건)`);
                return { ideas: normalizedIdeas };
            } catch (error) {
                return buildFallbackResult(`AI 호출 실패: ${String(error?.message || '알 수 없는 오류').slice(0, 120)}`);
            }
        }
    };
}

module.exports = {
    createAiMemoryContentIdeaProvider
};
