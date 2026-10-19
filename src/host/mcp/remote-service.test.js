'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    configureRemoteMcpService,
    getRemoteServiceStatus,
    startRemoteMcpService,
    stopRemoteMcpService
} = require('./remote-service');

test('remote MCP lifecycle uses injected config, logger, and transport factory', async () => {
    const config = {
        mcp: { remote: { enabled: true, host: '127.0.0.1', port: 4578, path: '/mcp', auth: { bearer_token: 'test-token' } } }
    };
    const events = [];
    configureRemoteMcpService({
        config,
        logger: { info: (message) => events.push(message) },
        createServices: () => ({ adapter: {} }),
        startServer: async (options) => {
            assert.equal(options.config, config);
            assert.equal(options.authToken, 'test-token');
            return {
                host: options.host,
                port: options.port,
                path: options.path,
                endpoint: `http://${options.host}:${options.port}${options.path}`,
                close: async () => events.push('closed')
            };
        }
    });

    const started = await startRemoteMcpService();
    assert.equal(started.running, true);
    assert.equal(getRemoteServiceStatus().endpoint, 'http://127.0.0.1:4578/mcp');
    assert.equal(await stopRemoteMcpService(), true);
    assert.deepEqual(events, ['closed', 'MCP remote service stopped.']);
});
