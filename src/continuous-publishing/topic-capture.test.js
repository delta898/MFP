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
    const savedKeywordOnly = validateTopicCapture({ keywords: '제주, 산책' }, { ready: false });

    assert.equal(empty.valid, false);
    assert.deepEqual(empty.errors.map((item) => item.code), ['SUBJECT_REQUIRED', 'PLATFORM_REQUIRED']);
    assert.equal(missingTarget.valid, false);
    assert.deepEqual(missingTarget.errors.map((item) => item.code), ['SUBJECT_REQUIRED', 'PLATFORM_REQUIRED']);
    assert.equal(savedKeywordOnly.valid, true);
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

test('scheduled ready topic rejects a reservation at or before the current time', () => {
    const past = validateTopicCapture({
        subject: '지난 예약 글', platforms: ['naver'], postStatus: 'schedule', scheduleDate: '2026-10-08T10:00'
    }, { ready: true, now: new Date('2026-10-08T10:00:00').getTime() });
    const future = validateTopicCapture({
        subject: '미래 예약 글', platforms: ['naver'], postStatus: 'schedule', scheduleDate: '2026-10-08T10:01'
    }, { ready: true, now: new Date('2026-10-08T10:00:00').getTime() });

    assert.equal(past.valid, false);
    assert.equal(past.errors[0].code, 'SCHEDULE_DATE_PAST');
    assert.equal(future.valid, true);
});

test('waiting topic may omit a schedule but cannot preserve an expired schedule', () => {
    const omitted = validateTopicCapture({ subject: '보관 글', postStatus: 'schedule' }, { ready: false });
    const expired = validateTopicCapture({
        subject: '보관 글', postStatus: 'schedule', scheduleDate: '2026-10-07T10:00'
    }, { ready: false, now: new Date('2026-10-08T10:00:00').getTime() });

    assert.equal(omitted.valid, true);
    assert.equal(expired.valid, false);
    assert.equal(expired.errors[0].code, 'SCHEDULE_DATE_PAST');
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
        platforms: ['wordpress'],
        naverCategory: '여행',
        wordpressCategory: 'Daily',
        writingStrategy: 'discovery',
        writingOverrides: {
            length: 'long',
            opening: 'direct',
            development: 'comparison',
            ending: 'summary'
        },
        imageMode: 'none',
        externalReference: false,
        postStatus: 'schedule',
        scheduleDate: '2026-10-09T10:30'
    }, { ready: true, now: new Date('2026-10-08T10:30').getTime() });

    assert.equal(row.status, TOPIC_STATUS.READY);
    assert.deepEqual(row.keywords, ['제주', '아침 산책']);
    assert.deepEqual(row.targets, ['wordpress']);
    assert.equal(row.options.naver_category, '여행');
    assert.equal(row.options.title, '아침 산책에서 뜻밖에 마주친 것');
    assert.equal(row.options.wordpress_category, 'Daily');
    assert.equal(row.options.writing_strategy, 'discovery');
    assert.deepEqual(row.options.writing_overrides, {
        length: 'long',
        opening: 'direct',
        development: 'comparison',
        ending: 'summary'
    });
    assert.equal(row.options.image_mode, 'none');
    assert.equal(row.options.external_reference, false);
    assert.equal(row.options.post_status, 'schedule');
    assert.equal(row.options.schedule_date, '2026-10-09T10:30');
});

test('topic capture requires legacy multi-target rows to be resolved explicitly', () => {
    const result = validateTopicCapture({ subject: '기존 글감', platforms: ['naver', 'wordpress'] }, { ready: true });
    assert.equal(result.valid, false);
    assert.equal(result.errors[0].code, 'MULTIPLE_PUBLISH_TARGETS');
});

test('topic capture rejects unsupported writing overrides', () => {
    const result = validateTopicCapture({
        subject: '제주 산책',
        writingOverrides: { tone: 'warm', length: 'endless' }
    });

    assert.equal(result.valid, false);
    assert.deepEqual(result.errors.map((item) => item.code), [
        'WRITING_OVERRIDE_FIELD_UNSUPPORTED',
        'WRITING_OVERRIDE_VALUE_INVALID'
    ]);
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

test('saved site topic stores stable site identity and only Vault folder destinations', () => {
    const blog = buildTopicSheetRow({
        subject: '블로그형 사이트 글감',
        platforms: ['site-hosting'],
        siteTarget: { project_id: 'project-1', site_id: 'site-1', kind: 'blog', listing_route: '/blog/' }
    });
    const vault = buildTopicSheetRow({
        subject: 'DG 글감',
        platforms: ['site-hosting'],
        siteTarget: { project_id: 'project-2', site_id: 'dg-1', kind: 'vault', destination_path: 'travel/jeju' }
    });

    assert.deepEqual(blog.options.platforms, ['site-hosting']);
    assert.deepEqual(blog.options.site_target, { project_id: 'project-1', site_id: 'site-1', kind: 'blog' });
    assert.deepEqual(vault.options.site_target, {
        project_id: 'project-2', site_id: 'dg-1', kind: 'vault', destination_path: 'travel/jeju'
    });
    assert.equal(Object.hasOwn(blog.options.site_target, 'listing_route'), false);
});

test('site targets can enter the ready queue for draft or immediate posting, but not scheduled posting', () => {
    const saved = validateTopicCapture({
        subject: '보관할 사이트 글감', platforms: ['site-hosting'],
        siteTarget: { project_id: 'project-1', site_id: 'site-1', kind: 'blog' }
    }, { ready: false });
    const queued = validateTopicCapture({
        subject: '대기열로 보낼 사이트 글감', platforms: ['site-hosting'],
        siteTarget: { project_id: 'project-1', site_id: 'site-1', kind: 'blog' }, postStatus: 'draft'
    }, { ready: true });
    const scheduled = validateTopicCapture({
        subject: '예약 사이트 글감', platforms: ['site-hosting'],
        siteTarget: { project_id: 'project-1', site_id: 'site-1', kind: 'blog' },
        postStatus: 'schedule', scheduleDate: '2026-10-12T10:00'
    }, { ready: true, now: new Date('2026-10-09T00:00Z') });

    assert.equal(saved.valid, true);
    assert.equal(queued.valid, true);
    assert.equal(scheduled.valid, false);
    assert.equal(scheduled.errors.some(({ code }) => code === 'SITE_SCHEDULE_UNSUPPORTED'), true);
});
