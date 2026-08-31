const test = require('node:test');
const assert = require('node:assert/strict');

const {
    AUTO_TOPIC_PLAN_DEFAULTS,
    normalizeAutoTopicPlan,
    resolveAutoTopicPlan
} = require('./auto-topic-plan');

test('auto topic plan normalizes the complete supported contract', () => {
    assert.deepEqual(normalizeAutoTopicPlan({
        target_channels: 'wordpress,naver,wordpress',
        writingStrategy: 'DISCOVERY',
        imageMode: 'prompt_only',
        externalReference: false,
        postStatus: 'draft'
    }, { strict: true }), {
        platforms: ['wordpress', 'naver'],
        writing_strategy: 'discovery',
        image_mode: 'prompt_only',
        external_reference: false,
        post_status: 'draft'
    });
});

test('auto topic plan rejects missing targets and scheduled publishing', () => {
    assert.throws(
        () => normalizeAutoTopicPlan({ platforms: [] }, { strict: true }),
        (error) => error.code === 'AUTO_TOPIC_PLATFORM_REQUIRED' && error.status === 400
    );
    assert.throws(
        () => normalizeAutoTopicPlan({ platforms: ['naver'], post_status: 'schedule' }, { strict: true }),
        (error) => error.code === 'AUTO_TOPIC_POST_STATUS_INVALID' && error.status === 400
    );
});

test('explicit plan wins over legacy publishing values', () => {
    const result = resolveAutoTopicPlan({
        explicitPlan: {
            platforms: ['wordpress'],
            writing_strategy: 'discovery',
            image_mode: 'none',
            external_reference: false,
            post_status: 'draft'
        },
        legacyPublish: { target_channels: ['naver'], post_status: 'publish' }
    });

    assert.equal(result.source, 'explicit');
    assert.deepEqual(result.plan.platforms, ['wordpress']);
    assert.equal(result.plan.post_status, 'draft');
});

test('legacy publishing values initialize a missing plan safely', () => {
    const result = resolveAutoTopicPlan({
        legacyPublish: {
            target_channels: 'naver,wordpress',
            image_mode: 'none',
            post_status: 'draft'
        }
    });

    assert.equal(result.source, 'legacy');
    assert.deepEqual(result.plan, {
        platforms: ['naver', 'wordpress'],
        writing_strategy: 'search',
        image_mode: 'none',
        external_reference: true,
        post_status: 'draft'
    });
});

test('safe defaults are returned when neither plan source exists', () => {
    const result = resolveAutoTopicPlan();
    assert.equal(result.source, 'default');
    assert.deepEqual(result.plan, {
        ...AUTO_TOPIC_PLAN_DEFAULTS,
        platforms: ['naver']
    });
});
