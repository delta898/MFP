const test = require('node:test');
const assert = require('node:assert/strict');
const { collectKeywordDiscoverySeeds } = require('./seed-collector');

test('collects one raw seed from each discovery signal family', () => {
    const seeds = collectKeywordDiscoverySeeds({
        random: () => 0,
        knowledge: [{
            kind: 'trends',
            provider_id: 'naver-trends',
            items: [{ title: '아이폰 17', summary: '상승' }, { title: '중복될 트렌드' }]
        }],
        ownerProfile: {
            interests: { keywords: [{ value: '오사카 여행' }, { value: '다른 관심사' }] },
            activity: {
                recent_subjects: [
                    { subject: '최근 작성한 여행 정리', stage: 'published' },
                    { subject: '추천 결과', stage: 'selected' }
                ]
            }
        }
    });

    assert.deepEqual(seeds, [
        { keyword: '아이폰 17', source: 'trend', source_label: '최근 트렌드', source_detail: '상승' },
        { keyword: '오사카 여행', source: 'profile', source_label: '관심 주제', source_detail: '저장된 관심 키워드' },
        { keyword: '최근 작성한 여행 정리', source: 'activity', source_label: '최근 글쓰기', source_detail: '저장하거나 작성한 최근 글' }
    ]);
});

test('deduplicates seeds and does not treat selection alone as recent writing', () => {
    const seeds = collectKeywordDiscoverySeeds({
        random: () => 0,
        knowledge: [{ kind: 'trends', items: [{ title: '오사카여행' }] }],
        ownerProfile: {
            interests: { keywords: [{ value: '오사카 여행' }] },
            activity: { recent_subjects: [{ subject: '선택만 한 글감', stage: 'selected' }] }
        }
    });

    assert.deepEqual(seeds, [{
        keyword: '오사카여행',
        source: 'trend',
        source_label: '최근 트렌드',
        source_detail: ''
    }]);
});

test('uses alternative candidates before returning recently explored seeds', () => {
    const seeds = collectKeywordDiscoverySeeds({
        random: () => 0,
        excludedKeywords: ['첫 트렌드', '첫 관심사', '첫 글쓰기'],
        knowledge: [{ kind: 'trends', items: [{ title: '첫 트렌드' }, { title: '다음 트렌드' }] }],
        ownerProfile: {
            interests: { keywords: [{ value: '첫 관심사' }, { value: '다음 관심사' }] },
            activity: {
                recent_subjects: [
                    { subject: '첫 글쓰기', stage: 'published' },
                    { subject: '다음 글쓰기', stage: 'saved' }
                ]
            }
        }
    });

    assert.deepEqual(seeds.map((item) => item.keyword), ['다음 트렌드', '다음 관심사', '다음 글쓰기']);
});
