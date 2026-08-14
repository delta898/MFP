const test = require('node:test');
const assert = require('node:assert/strict');
const {
    rankTopicCandidates,
    scoreCandidate,
    similarity
} = require('./topic-ranking-policy');

const NOW = new Date('2026-08-15T00:00:00.000Z');

function candidate(id, topicSeed, overrides = {}) {
    return {
        id,
        candidate_type: 'profile_seed',
        topic_seed: topicSeed,
        evidence_features: {},
        owner_matches: { keywords: [], categories: [] },
        trend: null,
        ...overrides
    };
}

test('keeps an explicit request first and exposes its score evidence', () => {
    const result = rankTopicCandidates({
        now: NOW,
        candidates: [
            candidate('profile', '오라클 클라우드', {
                evidence_features: { owner_keyword_evidence: 12 }
            }),
            candidate('request', '오늘 요청한 글감', {
                candidate_type: 'request_seed',
                evidence_features: { explicit_request: true }
            })
        ]
    });

    assert.equal(result.selected[0].id, 'request');
    assert.equal(result.selected[0].ranking.rank, 1);
    assert.equal(result.selected[0].ranking.breakdown[0].code, 'explicit_request');
});

test('combines owner evidence with fresh trend evidence without hiding the breakdown', () => {
    const strong = candidate('strong', 'AI 검색 트렌드', {
        candidate_type: 'trend_seed',
        evidence_features: { owner_keyword_evidence: 3, owner_category_evidence: 2 },
        trend: {
            categories: ['IT·컴퓨터'],
            trend_date: '2026-08-14',
            change_type: 'up',
            change_amount: 7
        }
    });
    const weak = candidate('weak', '일반 생활 기록', {
        evidence_features: { owner_keyword_evidence: 1 }
    });
    const result = rankTopicCandidates({ candidates: [weak, strong], now: NOW });

    assert.equal(result.selected[0].id, 'strong');
    assert.deepEqual(
        result.selected[0].ranking.breakdown.map((item) => item.code),
        ['owner_keyword_frequency', 'owner_category_frequency', 'trend_freshness', 'trend_momentum']
    );
});

test('applies explicit negative feedback as a replaceable ranking signal', () => {
    const scored = scoreCandidate(candidate('feedback', '홈서버 워드프레스'), {
        now: NOW,
        ownerProfile: {
            feedback: {
                recent: [{ subject: '홈서버 워드프레스', feedback: 'not_helpful' }]
            }
        }
    });

    assert.equal(scored.score, -18);
    assert.equal(scored.breakdown[0].code, 'negative_feedback');
});

test('matches recommendation feedback by candidate id when the generated title changed', () => {
    const scored = scoreCandidate(candidate('candidate-1', '무료 홈서버'), {
        ownerProfile: {
            feedback: {
                recent: [{
                    subject: '노트북으로 만드는 공짜 서버',
                    feedback: 'helpful',
                    recommendation: { candidate_id: 'candidate-1' }
                }]
            }
        }
    });

    assert.equal(scored.score, 12);
    assert.equal(scored.breakdown[0].code, 'positive_feedback');
});

test('defers excessive same-category candidates but keeps unrelated profile seeds', () => {
    const sameCategory = (id, seed, evidence) => candidate(id, seed, {
        candidate_type: 'trend_seed',
        owner_matches: { keywords: [], categories: [{ value: 'IT·컴퓨터' }] },
        evidence_features: { owner_keyword_evidence: evidence },
        trend: { categories: ['IT·컴퓨터'], trend_date: '2026-08-14', change_type: 'up', change_amount: 1 }
    });
    const result = rankTopicCandidates({
        now: NOW,
        limit: 5,
        candidates: [
            sameCategory('it-1', 'AI 검색', 3),
            sameCategory('it-2', '홈서버 구축', 2),
            sameCategory('it-3', '워드프레스 운영', 1),
            candidate('travel', '국내 여행'),
            candidate('recipe', '간단한 요리')
        ]
    });

    assert.deepEqual(result.selected.map((item) => item.id), ['it-1', 'it-2', 'travel', 'recipe']);
    assert.equal(result.deferred.find((item) => item.id === 'it-3').ranking.deferred_reason, 'group_limit');
});

test('similarity and tie ordering are deterministic', () => {
    assert.equal(similarity('무료 홈서버 만들기', '무료 홈서버 구축하기'), 0.5);
    const result = rankTopicCandidates({
        candidates: [candidate('first', '첫 번째'), candidate('second', '두 번째')]
    });
    assert.deepEqual(result.selected.map((item) => item.id), ['first', 'second']);
});
