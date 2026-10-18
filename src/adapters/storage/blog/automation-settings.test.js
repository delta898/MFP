'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
    AUTOMATION_SETTINGS_SCHEMA_VERSION,
    DEFAULT_AUTOMATION_SETTINGS,
    normalizeAutomationSettings
} = require('../../../applications/blog/automation/settings-policy');
const { createAutomationSettingsRepository, resolveAutomationSettingsPath } = require('./automation-settings');

function createRepository(filePath) {
    return createAutomationSettingsRepository({
        filePath,
        schemaVersion: AUTOMATION_SETTINGS_SCHEMA_VERSION,
        defaultDocument: DEFAULT_AUTOMATION_SETTINGS,
        normalizeDocument: normalizeAutomationSettings
    });
}

test('automation settings repository saves atomically in the device config directory', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bloggenius-continuous-settings-'));
    const filePath = path.join(directory, 'continuous_publishing.json');
    const repository = createRepository(filePath);

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

test('automation settings keep their existing config filename', () => {
    assert.equal(resolveAutomationSettingsPath({ CONFIG_DIR: '/tmp/blog-genius' }), '/tmp/blog-genius/continuous_publishing.json');
});
