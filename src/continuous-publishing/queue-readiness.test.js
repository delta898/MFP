const test = require('node:test');
const assert = require('node:assert/strict');

const { diagnoseQueueReadiness } = require('./queue-readiness');

function readyTopic(overrides = {}) {
    return {
        subject: '기준 글감',
        postStatus: 'draft',
        options: { platforms: ['naver'], post_status: 'draft' },
        ...overrides
    };
}

test('queue readiness accepts a complete per-item publishing plan', () => {
    const result = diagnoseQueueReadiness(readyTopic());

    assert.equal(result.ready, true);
    assert.deepEqual(result.issues, []);
    assert.deepEqual(result.plan, {
        subject: '기준 글감', targets: ['naver'], postStatus: 'draft', scheduleDate: ''
    });
});

test('saved subject and Site Hosting options from the Topics options payload are queue-ready', () => {
    const result = diagnoseQueueReadiness({
        subject: '최고의 네이버 웹툰 괴력난신 리뷰',
        options: {
            post_status: 'publish',
            writing_strategy: 'search',
            writing_overrides: {
                length: 'short', opening: 'scene',
                development: 'experience_review', ending: 'next_step'
            },
            image_mode: 'prompt_only',
            image_gen: false,
            external_reference: false,
            subject: '이전 옵션 중복값',
            platforms: ['site-hosting'],
            site_target: {
                project_id: 'default',
                site_id: 'ceeee4c4bb5b48bdb13b9331704d5f1e',
                kind: 'blog'
            }
        }
    }, { now: new Date('2026-10-09T00:00:00+09:00') });

    assert.equal(result.ready, true);
    assert.deepEqual(result.issues, []);
    assert.equal(result.plan.subject, '최고의 네이버 웹툰 괴력난신 리뷰');
});

test('queue readiness reports missing values without inferring defaults', () => {
    const result = diagnoseQueueReadiness({
        subject: '',
        postStatus: 'publish',
        post_status_explicit: false,
        options: {}
    });

    assert.equal(result.ready, false);
    assert.deepEqual(result.issues.map(({ code }) => code), [
        'SUBJECT_REQUIRED', 'PUBLISH_TARGET_REQUIRED', 'POST_STATUS_REQUIRED'
    ]);
    assert.deepEqual(result.plan.targets, []);
    assert.equal(result.plan.postStatus, '');
});

test('queue readiness identifies unsupported and multiple targets', () => {
    const site = diagnoseQueueReadiness(readyTopic({ options: { platforms: ['site'], post_status: 'draft' } }));
    const siteHosting = diagnoseQueueReadiness(readyTopic({ options: {
        platforms: ['site-hosting'], post_status: 'draft',
        site_target: { project_id: 'project-1', site_id: 'site-1', kind: 'blog' }
    } }));
    const multiple = diagnoseQueueReadiness(readyTopic({ options: { platforms: ['naver', 'wordpress'], post_status: 'draft' } }));

    assert.equal(site.issues[0].code, 'PUBLISH_TARGET_UNSUPPORTED');
    assert.deepEqual(siteHosting.issues, []);
    assert.deepEqual(siteHosting.plan.targets, ['site-hosting']);
    assert.equal(multiple.issues[0].code, 'MULTIPLE_PUBLISH_TARGETS');
});

test('queue readiness requires the stored site identity and Vault folder', () => {
    const missingSite = diagnoseQueueReadiness(readyTopic({ options: { platforms: ['site-hosting'], post_status: 'draft' } }));
    const missingVaultFolder = diagnoseQueueReadiness(readyTopic({ options: {
        platforms: ['site-hosting'], post_status: 'publish',
        site_target: { project_id: 'project-1', site_id: 'site-1', kind: 'vault' }
    } }));

    assert.deepEqual(missingSite.issues.map(({ code }) => code), ['SITE_TARGET_REQUIRED']);
    assert.deepEqual(missingVaultFolder.issues.map(({ code }) => code), ['SITE_DESTINATION_REQUIRED']);
});

test('Site Hosting queue readiness rejects scheduled publishing', () => {
    const result = diagnoseQueueReadiness(readyTopic({ options: {
        platforms: ['site-hosting'], post_status: 'schedule', schedule_date: '2026-10-12T10:00',
        site_target: { project_id: 'project-1', site_id: 'site-1', kind: 'blog' }
    } }), { now: new Date('2026-10-09T00:00Z') });

    assert.deepEqual(result.issues.map(({ code }) => code), ['SITE_SCHEDULE_UNSUPPORTED']);
});

test('queue readiness rejects scheduled items without a future valid timestamp', () => {
    const options = { now: new Date('2026-10-08T10:00:00.000Z') };
    const missing = diagnoseQueueReadiness(readyTopic({ options: { platforms: ['naver'], post_status: 'schedule' } }), options);
    const past = diagnoseQueueReadiness(readyTopic({ options: {
        platforms: ['naver'], post_status: 'schedule', schedule_date: '2026-10-08T09:59:00.000Z'
    } }), options);
    const invalid = diagnoseQueueReadiness(readyTopic({ options: {
        platforms: ['naver'], post_status: 'schedule', schedule_date: 'not-a-date'
    } }), options);

    assert.equal(missing.issues[0].code, 'SCHEDULE_DATE_REQUIRED');
    assert.equal(past.issues[0].code, 'SCHEDULE_DATE_PAST');
    assert.equal(invalid.issues[0].code, 'SCHEDULE_DATE_INVALID');
});
