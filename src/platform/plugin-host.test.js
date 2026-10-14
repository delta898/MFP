'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createPluginHost, PluginHostError } = require('./plugin-host');
const { PluginContractError } = require('./plugin-contract');
const { createContentPublishingExampleSystem } = require('../composition/content-publishing-example');
const { createFakeTextGenerator, createFakePublisher } = require('../test-fixtures/platform-foundation/fake-plugins');

function validPlugin(overrides = {}) {
    return {
        id: 'sample-plugin',
        name: 'Sample plugin',
        version: '1.0.0',
        operations: {
            run: {
                description: 'Run a sample operation.',
                input: { parse: (value) => value },
                output: { parse: (value) => value },
                async execute(input) { return input; }
            }
        },
        ...overrides
    };
}

test('host registers plugins with declared operations and reports lifecycle state', () => {
    const host = createPluginHost({ plugins: [validPlugin()] });

    assert.equal('register' in host, false);
    assert.deepEqual(host.listPlugins(), [{
        id: 'sample-plugin',
        name: 'Sample plugin',
        version: '1.0.0',
        state: 'enabled',
        activeExecutions: 0
    }]);
    assert.deepEqual(host.listOperations(), [{
        pluginId: 'sample-plugin',
        operationId: 'run',
        description: 'Run a sample operation.'
    }]);
});

test('registration rejects malformed descriptors, operations, and duplicate ids', () => {
    assert.throws(() => createPluginHost({ plugins: [{ ...validPlugin(), id: 'Bad Id' }] }), PluginContractError);
    assert.throws(() => createPluginHost({ plugins: [{ ...validPlugin(), operations: {} }] }), /at least one operation/);
    assert.throws(() => createPluginHost({
        plugins: [validPlugin({ operations: { run: { description: 'Missing contracts', execute() {} } } })]
    }), /input.parse/);
    assert.throws(() => createPluginHost({ plugins: [validPlugin({
        operations: { run: { description: '', input: { parse: (value) => value }, output: { parse: (value) => value }, execute() {} } }
    })] }), /must provide a description/);
    assert.throws(() => createPluginHost({ plugins: [validPlugin(), validPlugin()] }), /already registered/);
});

test('contract parsers must be synchronous', async () => {
    const host = createPluginHost({
        plugins: [validPlugin({
            operations: {
                run: {
                    description: 'Rejects asynchronous parser test input.',
                    input: { async parse(value) { return value; } },
                    output: { parse: (value) => value },
                    async execute(input) { return input; }
                }
            }
        })]
    });

    await assert.rejects(host.execute('sample-plugin', 'run', {}), (error) => (
        error instanceof PluginContractError && /synchronous/.test(error.cause?.message || '')
    ));
});

test('execution validates input and output and preserves plugin execution errors', async () => {
    const host = createPluginHost({
        plugins: [validPlugin({
            operations: {
                run: {
                    description: 'Validates the input and output payload.',
                    input: { parse(value) { if (!value?.accepted) throw new Error('bad input'); return value; } },
                    output: { parse(value) { if (!value?.accepted) throw new Error('bad output'); return value; } },
                    async execute(input) { return input; }
                }
            }
        })]
    });

    await assert.rejects(host.execute('sample-plugin', 'run', {}), (error) => (
        error instanceof PluginContractError && error.code === 'PLUGIN_OPERATION_CONTRACT_VIOLATION'
    ));
    await assert.rejects(host.execute('sample-plugin', 'missing', {}), (error) => (
        error instanceof PluginHostError && error.code === 'OPERATION_NOT_FOUND'
    ));
    await assert.rejects(host.execute('missing', 'run', {}), (error) => (
        error instanceof PluginHostError && error.code === 'PLUGIN_NOT_FOUND'
    ));

    const invalidOutputHost = createPluginHost({
        plugins: [validPlugin({
            operations: {
                run: {
                    description: 'Rejects an invalid output payload.',
                    input: { parse: (value) => value },
                    output: { parse(value) { if (!value?.accepted) throw new Error('bad output'); return value; } },
                    async execute() { return {}; }
                }
            }
        })]
    });
    await assert.rejects(invalidOutputHost.execute('sample-plugin', 'run', {}), (error) => (
        error instanceof PluginContractError && error.code === 'PLUGIN_OPERATION_CONTRACT_VIOLATION'
    ));

    const failure = new Error('provider failed');
    const failingHost = createPluginHost({
        plugins: [validPlugin({
            operations: {
                run: {
                    description: 'Propagates execution failures.',
                    input: { parse: (value) => value },
                    output: { parse: (value) => value },
                    async execute() { throw failure; }
                }
            }
        })]
    });
    await assert.rejects(failingHost.execute('sample-plugin', 'run', {}), (error) => error === failure);
});

test('disable blocks new work and waits for an active operation to drain', async () => {
    let finish;
    const active = new Promise((resolve) => { finish = resolve; });
    const host = createPluginHost({
        plugins: [validPlugin({
            operations: {
                run: {
                    description: 'Waits for the active sample execution.',
                    input: { parse: (value) => value },
                    output: { parse: (value) => value },
                    async execute() { await active; return { done: true }; }
                }
            }
        })]
    });

    const running = host.execute('sample-plugin', 'run', {});
    const disabling = host.setEnabled('sample-plugin', false);
    assert.equal(host.listPlugins()[0].state, 'disabling');
    assert.deepEqual(host.listOperations(), []);
    await assert.rejects(host.execute('sample-plugin', 'run', {}), (error) => error.code === 'PLUGIN_DISABLED');

    let completed = false;
    disabling.then(() => { completed = true; });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(completed, false);

    finish();
    assert.deepEqual(await running, { done: true });
    assert.deepEqual(await disabling, { id: 'sample-plugin', state: 'disabled' });
    assert.deepEqual(await host.setEnabled('sample-plugin', true), { id: 'sample-plugin', state: 'enabled' });
});

test('Application composes generation and publishing through the host contract', async () => {
    const system = createContentPublishingExampleSystem([
        createFakeTextGenerator(),
        createFakePublisher()
    ]);

    await assert.rejects(system.application.publish({ topic: 'missing fields' }), /requires topic, audience, and destination/);

    assert.deepEqual(await system.application.publish({
        topic: 'platform design',
        audience: 'developers',
        destination: 'preview'
    }), {
        draft: {
            title: 'platform design for developers',
            body: 'Sample draft about platform design.'
        },
        publication: { url: 'https://example.invalid/preview' }
    });
});
