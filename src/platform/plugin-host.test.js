'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createPluginHost, PluginHostError } = require('./plugin-host');
const { PluginContractError } = require('./plugin-contract');
const { createContentPublishingExampleSystem } = require('../composition/content-publishing-example');

function makeManifest(overrides = {}) {
    return {
        manifestVersion: 1,
        id: 'sample-plugin',
        name: 'Sample plugin',
        hostApi: '^1.0.0',
        summary: 'A test Plugin.',
        operations: {
            run: {
                description: 'Run a sample operation.',
                inputSchema: { type: 'object' },
                outputSchema: { type: 'object' },
                capabilities: []
            }
        },
        ...overrides
    };
}

function validPlugin(overrides = {}) {
    return {
        manifest: makeManifest(),
        version: '1.0.0',
        operations: { run: { async execute(input) { return input; } } },
        ...overrides
    };
}

function createFakeTextGenerator() {
    return {
        manifest: {
            manifestVersion: 1,
            id: 'sample-text-generator',
            name: 'Sample text generator',
            hostApi: '^1.0.0',
            summary: 'Generate sample text.',
            operations: {
                generate: {
                    description: 'Generate a sample draft from a topic and audience.',
                    inputSchema: {
                        type: 'object',
                        properties: { topic: { type: 'string' }, audience: { type: 'string' } },
                        required: ['topic', 'audience'],
                        additionalProperties: false
                    },
                    outputSchema: {
                        type: 'object',
                        properties: { title: { type: 'string' }, body: { type: 'string' } },
                        required: ['title', 'body'],
                        additionalProperties: false
                    },
                    capabilities: []
                }
            }
        },
        version: '0.0.0-test',
        operations: {
            generate: {
                async execute(input) {
                    return {
                        title: `${input.topic} for ${input.audience}`,
                        body: `Sample draft about ${input.topic}.`
                    };
                }
            }
        }
    };
}

function createFakePublisher() {
    return {
        manifest: {
            manifestVersion: 1,
            id: 'sample-publisher',
            name: 'Sample publisher',
            hostApi: '^1.0.0',
            summary: 'Sample publishing operation.',
            operations: {
                publish: {
                    description: 'Publish a sample draft to a named destination.',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            draft: {
                                type: 'object',
                                properties: { title: { type: 'string' }, body: { type: 'string' } },
                                required: ['title', 'body'],
                                additionalProperties: false
                            },
                            destination: { type: 'string' }
                        },
                        required: ['draft', 'destination'],
                        additionalProperties: false
                    },
                    outputSchema: {
                        type: 'object',
                        properties: { url: { type: 'string' } },
                        required: ['url'],
                        additionalProperties: false
                    },
                    capabilities: []
                }
            }
        },
        version: '0.0.0-test',
        operations: {
            publish: {
                async execute(input) {
                    return { url: `https://example.invalid/${input.destination}` };
                }
            }
        }
    };
}

test('Host registers manifest operations and reports lifecycle state', () => {
    const host = createPluginHost({ plugins: [validPlugin()] });

    assert.equal(typeof host.register, 'function');
    assert.deepEqual(host.listPlugins(), [{
        id: 'sample-plugin', name: 'Sample plugin', version: '1.0.0', state: 'enabled', activeExecutions: 0
    }]);
    assert.deepEqual(host.listOperations(), [{
        pluginId: 'sample-plugin',
        operationId: 'run',
        description: 'Run a sample operation.',
        inputSchema: { type: 'object' },
        outputSchema: { type: 'object' },
        capabilities: []
    }]);
});

test('registration rejects invalid manifests, schemas, implementations, and duplicate IDs', () => {
    assert.throws(() => createPluginHost({ plugins: [validPlugin({ manifest: makeManifest({ id: 'Bad Id' }) })] }), PluginContractError);
    assert.throws(() => createPluginHost({ plugins: [validPlugin({ manifest: makeManifest({ operations: {} }) })] }), /manifest is invalid/i);
    assert.throws(() => createPluginHost({ plugins: [validPlugin({
        manifest: makeManifest({ operations: { run: {
            description: 'Bad schema', inputSchema: { type: 'made-up' }, outputSchema: { type: 'object' }, capabilities: []
        } } })
    })] }), /valid JSON Schema/i);
    assert.throws(() => createPluginHost({ plugins: [validPlugin({ operations: {} })] }), { code: 'PLUGIN_OPERATION_MISMATCH' });
    assert.throws(() => createPluginHost({ plugins: [validPlugin({ operations: { run: {} } })] }), /execute\(\)/i);
    assert.throws(() => createPluginHost({ plugins: [validPlugin(), validPlugin()] }), /already registered/);
    assert.throws(() => createPluginHost({ plugins: [validPlugin({
        manifest: makeManifest({ hostApi: '^2.0.0' })
    })] }), { code: 'PLUGIN_HOST_API_INCOMPATIBLE' });
});

