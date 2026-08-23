const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRecommendationCandidate } = require('../core/validators');
const { createSetupGuidanceProducer } = require('./setup-guidance');

const NOW = '2026-08-24T03:00:00.000Z';

function state(readiness) {
    return { owner_user_id: 'owner-local', observed_at: NOW, readiness };
}

test('setup producer creates valid bounded navigation for missing configuration', async () => {
    const producer = createSetupGuidanceProducer();
    const result = await producer.produce({
        owner_user_id: 'owner-local',
        operational_state: state({
            config_ready: true, essential_configured: false, google_sheets_configured: false,
            naver_blog_configured: false, wordpress_configured: false
        })
    });
    assert.equal(result.candidates.length, 2);
    result.candidates.forEach((candidate) => assert.deepEqual(validateRecommendationCandidate(candidate).errors, []));
    assert.deepEqual(result.candidates.map((item) => item.handoff.target.surface), [
        'settings.general', 'settings.blog'
    ]);
    assert.doesNotMatch(JSON.stringify(result), /광고|애드센스|수익/);
});

test('setup producer offers optional WordPress foundation without promising outcomes', async () => {
    const producer = createSetupGuidanceProducer();
    const result = await producer.produce({
        owner_user_id: 'owner-local',
        operational_state: state({
            config_ready: true, essential_configured: true, google_sheets_configured: true,
            naver_blog_configured: true, wordpress_configured: false
        })
    });
    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].handoff.target.surface, 'settings.wordpress');
    assert.match(result.candidates[0].summary, /필요하다면/);
    assert.doesNotMatch(JSON.stringify(result), /수익|승인|보장/);
});

test('unready runtime returns one general setup candidate without cascading guesses', async () => {
    const result = await createSetupGuidanceProducer().produce({
        owner_user_id: 'owner-local',
        operational_state: state({
            config_ready: false, essential_configured: false, google_sheets_configured: false,
            naver_blog_configured: false, wordpress_configured: false
        })
    });
    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0].metadata.setup_area, 'general');
});
