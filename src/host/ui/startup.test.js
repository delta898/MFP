const test = require('node:test');
const assert = require('node:assert/strict');
const { createUiServerStartup } = require('./startup');

test('memory initialization precedes HTTP startup, and failures prevent HTTP startup', async () => {
    const events = [];
    let fail = false;
    const error = new Error('memory unavailable');
    const runtime = createUiServerStartup({
        config: { ROOT_DIR: '/fixture' }, logger: { info() {}, warn() {}, error() {} },
        initializeAgentMemory: async ({ baseDir }) => { events.push(['memory', baseDir]); if (fail) throw error; },
        startUiServerRuntime: async (options) => { events.push(['http', options]); return { ready: true }; }
    });
    assert.deepEqual(await runtime.startUiServer({ port: 1234 }), { ready: true });
    assert.deepEqual(events, [['memory', '/fixture'], ['http', { port: 1234 }]]);
    fail = true;
    await assert.rejects(runtime.startUiServer(), (caught) => caught === error);
    assert.equal(events.length, 3);
});
