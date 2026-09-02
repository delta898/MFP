const test = require('node:test');
const assert = require('node:assert/strict');
const { buildOwnerActivitySignalSummary } = require('./owner-activity-signals');

test('preserves explicit feedback when newer generated artifacts fill the recent window', () => {
    const artifacts = Array.from({ length: 5 }, (_unused, index) => ({
        id: `idea-${index}`,
        artifact_type: 'content_idea',
        title: `생성 추천 ${index}`,
        timestamp: `2026-08-23T00:0${index}:00.000Z`,
        payload: {}
    }));
    const events = [{
        id: 'feedback-1',
        event_type: 'activity.lifecycle.blog.feedback',
        timestamp: '2026-08-20T00:00:00.000Z',
        payload: {
            domain: 'blog', stage: 'feedback', strength: 'explicit',
            subject: '아이폰 폴드', source: 'topic-recommendation-ui',
            metadata: { feedback: 'not_helpful', recommendation: { candidate_id: 'candidate-1' } }
        }
    }];

    const summary = buildOwnerActivitySignalSummary({ artifacts, events, limit: 3 });
    assert.equal(summary.signals.length, 3);
    assert.equal(summary.signals.some((signal) => signal.stage === 'feedback'), true);
});

test('includes scheduled publishing as a strong owner activity signal', () => {
    const summary = buildOwnerActivitySignalSummary({
        events: [{
            id: 'scheduled-1',
            event_type: 'activity.lifecycle.blog.scheduled',
            timestamp: '2026-09-02T12:00:00.000Z',
            payload: {
                domain: 'blog',
                stage: 'scheduled',
                strength: 'strong',
                subject: '예약한 글',
                source: 'continuous-publishing',
                platform: 'naver'
            }
        }]
    });

    assert.equal(summary.counts_by_stage.scheduled, 1);
    assert.equal(summary.signals[0].stage, 'scheduled');
});
