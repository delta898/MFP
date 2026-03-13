const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawn } = require('node:child_process');
const readline = require('node:readline');

function spawnServer() {
    const serverPath = path.join(__dirname, 'stdio-server.js');
    const child = spawn(process.execPath, [serverPath], {
        cwd: path.join(__dirname, '..', '..'),
        stdio: ['pipe', 'pipe', 'pipe']
    });

    const rl = readline.createInterface({
        input: child.stdout,
        crlfDelay: Infinity
    });

    const pending = new Map();
    rl.on('line', (line) => {
        const message = JSON.parse(line);
        if (message.id !== undefined && pending.has(message.id)) {
            const resolver = pending.get(message.id);
            pending.delete(message.id);
            resolver(message);
        }
    });

    function request(id, method, params = {}) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                pending.delete(id);
                reject(new Error(`timeout waiting for response: ${method}`));
            }, 3000);

            pending.set(id, (message) => {
                clearTimeout(timeout);
                resolve(message);
            });

            child.stdin.write(`${JSON.stringify({
                jsonrpc: '2.0',
                id,
                method,
                params
            })}\n`);
        });
    }

    function notify(method, params = {}) {
        child.stdin.write(`${JSON.stringify({
            jsonrpc: '2.0',
            method,
            params
        })}\n`);
    }

    async function stop() {
        rl.close();
        child.kill('SIGTERM');
        await new Promise((resolve) => child.once('exit', resolve));
    }

    return {
        child,
        request,
        notify,
        stop
    };
}

test('stdio mcp server supports initialize, tools/list, and tools/call', async () => {
    const server = spawnServer();

    try {
        const initialized = await server.request(1, 'initialize', {
            protocolVersion: '2025-11-05',
            capabilities: {},
            clientInfo: {
                name: 'test-client',
                version: '0.0.0'
            }
        });
        assert.equal(initialized.result.protocolVersion, '2025-11-05');
        assert.equal(initialized.result.serverInfo.name, 'naver-auto-blog-mcp-prototype');

        server.notify('notifications/initialized');

        const tools = await server.request(2, 'tools/list', {});
        assert.equal(Array.isArray(tools.result.tools), true);
        assert.equal(tools.result.tools.some((tool) => tool.name === 'content_request_prepare'), true);

        const prepared = await server.request(3, 'tools/call', {
            name: 'content_request_prepare',
            arguments: {
                conversation_id: 'mcp:stdio-test',
                user_id: 'stdio-user',
                register_request: {
                    intent: 'content.register_topic',
                    payload: {
                        theme: 'stdio 확인'
                    }
                },
                publish_request: {
                    intent: 'content.publish',
                    payload: {
                        target: 'naver',
                        auto_trigger: false
                    }
                },
                ui: {
                    show_publish_options: true
                }
            }
        });
        assert.equal(prepared.result.isError, false);
        assert.equal(prepared.result.structuredContent.ok, true);
        assert.equal(prepared.result.structuredContent.confirmation_token.token_type, 'agent.confirmation');
        assert.equal(prepared.result.structuredContent.bundle.register_request.payload.theme, 'stdio 확인');
    } finally {
        await server.stop();
    }
});
