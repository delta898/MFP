const FLOW_STATES = new Set([
    'idle',
    'selecting',
    'running',
    'completed',
    'failed',
    'needs_attention',
    'blocked',
    'empty',
    'simulated'
]);
const TARGETS = new Set(['naver', 'wordpress']);
const POST_STATUSES = new Set(['publish', 'draft', 'schedule']);

function normalizeText(value) {
    return String(value || '').trim();
}

function normalizeNullableText(value) {
    const normalized = normalizeText(value);
    return normalized || null;
}

function normalizeInteger(value) {
    const normalized = Number(value);
    return Number.isInteger(normalized) ? normalized : null;
}

function normalizeTargets(item = {}) {
    const values = item.targets || item.platforms || item.options?.platforms || [];
    const list = Array.isArray(values) ? values : String(values || '').split(',');
    return Array.from(new Set(list
        .map(value => normalizeText(value).toLowerCase())
        .filter(value => TARGETS.has(value))));
}

function normalizePostStatus(item = {}) {
    const value = normalizeText(item.postStatus || item.options?.post_status).toLowerCase();
    return POST_STATUSES.has(value) ? value : 'publish';
}

function buildNextItem(item = {}) {
    return {
        row_index: normalizeInteger(item.rowIndex),
        row_number: normalizeInteger(item.rowNumber),
        subject: normalizeText(item.subject),
        targets: normalizeTargets(item),
        post_status: normalizePostStatus(item),
        processing_estimate_at: normalizeNullableText(item.processing_estimate_at)
    };
}

function buildDashboardBlogOperationsOverview(input = {}) {
    const queue = input.queue || {};
    const runner = input.runner || {};
    const schedule = queue.automation_schedule || {};
    const statusSummary = queue.status_summary || {};
    const state = normalizeText(runner.state).toLowerCase();
    const items = Array.isArray(queue.items) ? queue.items : [];
    const runningItems = items.filter(item => normalizeText(item?.queue_runtime_state).toLowerCase() === 'running');
    const reportedReadyCount = Math.max(0, normalizeInteger(statusSummary.ready) || 0);
    const reportedRunningCount = Math.max(0, normalizeInteger(statusSummary.running) || 0);
    const runningCount = Math.max(reportedRunningCount, runningItems.length, runner.busy === true ? 1 : 0);
    const runningReadyCount = runningItems.filter(item => normalizeText(item?.status) === '발행 준비 완료').length;
    const runnerStillReportedReady = runner.busy === true
        && normalizeInteger(runner.rowIndex ?? runner.row_index) !== null
        && reportedRunningCount === 0;
    const readyOverlapCount = Math.max(runningReadyCount, runnerStillReportedReady ? 1 : 0);

    return {
        schema_version: 1,
        generated_at: new Date(input.generatedAt || Date.now()).toISOString(),
        flow: {
            state: FLOW_STATES.has(state) ? state : 'idle',
            busy: runner.busy === true,
            subject: normalizeText(runner.subject),
            message: normalizeText(runner.message),
            started_at: normalizeNullableText(runner.startedAt || runner.started_at),
            finished_at: normalizeNullableText(runner.finishedAt || runner.finished_at),
            result_status: normalizeText(runner.resultStatus || runner.result_status),
            source: normalizeNullableText(runner.source)
        },
        automation: {
            enabled: schedule.enabled === true,
            effective_enabled: schedule.effective_enabled === true,
            status: normalizeText(schedule.status) || 'disabled',
            interval_minutes: normalizeInteger(schedule.interval_minutes),
            next_processing_at: normalizeNullableText(schedule.next_processing_at)
        },
        queue: {
            ready_count: Math.max(0, reportedReadyCount - readyOverlapCount),
            saved_count: Math.max(0, normalizeInteger(statusSummary.saved) || 0),
            running_count: runningCount,
            next_items: items
                .filter(item => normalizeText(item?.queue_runtime_state).toLowerCase() !== 'running')
                .slice(0, 3)
                .map(buildNextItem)
        }
    };
}

module.exports = {
    buildDashboardBlogOperationsOverview
};
