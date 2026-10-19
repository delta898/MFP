'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createSettingsService } = require('./service');
const { createAiModelConfiguration } = require('../../../composition/ai-model-configuration');
const { connectionVerification } = require('../../../composition/connection-verification');

function createService(aiGateway) {
    return createSettingsService({
        modelConfiguration: createAiModelConfiguration(),
        fs,
        CONFIG: {},
        aiGateway,
        connectionVerification,
        ensureRuntimeRemoteMcpConfig: () => ({ enabled: false }),
        generateRemoteMcpBearerToken: () => 'test-token',
        buildMajorSettings: () => ({ fields: {}, aiPresets: { source: 'host-fallback' } }),
        resolveWritableConfigPath: () => path.join(os.tmpdir(), 'settings-ai-catalog-config.json')
    });
}

test('Settings reads the model catalog through AI Gateway and requests a refresh on the major settings load', async () => {
    const calls = [];
    const catalog = { providers: { text: [], image: [] }, text: [{ code: 'catalog-model' }], image: [], status: { source: 'remote' } };
    const service = createService({
        async getModelCatalog(options) {
            calls.push(options || {});
            return catalog;
        }
    });

    const major = await service.getMajorSettings();
    const role = await service.getAiRoleSettings();

    assert.deepEqual(calls, [{ forceRefresh: true }, {}]);
    assert.deepEqual(major.aiPresets, catalog);
    assert.deepEqual(major.aiCatalogStatus, catalog.status);
    assert.deepEqual(role.aiPresets, catalog);
});
