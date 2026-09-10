const test = require('node:test');
const assert = require('node:assert/strict');

const { createAutomationPolicyRuntime } = require('./automation-policy-runtime');

function normalizeBool(value, fallback = false) {
    if (typeof value === 'boolean') return value;
    if (String(value).toLowerCase() === 'true') return true;
    if (String(value).toLowerCase() === 'false') return false;
    return fallback;
}

function normalizeInteger(value, fallback, { minimum = 0 } = {}) {
    const parsed = parseInt(value, 10);
    return Number.isInteger(parsed) && parsed >= minimum ? parsed : fallback;
}

function createRuntime(CONFIG = {}) {
    return createAutomationPolicyRuntime({
        CONFIG,
        Logger: { info() {}, debug() {} },
        toBoolLike: normalizeBool,
        normalizeIntegerOrBlank(value, fallback = '') {
            if (String(value ?? '').trim() === '') return fallback;
            const parsed = parseInt(value, 10);
            return Number.isInteger(parsed) ? parsed : fallback;
        },
        normalizeNonNegativeInt(value, fallback) {
            return normalizeInteger(value, fallback, { minimum: 0 });
        },
        normalizePositiveInt(value, fallback) {
            return normalizeInteger(value, fallback, { minimum: 1 });
        },
        collectTrendsDefaults: {
            enabled: false,
            categories: '',
            time: '07:30',
            reuseGapDays: 15,
            filterMinIncr: 50,
            filterIncludeNew: false,
            filterIncludeDash: false,
            filterIncludeNumber: true,
            filterType: 'min',
            filterTopN: 5
        },
        publishAutoDefaults: {
            enabled: false,
            intervalMin: 60,
            batchSize: 1,
            postStatus: 'publish',
            notifyEnabled: false,
            targetChannels: 'naver',
            headless: true,
            imageMode: 'generate',
            imageGeneration: true,
            startTime: '00:00',
            endTime: '23:59'
        }
    });
}

test('automation policy normalizes time windows without depending on the UI server', () => {
    const runtime = createRuntime();
    assert.equal(runtime.normalizeTimeHHmm('09:15'), '09:15');
    assert.equal(runtime.normalizeTimeHHmm('25:00', '07:30'), '07:30');

    const base = new Date(2026, 0, 1, 6, 0, 0, 0);
    const result = runtime.computeNextWindowedRunAt({
        delayMs: 1000,
        startTime: '07:30',
        endTime: '23:00',
        baseTimeMs: base.getTime(),
        preferWindowStartIfBaseOutside: true
    });
    assert.equal(result.runAt.getHours(), 7);
    assert.equal(result.runAt.getMinutes(), 30);
    assert.equal(result.adjustedByWindow, true);
});

test('automation policy handles missing topic history as an empty collection', () => {
    const runtime = createRuntime();
    assert.deepEqual(runtime.getRecentTopicKeys(undefined, 15, '2026-08-22'), new Set());
});

test('automation policy keeps trend and publish normalization contracts', () => {
    const runtime = createRuntime({
        COLLECT_TRENDS_ENABLED: false,
        PUBLISH_AUTO_ENABLED: false
    });
    const settings = runtime.normalizeBlogAutoSettings({
        COLLECT_TRENDS_ENABLED: true,
        COLLECT_TRENDS_CATEGORIES: '여행,맛집',
        PUBLISH_AUTO_ENABLED: true,
        PUBLISH_AUTO_POST_STATUS: 'draft',
        PUBLISH_AUTO_TARGET_CHANNELS: 'naver,wordpress',
        PUBLISH_AUTO_IMAGE_MODE: 'none'
    });

    assert.equal(settings.COLLECT_TRENDS_ENABLED, true);
    assert.equal(settings.COLLECT_TRENDS_CATEGORIES, '여행,맛집');
    assert.equal(settings.PUBLISH_AUTO_ENABLED, true);
    assert.equal(settings.PUBLISH_AUTO_POST_STATUS, 'draft');
    assert.deepEqual(settings.PUBLISH_AUTO_TARGET_CHANNELS, ['naver', 'wordpress']);
    assert.equal(settings.PUBLISH_AUTO_IMAGE_MODE, 'none');
});
