'use strict';

const { matchesExplicitTopic } = require('../../../services/recommendations/topic-candidate-generator');

const FALLBACK_ANGLES = Object.freeze([
    '시작 전에 알아둘 핵심 정보',
    '일정과 비용을 계획하는 현실적인 방법',
    '실제 경험에서 얻을 수 있는 팁과 주의점',
    '초보자가 놓치기 쉬운 선택 기준',
    '상황별로 비교해 볼 만한 방법'
]);

function createTopicConstrainedFallbackIdea(candidate = {}, index = 0) {
    const topic = String(candidate.topic_seed || '').trim();
    if (!topic) return null;
    const angleIndex = Math.max(0, Number(index) || 0) % FALLBACK_ANGLES.length;
    return {
        id: `idea_${Date.now()}_${angleIndex + 1}`,
        title: `${topic} ${FALLBACK_ANGLES[angleIndex]}`,
        summary: `${topic}을 중심으로 독자가 바로 활용할 수 있는 내용을 정리합니다.`,
        reason: String(candidate.explanation || '사용자가 명시한 주제를 그대로 반영했습니다.'),
        keywords: topic.split(/\s+/u).filter(Boolean).slice(0, 3),
        source: 'topic_constraint_fallback',
        candidate_id: String(candidate.id || '').trim()
    };
}

function enforceTopicConstraint(ideas = [], candidates = [], topic = '', limit = 3) {
    const normalizedTopic = String(topic || '').trim();
    if (!normalizedTopic) return Array.isArray(ideas) ? ideas.slice(0, limit) : [];

    const candidateList = Array.isArray(candidates) ? candidates : [];
    const candidatesById = new Map(candidateList.map((candidate) => [String(candidate?.id || '').trim(), candidate]));
    const accepted = [];
    const usedCandidateIds = new Set();
    const usedTitles = new Set();
    for (const idea of Array.isArray(ideas) ? ideas : []) {
        const candidateId = String(idea?.candidate_id || '').trim();
        const title = String(idea?.title || '').trim();
        const titleKey = title.toLocaleLowerCase('ko-KR');
        if (!candidatesById.has(candidateId)
            || !matchesExplicitTopic(title, normalizedTopic)
            || usedCandidateIds.has(candidateId)
            || usedTitles.has(titleKey)) continue;
        accepted.push(idea);
        usedCandidateIds.add(candidateId);
        usedTitles.add(titleKey);
        if (accepted.length >= limit) return accepted;
    }

    for (let index = 0; index < candidateList.length && accepted.length < limit; index += 1) {
        const candidate = candidateList[index];
        const candidateId = String(candidate?.id || '').trim();
        if (!candidateId || usedCandidateIds.has(candidateId)) continue;
        const fallback = createTopicConstrainedFallbackIdea(candidate, index);
        const titleKey = String(fallback?.title || '').toLocaleLowerCase('ko-KR');
        if (!fallback || usedTitles.has(titleKey) || !matchesExplicitTopic(fallback.title, normalizedTopic)) continue;
        accepted.push(fallback);
        usedCandidateIds.add(candidateId);
        usedTitles.add(titleKey);
    }
    return accepted;
}

module.exports = { createTopicConstrainedFallbackIdea, enforceTopicConstraint };