test('Host applies manifest JSON Schemas to operation input and output without mutating values', async () => {
    const contract = makeManifest({ operations: { run: {
        description: 'Validates the input and output payload.',
        inputSchema: {
            type: 'object', properties: { accepted: { const: true } },
            required: ['accepted'], additionalProperties: false
        },
        outputSchema: {
            type: 'object', properties: { accepted: { const: true } },
            required: ['accepted'], additionalProperties: false
        },
        capabilities: []
    } } });
    const host = createPluginHost({ plugins: [validPlugin({
        manifest: contract,
        operations: { run: { async execute(input) { return input; } } }
    })] });
    const input = { accepted: true };

    assert.equal(await host.execute('sample-plugin', 'run', input), input);
    await assert.rejects(host.execute('sample-plugin', 'run', {}), (error) => (
        error instanceof PluginContractError && error.code === 'PLUGIN_OPERATION_CONTRACT_VIOLATION'
    ));
    await assert.rejects(host.execute('sample-plugin', 'missing', {}), (error) => (
        error instanceof PluginHostError && error.code === 'OPERATION_NOT_FOUND'
    ));
    await assert.rejects(host.execute('missing', 'run', input), (error) => (
        error instanceof PluginHostError && error.code === 'PLUGIN_NOT_FOUND'
    ));

    const invalidOutputHost = createPluginHost({ plugins: [validPlugin({
        manifest: contract,
        operations: { run: { async execute() { return {}; } } }
    })] });
    await assert.rejects(invalidOutputHost.execute('sample-plugin', 'run', input), (error) => (
        error instanceof PluginContractError && error.code === 'PLUGIN_OPERATION_CONTRACT_VIOLATION'
    ));

    const failure = new Error('provider failed');
    const failingHost = createPluginHost({ plugins: [validPlugin({
        manifest: contract,
        operations: { run: { async execute() { throw failure; } } }
    })] });
    await assert.rejects(failingHost.execute('sample-plugin', 'run', input), (error) => error === failure);
});

test('Host validates Plugin progress and binds events to the executing operation', async () => {
    const host = createPluginHost({ plugins: [validPlugin({
        operations: {
            run: {
                async execute(_input, context) {
                    context.reportProgress({ phase: 'generating', progress: 35 });
                    return {};
                }
            }
        }
    })] });
    const events = [];

    await host.execute('sample-plugin', 'run', {}, { reportProgress: (event) => events.push(event) });
    assert.deepEqual(events, [{
        pluginId: 'sample-plugin', operationId: 'run', phase: 'generating', progress: 35
    }]);
    await assert.rejects(host.execute('sample-plugin', 'run', {}, { reportProgress: true }), /callback.*function/i);

    const invalidEventHost = createPluginHost({ plugins: [validPlugin({
        operations: {
            run: {
                async execute(_input, context) {
                    context.reportProgress({ phase: 'generating', progress: 101 });
                    return {};
                }
            }
        }
    })] });
    await assert.rejects(invalidEventHost.execute('sample-plugin', 'run', {}, {
        reportProgress() {}
    }), /0 to 100/);
});

test('Host validates generic staged progress and forwards counters for long-running operations', async () => {
    const host = createPluginHost({ plugins: [validPlugin({
        operations: {
            run: {
                async execute(_input, context) {
                    context.reportProgress({ phase: 'uploading', stage: 'image', current: 2, total: 4, progress: 50 });
                    return {};
                }
            }
        }
    })] });
    const events = [];

    await host.execute('sample-plugin', 'run', {}, { reportProgress: (event) => events.push(event) });
    assert.deepEqual(events, [{
        pluginId: 'sample-plugin', operationId: 'run', phase: 'uploading', progress: 50,
        stage: 'image', current: 2, total: 4
    }]);
});

test('Host rejects malformed generic progress stages and counters', async () => {
    for (const event of [
        { phase: 'working', stage: 'Image' },
        { phase: 'working', current: 1 },
        { phase: 'working', current: 3, total: 2 },
        { phase: 'working', current: 1.5, total: 2 }
    ]) {
        const host = createPluginHost({ plugins: [validPlugin({
            operations: {
                run: { async execute(_input, context) { context.reportProgress(event); return {}; } }
            }
        })] });
        await assert.rejects(host.execute('sample-plugin', 'run', {}, { reportProgress() {} }), /progress/i);
    }
});

test('disable blocks new work and waits for active executions to drain', async () => {
    let finish;
    const active = new Promise((resolve) => { finish = resolve; });
    const host = createPluginHost({ plugins: [validPlugin({
        operations: { run: { async execute() { await active; return { done: true }; } } }
    })] });

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

test('Application composes generation and publishing through manifest-validated Host operations', async () => {
    const system = createContentPublishingExampleSystem([
        createFakeTextGenerator(),
        createFakePublisher()
    ]);

    await assert.rejects(system.application.publish({ topic: 'missing fields' }), /requires topic, audience, and destination/);

    assert.deepEqual(await system.application.publish({
        topic: 'platform design', audience: 'developers', destination: 'preview'
    }), {
        draft: { title: 'platform design for developers', body: 'Sample draft about platform design.' },
        publication: { url: 'https://example.invalid/preview' }
    });
});
