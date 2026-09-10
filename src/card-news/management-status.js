const CARD_NEWS_MANAGEMENT_STATES = Object.freeze({
    IN_PROGRESS: Object.freeze({ key: 'in_progress', label: '작업 중', tone: 'neutral', actionLabel: '계속 만들기' }),
    READY_TO_PUBLISH: Object.freeze({ key: 'ready_to_publish', label: '발행 대기', tone: 'pending', actionLabel: '결과 보기' }),
    PUBLISHED: Object.freeze({ key: 'published', label: '발행 완료', tone: 'complete', actionLabel: '결과 보기' }),
    NEEDS_ATTENTION: Object.freeze({ key: 'needs_attention', label: '확인 필요', tone: 'attention', actionLabel: '결과 확인' })
});

function deriveCardNewsManagementState(record = {}) {
    const publishingStatus = String(record.publishingStatus || record.publishing_status || '미발행').trim();
    const workflowStatus = String(record.workflowStatus || record.workflow_status || '').trim();
    const lastError = String(record.lastError || record.last_error || '').trim();

    if (publishingStatus === '실패' || publishingStatus === '일부 완료' || lastError) {
        return CARD_NEWS_MANAGEMENT_STATES.NEEDS_ATTENTION;
    }
    if (publishingStatus === '발행 완료') return CARD_NEWS_MANAGEMENT_STATES.PUBLISHED;
    if (workflowStatus === '제작 완료') return CARD_NEWS_MANAGEMENT_STATES.READY_TO_PUBLISH;
    return CARD_NEWS_MANAGEMENT_STATES.IN_PROGRESS;
}

function toCardNewsManagementFields(record = {}) {
    const state = deriveCardNewsManagementState(record);
    return {
        status: state.label,
        status_key: state.key,
        status_tone: state.tone,
        action_label: state.actionLabel
    };
}

module.exports = {
    CARD_NEWS_MANAGEMENT_STATES,
    deriveCardNewsManagementState,
    toCardNewsManagementFields
};
