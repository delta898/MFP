const test = require('node:test');
const assert = require('node:assert/strict');
const {
    CARD_NEWS_MANAGEMENT_STATES,
    deriveCardNewsManagementState,
    toCardNewsManagementFields
} = require('./management-status');

test('derives one user-facing state from workflow and publishing facts', () => {
    assert.equal(deriveCardNewsManagementState({ workflowStatus: '제작 중' }), CARD_NEWS_MANAGEMENT_STATES.IN_PROGRESS);
    assert.equal(deriveCardNewsManagementState({ workflowStatus: '제작 완료' }), CARD_NEWS_MANAGEMENT_STATES.READY_TO_PUBLISH);
    assert.equal(deriveCardNewsManagementState({ workflowStatus: '제작 완료', publishingStatus: '발행 완료' }), CARD_NEWS_MANAGEMENT_STATES.PUBLISHED);
    assert.equal(deriveCardNewsManagementState({ workflowStatus: '제작 완료', publishingStatus: '일부 완료' }), CARD_NEWS_MANAGEMENT_STATES.NEEDS_ATTENTION);
    assert.equal(deriveCardNewsManagementState({ workflowStatus: '제작 완료', lastError: '확인 실패' }), CARD_NEWS_MANAGEMENT_STATES.NEEDS_ATTENTION);
});

test('exposes presentation metadata without requiring screen-specific status rules', () => {
    assert.deepEqual(toCardNewsManagementFields({ workflow_status: '제작 중' }), {
        status: '작업 중',
        status_key: 'in_progress',
        status_tone: 'neutral',
        action_label: '계속 만들기'
    });
    assert.equal(toCardNewsManagementFields({ workflow_status: '제작 완료' }).status_tone, 'pending');
});
