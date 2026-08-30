'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
    DEFAULT_AUTOMATION_SETTINGS,
    normalizeAutomationSettings,
    computeNextRunPreview,
    createAutomationSettingsRepository
} = require('./automation-settings');

test('automation settings default to disabled and keep only execution policy fields', () => {
    assert.deepEqual(normalizeAutomationSettings({}), DEFAULT_AUTOMATION_SETTINGS);
    assert.equal(Object.hasOwn(DEFAULT_AUTOMATION_SETTINGS, 'platforms'), false);
    assert.equal(Object.hasOwn(DEFAULT_AUTOMATION_SETTINGS, 'post_status'), false);
});

test('automation settings reject unsafe intervals and malformed time windows', () => {
    assert.throws(
        () => normalizeAutomationSettings({ interval_minutes: 1 }, { strict: true }),
        error => error.code === 'CONTINUOUS_AUTOMATION_INTERVAL_INVALID'
    );
    assert.throws(
        () => normalizeAutomationSettings({ allowed_start_time: '25:00' }, { strict: true }),
        error => error.code === 'CONTINUOUS_AUTOMATION_TIME_INVALID'
    );
});

test('next run preview respects ordinary and overnight allowed windows', () => {
    assert.equal(
        computeNextRunPreview({ enabled: true, interval_minutes: 60, allowed_start_time: '09:00', allowed_end_time: '18:00' }, {
            now: new Date('2026-08-30T20:00:00+09:00')
        }),
        '2026-08-31T00:00:00.000Z'
    );
    assert.equal(
        computeNextRunPreview({ enabled: true, interval_minutes: 60, allowed_start_time: '22:00', allowed_end_time: '06:00' }, {
            now: new Date('2026-08-30T20:00:00+09:00')
        }),
        '2026-08-30T13:00:00.000Z'
    );
});

test('automation settings repository saves atomically in the device config directory', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bloggenius-continuous-settings-'));
    const filePath = path.join(directory, 'continuous_publishing.json');
    const repository = createAutomationSettingsRepository({ filePath });

    assert.equal(repository.read().source, 'default');
    const saved = repository.save({
        enabled: true,
        allowed_start_time: '08:30',
        allowed_end_time: '21:00',
        interval_minutes: 90,
        notification_enabled: true
    });

    assert.equal(saved.document.enabled, true);
    assert.equal(repository.read().document.interval_minutes, 90);
    assert.deepEqual(fs.readdirSync(directory), ['continuous_publishing.json']);
});
