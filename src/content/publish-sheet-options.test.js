const test = require('node:test');
const assert = require('node:assert/strict');

const {
    mergeShoppingSheetOptions,
    mergeTopicSheetOptions,
    resolveShoppingSheetState,
    resolveTopicSheetState
} = require('./publish-sheet-options');

test('topic sheet state keeps options publish settings as effective source of truth', () => {
    const resolved = resolveTopicSheetState({
        subject: '컬럼 제목',
        keywords: ['컬럼 키워드'],
        instruction: '컬럼 지시',
        referenceUrls: ['https://column.example.com'],
        category: 'N:컬럼네이버, W:컬럼워드',
        postStatus: 'draft',
        scheduleDate: '2026-03-30 09:00:00',
        imageGeneration: false,
        externalReference: true,
        options: JSON.stringify({
            subject: '옵션 제목',
            keywords: ['옵션 키워드'],
            instruction: '옵션 지시',
            reference_urls: ['https://option.example.com'],
            category: 'N:옵션네이버, W:옵션워드',
            naver_category: '옵션네이버',
            wordpress_category: '옵션워드',
            post_status: 'publish',
            schedule_date: '2026-04-01 10:00:00',
            image_gen: true,
            external_reference: false
        })
    });

    assert.equal(resolved.subject, '옵션 제목');
    assert.deepEqual(resolved.keywords, ['옵션 키워드']);
    assert.equal(resolved.instruction, '옵션 지시');
    assert.deepEqual(resolved.referenceUrls, ['https://option.example.com']);
    assert.equal(resolved.category, 'N:옵션네이버, W:옵션워드');
    assert.equal(resolved.postStatus, 'publish');
    assert.equal(resolved.scheduleDate, '2026-04-01 10:00:00');
    assert.equal(resolved.imageGeneration, true);
    assert.equal(resolved.externalReference, false);
});

test('topic option merge syncs inline edits while preserving unrelated option keys', () => {
    const merged = mergeTopicSheetOptions({
        custom_flag: 'keep-me',
        post_status: 'publish',
        subject: '예전 제목',
        naver_category: '예전N',
        wordpress_category: '예전W'
    }, {
        subject: '새 제목',
        keywords: '하나, 둘',
        instruction: '새 지시',
        referenceUrls: 'https://example.com/a, https://example.com/b',
        category: 'N:새네이버, W:새워드',
        postStatus: 'draft',
        scheduleDate: '2026-03-31 08:30:00',
        imageGeneration: false,
        externalReference: true
    });

    assert.equal(merged.custom_flag, 'keep-me');
    assert.equal(merged.subject, '새 제목');
    assert.deepEqual(merged.keywords, ['하나', '둘']);
    assert.equal(merged.instruction, '새 지시');
    assert.deepEqual(merged.reference_urls, ['https://example.com/a', 'https://example.com/b']);
    assert.equal(merged.category, 'N:새네이버, W:새워드');
    assert.equal(merged.naver_category, '새네이버');
    assert.equal(merged.wordpress_category, '새워드');
    assert.equal(merged.post_status, 'draft');
    assert.equal(merged.schedule_date, '2026-03-31 08:30:00');
    assert.equal(merged.image_gen, false);
    assert.equal(merged.external_reference, true);
});

test('shopping sheet state also applies options override for visible publish fields', () => {
    const resolved = resolveShoppingSheetState({
        category: 'N:컬럼네이버, W:컬럼워드',
        postStatus: 'draft',
        scheduleDate: '2026-03-30 09:00:00',
        options: JSON.stringify({
            category: 'N:옵션네이버, W:옵션워드',
            naver_category: '옵션네이버',
            wordpress_category: '옵션워드',
            post_status: 'publish',
            schedule_date: '2026-04-02 07:00:00'
        })
    });

    assert.equal(resolved.category, 'N:옵션네이버, W:옵션워드');
    assert.equal(resolved.postStatus, 'publish');
    assert.equal(resolved.scheduleDate, '2026-04-02 07:00:00');
});

test('shopping option merge keeps options column in sync with inline publish edits', () => {
    const merged = mergeShoppingSheetOptions({
        custom_flag: 'keep-me',
        post_status: 'publish'
    }, {
        category: 'N:쇼핑네이버, W:쇼핑워드',
        postStatus: 'draft',
        scheduleDate: '2026-03-31 11:00:00'
    });

    assert.equal(merged.custom_flag, 'keep-me');
    assert.equal(merged.category, 'N:쇼핑네이버, W:쇼핑워드');
    assert.equal(merged.naver_category, '쇼핑네이버');
    assert.equal(merged.wordpress_category, '쇼핑워드');
    assert.equal(merged.post_status, 'draft');
    assert.equal(merged.schedule_date, '2026-03-31 11:00:00');
});
