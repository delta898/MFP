const { IDENTIFIER_PATTERN } = require('../core/validators');

const OPERATIONAL_STATE_SCHEMA_VERSION = 1;
const MAX_JOBS = 40;
const MAX_PENDING = 20;
const PENDING_STATUSES = new Set([
    'pending', 'awaiting', 'confirmation_required', 'proposed',
    'approved', 'rejected', 'cancelled', 'expired', 'completed'
]);

function compact(value, maxLength = 240) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function validTimestamp(value) {
    return Number.isFinite(Date.parse(String(value || '')));
}

function booleanProperty(object, key) {
    try {
        return object?.[key] === true;
    } catch (_error) {
        return false;
    }
}

function resolveConfigReadiness(config = {}) {
    let googleSheets = false;
    try {
        googleSheets = Boolean(compact(config.GOOGLE_SHEET_ID || config.GOOGLE_SHEET_URL, 500));
    } catch (_error) { }
    return {
        config_ready: booleanProperty(config, 'CONFIG_READY'),
        essential_configured: booleanProperty(config, 'CONFIG_IS_ESSENTIAL_SET'),
        google_sheets_configured: googleSheets,
        naver_blog_configured: booleanProperty(config, 'CONFIG_IS_NAVER_SET'),
        wordpress_configured: booleanProperty(config, 'CONFIG_IS_WP_SET')
    };
}

function sanitizeJob(job = {}) {
    const id = compact(job.id, 240);
    const jobName = compact(job.job_name || job.jobName, 160);
    const status = compact(job.status, 40).toLowerCase();
    const startedAt = compact(job.started_at || job.startedAt, 80);
    const finishedAt = compact(job.finished_at || job.finishedAt, 80);
    if (!IDENTIFIER_PATTERN.test(id) || !IDENTIFIER_PATTERN.test(jobName)) return null;
    if (!['failed', 'completed', 'succeeded', 'success', 'running', 'cancelled'].includes(status)) return null;
    if (!validTimestamp(startedAt) && !validTimestamp(finishedAt)) return null;
    return {
        id,
        job_name: jobName,
        status,
        started_at: validTimestamp(startedAt) ? new Date(Date.parse(startedAt)).toISOString() : '',
        finished_at: validTimestamp(finishedAt) ? new Date(Date.parse(finishedAt)).toISOString() : ''
    };
}

function sanitizePending(item = {}) {
    const id = compact(item.id, 240);
    const status = compact(item.status || 'pending', 40).toLowerCase();
    const createdAt = compact(item.created_at || item.createdAt, 80);
    const updatedAt = compact(item.updated_at || item.updatedAt, 80);
    if (!IDENTIFIER_PATTERN.test(id) || !PENDING_STATUSES.has(status)) return null;
    return {
        id,
        status,
        created_at: validTimestamp(createdAt) ? new Date(Date.parse(createdAt)).toISOString() : '',
        updated_at: validTimestamp(updatedAt) ? new Date(Date.parse(updatedAt)).toISOString() : ''
    };
}

function resolveOwner(input = {}, context = {}, eventStore = null) {
    return compact(
        input.owner_user_id || context.owner_user_id || context?.memory?.owner_memory?.owner_user_id
        || eventStore?.getLocalOwnerIdentity?.()?.owner_user_id,
        240
    );
}

function createOperationalStateCollector(options = {}) {
    const config = options.config || {};
    const eventStore = options.eventStore || null;
    const now = typeof options.now === 'function' ? options.now : () => new Date();
    return {
        async collect(input = {}, context = {}) {
            const ownerUserId = resolveOwner(input, context, eventStore);
            const diagnostics = [];
            let jobs = Array.isArray(context?.memory?.recent_job_runs) ? context.memory.recent_job_runs : [];
            if (ownerUserId && typeof eventStore?.listOwnerJobRuns === 'function') {
                try {
                    jobs = await eventStore.listOwnerJobRuns(ownerUserId, { limit: MAX_JOBS });
                } catch (_error) {
                    diagnostics.push({ source: 'owner_jobs', code: 'OWNER_JOB_READ_FAILED' });
                }
            }
            const pending = Array.isArray(context?.memory?.pending_confirmations)
                ? context.memory.pending_confirmations
                : [];
            return {
                schema_version: OPERATIONAL_STATE_SCHEMA_VERSION,
                owner_user_id: ownerUserId,
                observed_at: new Date(now()).toISOString(),
                readiness: resolveConfigReadiness(config),
                jobs: jobs.map(sanitizeJob).filter(Boolean).slice(0, MAX_JOBS),
                pending_confirmations: pending.map(sanitizePending).filter(Boolean).slice(0, MAX_PENDING),
                diagnostics
            };
        }
    };
}

module.exports = {
    MAX_JOBS,
    MAX_PENDING,
    PENDING_STATUSES,
    OPERATIONAL_STATE_SCHEMA_VERSION,
    createOperationalStateCollector,
    resolveConfigReadiness,
    sanitizeJob,
    sanitizePending
};
