const TOPIC_STATUS = Object.freeze({
    WAITING: '대기',
    READY: '발행 준비 완료',
    RUNNING: '발행 중',
    PUBLISHED: '발행 완료',
    DRAFTED: '임시 저장 완료',
    SCHEDULED: '예약 포스팅 등록 완료',
    FAILED: '실패',
    NEEDS_ATTENTION: '확인 필요'
});

const TOPIC_OWNED_FIELDS = Object.freeze([
    'platforms',
    'naver_category',
    'wordpress_category',
    'writing_strategy',
    'image_mode',
    'external_reference',
    'post_status',
    'schedule_date'
]);

const AUTOMATION_OWNED_FIELDS = Object.freeze([
    'enabled',
    'allowed_start_time',
    'allowed_end_time',
    'interval_minutes',
    'notification_enabled'
]);

const TERMINAL_TOPIC_STATUSES = Object.freeze([
    TOPIC_STATUS.PUBLISHED,
    TOPIC_STATUS.DRAFTED,
    TOPIC_STATUS.SCHEDULED
]);

function isQueueReadyStatus(status) {
    return String(status || '').trim() === TOPIC_STATUS.READY;
}

function isTerminalTopicStatus(status) {
    return TERMINAL_TOPIC_STATUSES.includes(String(status || '').trim());
}

module.exports = {
    TOPIC_STATUS,
    TOPIC_OWNED_FIELDS,
    AUTOMATION_OWNED_FIELDS,
    TERMINAL_TOPIC_STATUSES,
    isQueueReadyStatus,
    isTerminalTopicStatus
};
