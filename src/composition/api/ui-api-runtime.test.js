'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createUiApiRuntime } = require('./ui-api-runtime');

test('settings route receives remote MCP configuration dependencies', () => {
    const ensureRuntimeRemoteMcpConfig = () => ({ enabled: false });
    const generateRemoteMcpBearerToken = () => 'token';
    let serviceDependencies;

    const runtime = createUiApiRuntime({
        createSettingsService(dependencies) {
            serviceDependencies = dependencies;
            return {};
        },
        createSettingsController: () => ({}),
        createSettingsRouteHandler: () => () => false,
        ensureRuntimeRemoteMcpConfig,
        generateRemoteMcpBearerToken
    });

    runtime.getSettingsRouteHandler();

    assert.equal(serviceDependencies.ensureRuntimeRemoteMcpConfig, ensureRuntimeRemoteMcpConfig);
    assert.equal(serviceDependencies.generateRemoteMcpBearerToken, generateRemoteMcpBearerToken);
});
