const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildRelatedPostContext,
    scoreRelatedPostCandidate,
    selectRelatedPosts
} = require('./related-post-selection');

test('related post scoring prefers title and keyword overlap', () => {
    const context = buildRelatedPostContext({
        title: '아이폰 17 카메라 야간 촬영 팁',
        content: '야간 사진 품질과 카메라 설정, 저조도 촬영 팁을 정리합니다.',
        keywords: ['아이폰 17', '카메라', '야간 촬영']
    });

    const relatedScore = scoreRelatedPostCandidate({
        title: '아이폰 17 카메라 설정과 야간 촬영 팁 총정리',
        description: '저조도 촬영에서 필요한 카메라 세팅과 실전 팁을 다룹니다.'
    }, context);
    const unrelatedScore = scoreRelatedPostCandidate({
        title: '주말에 가기 좋은 서울 봄꽃 여행 코스',
        description: '벚꽃 명소와 데이트 코스를 소개합니다.'
    }, context);

    assert.ok(relatedScore > unrelatedScore);
    assert.ok(relatedScore > 0);
    assert.equal(unrelatedScore, 0);
});

test('related post selector fills missing slots with fallback candidates', () => {
    const context = buildRelatedPostContext({
        title: '갤럭시 워치 수면 측정 정확도',
        content: '수면 단계와 심박수 분석, 배터리 사용량을 함께 살펴봅니다.',
        keywords: ['갤럭시 워치', '수면 측정']
    });

    const result = selectRelatedPosts([
        { title: '갤럭시 워치 수면 측정 설정 가이드', url: 'https://example.com/a', description: '수면 추적과 정확도 향상 팁' },
        { title: '에어프라이어 감자튀김 레시피', url: 'https://example.com/b', description: '바삭하게 굽는 방법' },
        { title: '주말 등산 준비물 체크리스트', url: 'https://example.com/c', description: '초보자 산행 팁' }
    ], context, 3, {
        shuffle: (items) => items.slice()
    });

    assert.equal(result.posts.length, 3);
    assert.equal(result.heuristicCount, 1);
    assert.equal(result.fallbackCount, 2);
    assert.equal(result.posts[0].url, 'https://example.com/a');
});

test('related post selector removes duplicate urls before ranking', () => {
    const context = buildRelatedPostContext({
        title: '맥북 배터리 관리 팁',
        keywords: ['맥북', '배터리']
    });

    const result = selectRelatedPosts([
        { title: '맥북 배터리 오래 쓰는 설정', url: 'https://example.com/a' },
        { title: '맥북 배터리 오래 쓰는 설정', url: 'https://example.com/a' },
        { title: '키보드 청소 방법', url: 'https://example.com/b' }
    ], context, 3, {
        shuffle: (items) => items.slice()
    });

    assert.equal(result.totalCandidates, 2);
    assert.equal(result.posts[0].url, 'https://example.com/a');
});
