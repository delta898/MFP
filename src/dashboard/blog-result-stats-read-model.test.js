const test = require('node:test');
const assert = require('node:assert/strict');
const {
    buildKoreanPeriodBoundaries,
    buildDashboardBlogResultStats
} = require('./blog-result-stats-read-model');

function event(id, stage, timestamp, platform = 'naver') {
    const postStatus = { drafted: 'draft', scheduled: 'schedule', published: 'publish' }[stage];
    return {
        id,
        event_type: `activity.lifecycle.blog.${stage}`,
        timestamp,
        payload: {
            domain: 'blog', stage, subject: `글 ${id}`, source: 'quick-publish',
            entity_ref: `operation-${id}`, platform,
            result_ref: stage === 'published' ? `https://example.com/${id}` : '',
            metadata: { post_status: postStatus }
        }
    };
}

test('Korean periods start at midnight and Monday in Asia/Seoul', () => {
    const periods = buildKoreanPeriodBoundaries('2026-09-02T21:00:00.000Z');
    assert.deepEqual(periods.today, {
        from: '2026-09-02T15:00:00.000Z',
        to: '2026-09-03T15:00:00.000Z'
    });
    assert.deepEqual(periods.week, {
        from: '2026-08-30T15:00:00.000Z',
        to: '2026-09-06T15:00:00.000Z'
    });
});

test('dashboard stats separates processed and public results for today and week', () => {
    const stats = buildDashboardBlogResultStats({
        generatedAt: '2026-09-02T21:00:00.000Z',
        events: [
            event('draft-today', 'drafted', '2026-09-02T16:00:00.000Z'),
            event('publish-today', 'published', '2026-09-02T17:00:00.000Z', 'wordpress'),
            event('scheduled-week', 'scheduled', '2026-08-31T01:00:00.000Z'),
            event('old', 'published', '2026-08-29T01:00:00.000Z')
        ]
    });

    assert.deepEqual(stats.periods.today.processed_count, 2);
    assert.deepEqual(stats.periods.today.published_count, 1);
    assert.deepEqual(stats.periods.week.processed_count, 3);
    assert.deepEqual(stats.periods.week.published_count, 1);
    assert.equal(stats.recent_results.length, 4);
    assert.equal(stats.recent_results[0].id, 'publish-today');
});

test('dashboard stats deduplicates events and caps recent results', () => {
    const events = Array.from({ length: 7 }, (_unused, index) =>
        event(`result-${index}`, 'published', `2026-09-02T${String(10 + index).padStart(2, '0')}:00:00.000Z`));
    events.push(events[0]);
    const stats = buildDashboardBlogResultStats({
        generatedAt: '2026-09-02T21:00:00.000Z',
        events
    });

    assert.equal(stats.periods.today.processed_count, 2);
    assert.equal(stats.recent_results.length, 5);
});

test('dashboard stats distinguishes unavailable storage from an empty history', () => {
    const stats = buildDashboardBlogResultStats({
        generatedAt: '2026-09-02T21:00:00.000Z',
        available: false,
        events: []
    });
    assert.equal(stats.available, false);
    assert.equal(stats.periods.today.processed_count, 0);
});
