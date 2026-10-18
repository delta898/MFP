'use strict';

const AUTOMATION_SETTINGS_SCHEMA_VERSION = 1;
const MIN_INTERVAL_MINUTES = 10;
const MAX_INTERVAL_MINUTES = 360;
const AUTOMATION_OWNED_FIELDS = Object.freeze([
    'enabled',
    'allowed_start_time',
    'allowed_end_time',
    'interval_minutes',
    'notification_enabled'
]);

const DEFAULT_AUTOMATION_SETTINGS = Object.freeze({
    schema_version: AUTOMATION_SETTINGS_SCHEMA_VERSION,
    enabled: false,
    allowed_start_time: '00:00',
    allowed_end_time: '23:59',
    interval_minutes: 60,
    notification_enabled: false,
    updated_at: null
});

function createSettingsError(code, message) {
    const error = new Error(message);
    error.code = code;
    error.apiCode = code;
    error.status = 400;
    return error;
}

function normalizeTime(value, fieldName) {
    const normalized = String(value || '').trim();
    const match = normalized.match(/^(\d{2}):(\d{2})$/);
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
        throw createSettingsError('CONTINUOUS_AUTOMATION_TIME_INVALID', `${fieldName}을 HH:mm 형식으로 입력해 주세요.`);
    }
    return normalized;
}

function normalizeAutomationSettings(input = {}, options = {}) {
    const strict = options.strict === true;
    const source = { ...DEFAULT_AUTOMATION_SETTINGS, ...(input && typeof input === 'object' ? input : {}) };
    const interval = Number(String(source.interval_minutes));
    if (!Number.isInteger(interval) || interval < MIN_INTERVAL_MINUTES || interval > MAX_INTERVAL_MINUTES) {
        if (strict) {
            throw createSettingsError(
                'CONTINUOUS_AUTOMATION_INTERVAL_INVALID',
                `포스팅 간격은 ${MIN_INTERVAL_MINUTES}~${MAX_INTERVAL_MINUTES}분 사이의 정수로 입력해 주세요.`
            );
        }
    }

    return {
        schema_version: AUTOMATION_SETTINGS_SCHEMA_VERSION,
        enabled: source.enabled === true,
        allowed_start_time: normalizeTime(source.allowed_start_time, '시작 시간'),
        allowed_end_time: normalizeTime(source.allowed_end_time, '종료 시간'),
        interval_minutes: Number.isInteger(interval) && interval >= MIN_INTERVAL_MINUTES && interval <= MAX_INTERVAL_MINUTES
            ? interval
            : DEFAULT_AUTOMATION_SETTINGS.interval_minutes,
        notification_enabled: source.notification_enabled === true,
        updated_at: typeof source.updated_at === 'string' && source.updated_at ? source.updated_at : null
    };
}

function minutesOfDay(value) {
    const [hours, minutes] = value.split(':').map(Number);
    return (hours * 60) + minutes;
}

function setTimeOnDate(date, totalMinutes) {
    const next = new Date(date);
    next.setHours(Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0);
    return next;
}

function computeNextRunPreview(settings, options = {}) {
    const normalized = normalizeAutomationSettings(settings);
    if (!normalized.enabled) return null;
    const now = options.now instanceof Date ? new Date(options.now) : new Date();
    const candidate = new Date(now.getTime() + (normalized.interval_minutes * 60 * 1000));
    const start = minutesOfDay(normalized.allowed_start_time);
    const end = minutesOfDay(normalized.allowed_end_time);
    const candidateMinute = (candidate.getHours() * 60) + candidate.getMinutes();

    if (start <= end) {
        if (candidateMinute < start) return setTimeOnDate(candidate, start).toISOString();
        if (candidateMinute > end) {
            const tomorrow = new Date(candidate);
            tomorrow.setDate(tomorrow.getDate() + 1);
            return setTimeOnDate(tomorrow, start).toISOString();
        }
        return candidate.toISOString();
    }

    // Overnight windows such as 22:00~06:00 include late night and early morning.
    if (candidateMinute >= start || candidateMinute <= end) return candidate.toISOString();
    return setTimeOnDate(candidate, start).toISOString();
}

function computeQueueRunProjections(settings, options = {}) {
    const count = Number.parseInt(String(options.count || '0'), 10);
    if (!Number.isInteger(count) || count <= 0) return [];
    if (typeof options.firstRunAt !== 'string' || !options.firstRunAt.trim()) return [];
    const firstRunAt = new Date(options.firstRunAt);
    if (Number.isNaN(firstRunAt.getTime())) return [];
    const projections = [firstRunAt.toISOString()];
    while (projections.length < count) {
        const nextRunAt = computeNextRunPreview(settings, {
            now: new Date(projections[projections.length - 1])
        });
        if (!nextRunAt) break;
        projections.push(nextRunAt);
    }
    return projections;
}

module.exports = {
    AUTOMATION_SETTINGS_SCHEMA_VERSION,
    AUTOMATION_OWNED_FIELDS,
    MIN_INTERVAL_MINUTES,
    MAX_INTERVAL_MINUTES,
    DEFAULT_AUTOMATION_SETTINGS,
    normalizeAutomationSettings,
    computeNextRunPreview,
    computeQueueRunProjections
};
