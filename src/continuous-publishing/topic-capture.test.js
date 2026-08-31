const test = require('node:test');
const assert = require('node:assert/strict');

const { TOPIC_STATUS } = require('./contract');
const {
    buildTopicSheetRow,
    normalizeTopicCaptureInput,
    validateTopicCapture
} = require('./topic-capture');

test('waiting topic accepts one idea seed without a delivery target', () => {
    const result = validateTopicCapture({ subject: '다음에 쓸 제주 글' }, { ready: false });

    assert.equal(result.valid, true);
    assert.deepEqual(result.topic.platforms, []);
    assert.equal(buildTopicSheetRow({ subject: '다음에 쓸 제주 글' }).status, TOPIC_STATUS.WAITING);
});

test('ready topic requires an idea seed and at least one supported target', () => {
    const empty = validateTopicCapture({}, { ready: true });
    const missingTarget = validateTopicCapture({ keywords: '제주, 산책' }, { ready: true });

    assert.equal(empty.valid, false);
    assert.deepEqual(empty.errors.map((item) => item.code), ['IDEA_REQUIRED', 'PLATFORM_REQUIRED']);
    assert.equal(missingTarget.valid, false);
    assert.equal(missingTarget.errors[0].code, 'PLATFORM_REQUIRED');
});

test('scheduled ready topic requires a parseable platform schedule date', () => {
    const invalid = validateTopicCapture({
        subject: '예약할 글',
        platforms: ['naver'],
        postStatus: 'schedule'
    }, { ready: true });

    assert.equal(invalid.valid, false);
    assert.equal(invalid.errors[0].code, 'SCHEDULE_DATE_REQUIRED');
});

test('topic capture rejects a non-http reference URL', () => {
    const result = validateTopicCapture({ referenceUrl: 'not-a-url' }, { ready: false });

    assert.equal(result.valid, false);
    assert.equal(result.errors[0].code, 'REFERENCE_URL_INVALID');
});

test('ready row keeps the topic-owned delivery plan in sheet options', () => {
    const row = buildTopicSheetRow({
        subject: '제주 산책',
        title: '아침 산책에서 뜻밖에 마주친 것',
        keywords: '제주, 아침 산책, 제주',
        instruction: '경험 중심으로 작성',
        referenceUrl: 'https://example.com/reference',
        platforms: ['naver', 'wordpress'],
        naverCategory: '여행',
        wordpressCategory: 'Daily',
        writingStrategy: 'discovery',
        imageMode: 'none',
        externalReference: false,
        postStatus: 'schedule',
        scheduleDate: '2026-09-01T10:30'
    }, { ready: true });

    assert.equal(row.status, TOPIC_STATUS.READY);
    assert.deepEqual(row.keywords, ['제주', '아침 산책']);
    assert.deepEqual(row.targets, ['naver', 'wordpress']);
    assert.equal(row.options.naver_category, '여행');
    assert.equal(row.options.title, '아침 산책에서 뜻밖에 마주친 것');
    assert.equal(row.options.wordpress_category, 'Daily');
    assert.equal(row.options.writing_strategy, 'discovery');
    assert.equal(row.options.image_mode, 'none');
    assert.equal(row.options.external_reference, false);
    assert.equal(row.options.post_status, 'schedule');
    assert.equal(row.options.schedule_date, '2026-09-01T10:30');
});

test('normalization ignores unknown platforms and uses safe defaults', () => {
    const topic = normalizeTopicCaptureInput({
        subject: '  테스트  ',
        platforms: ['NAVER', 'unknown'],
        writingStrategy: 'invalid',
        imageMode: 'invalid',
        postStatus: 'invalid'
    });

    assert.equal(topic.subject, '테스트');
    assert.deepEqual(topic.platforms, ['naver']);
    assert.equal(topic.writingStrategy, 'search');
    assert.equal(topic.imageMode, 'prompt_only');
    assert.equal(topic.postStatus, 'publish');
    assert.equal(topic.source, 'blog_next');
    assert.equal(topic.trendDate, '');
});

test('selected Naver trend keeps its provenance in the Topics row', () => {
    const row = buildTopicSheetRow({
        subject: '제주 가을 여행',
        keywords: '제주 가을 여행',
        platforms: ['naver'],
        source: 'naver_trend',
        trendDate: '2026-08-30'
    }, { ready: true });

    assert.equal(row.source, 'naver_trend');
    assert.equal(row.trendDate, '2026-08-30');
});

test('selected Naver trend rejects a missing or impossible trend date', () => {
    const missing = validateTopicCapture({ subject: '트렌드 글감', source: 'naver_trend' });
    const impossible = validateTopicCapture({ subject: '트렌드 글감', source: 'naver_trend', trendDate: '2026-02-31' });

    assert.equal(missing.valid, false);
    assert.equal(missing.errors[0].code, 'TREND_DATE_INVALID');
    assert.equal(impossible.valid, false);
    assert.equal(impossible.errors[0].code, 'TREND_DATE_INVALID');
});
