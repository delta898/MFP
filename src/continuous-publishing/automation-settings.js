'use strict';

const fs = require('node:fs');
const path = require('node:path');

const AUTOMATION_SETTINGS_SCHEMA_VERSION = 1;
const AUTOMATION_SETTINGS_FILE_NAME = 'continuous_publishing.json';
const MIN_INTERVAL_MINUTES = 10;
const MAX_INTERVAL_MINUTES = 360;

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
                `발행 간격은 ${MIN_INTERVAL_MINUTES}~${MAX_INTERVAL_MINUTES}분 사이의 정수로 입력해 주세요.`
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

function createAutomationSettingsRepository(options = {}) {
    const fsImpl = options.fs || fs;
    const pathImpl = options.path || path;
    const filePath = options.filePath;
    if (!filePath) throw new Error('continuous publishing settings filePath is required.');

    return {
        filePath,
        read() {
            if (!fsImpl.existsSync(filePath)) {
                return { document: { ...DEFAULT_AUTOMATION_SETTINGS }, source: 'default', warnings: [] };
            }
            try {
                const parsed = JSON.parse(fsImpl.readFileSync(filePath, 'utf8'));
                if (Number(parsed?.schema_version) !== AUTOMATION_SETTINGS_SCHEMA_VERSION) {
                    return {
                        document: { ...DEFAULT_AUTOMATION_SETTINGS },
                        source: 'default',
                        warnings: ['지원하지 않는 연속 발행 설정 버전이라 기본값을 사용합니다.']
                    };
                }
                return { document: normalizeAutomationSettings(parsed), source: 'saved', warnings: [] };
            } catch (_error) {
                return {
                    document: { ...DEFAULT_AUTOMATION_SETTINGS },
                    source: 'default',
                    warnings: ['연속 발행 설정을 읽지 못해 기본값을 사용합니다.']
                };
            }
        },
        save(input = {}) {
            const document = {
                ...normalizeAutomationSettings(input, { strict: true }),
                updated_at: new Date().toISOString()
            };
            fsImpl.mkdirSync(pathImpl.dirname(filePath), { recursive: true });
            const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
            fsImpl.writeFileSync(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
            fsImpl.renameSync(temporaryPath, filePath);
            return { document, source: 'saved', warnings: [] };
        }
    };
}

function resolveAutomationSettingsPath(config = {}, pathImpl = path) {
    const configDir = String(config.CONFIG_DIR || '').trim();
    if (!configDir) throw new Error('CONFIG_DIR is required for continuous publishing settings.');
    return pathImpl.join(configDir, AUTOMATION_SETTINGS_FILE_NAME);
}

module.exports = {
    AUTOMATION_SETTINGS_SCHEMA_VERSION,
    AUTOMATION_SETTINGS_FILE_NAME,
    MIN_INTERVAL_MINUTES,
    MAX_INTERVAL_MINUTES,
    DEFAULT_AUTOMATION_SETTINGS,
    normalizeAutomationSettings,
    computeNextRunPreview,
    createAutomationSettingsRepository,
    resolveAutomationSettingsPath
};
