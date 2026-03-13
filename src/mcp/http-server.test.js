const test = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');

const {
    SESSION_HEADER,
    PROTOCOL_HEADER,
    createHttpMcpHandler
} = require('./http-server');

const SilentLogger = {
    debug() { },
    info() { },
    warn() { },
    error() { }
};

function requestJson(handler, method, path, body = null, options = {}) {
    const payload = body === null ? null : JSON.stringify(body);
    const req = new PassThrough();
    req.method = method;
    req.url = path;
    req.headers = {
        accept: 'application/json, text/event-stream',
        ...(payload ? { 'content-type': 'application/json' } : {}),
        ...(options.headers || {})
    };

    const response = {
        statusCode: 200,
        headers: {},
        body: ''
    };
    const res = {
        writeHead(statusCode, headers = {}) {
            response.statusCode = statusCode;
            response.headers = Object.fromEntries(
                Object.entries(headers).map(([key, value]) => [String(key).toLowerCase(), value])
            );
        },
        end(chunk = '') {
            response.body = String(chunk || '');
        }
    };

    const handledPromise = handler.handle(req, res);
    if (payload) {
        req.write(payload);
    }
    req.end();

    return Promise.resolve(handledPromise).then(() => ({
        statusCode: response.statusCode,
        headers: response.headers,
        body: response.body ? JSON.parse(response.body) : null
    }));
}

test('http mcp server supports initialize, tools/list, prepare, and confirmation within the same session', async () => {
    const handler = createHttpMcpHandler({
        authMode: 'none',
        logger: SilentLogger
    });

    const initialize = await requestJson(handler, 'POST', '/mcp', {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
            protocolVersion: '2025-11-05',
            capabilities: {},
            clientInfo: {
                name: 'http-test',
                version: '0.0.0'
            }
        }
    }, {
        headers: {
            [PROTOCOL_HEADER]: '2025-11-05'
        }
    });

    assert.equal(initialize.statusCode, 200);
    assert.equal(initialize.body.result.serverInfo.name, 'naver-auto-blog-mcp-prototype');

    const sessionId = String(initialize.headers[SESSION_HEADER] || '').trim();
    assert.ok(sessionId);

    const tools = await requestJson(handler, 'POST', '/mcp', {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {}
    }, {
        headers: {
            [SESSION_HEADER]: sessionId,
            [PROTOCOL_HEADER]: '2025-11-05'
        }
    });

    assert.equal(tools.statusCode, 200);
    assert.equal(tools.body.result.tools.some((tool) => tool.name === 'content_request_prepare'), true);

    const prepared = await requestJson(handler, 'POST', '/mcp', {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
            name: 'content_request_prepare',
            arguments: {
                register_request: {
                    theme: 'http 원격 MCP 테스트'
                }
            }
        }
    }, {
        headers: {
            [SESSION_HEADER]: sessionId,
            [PROTOCOL_HEADER]: '2025-11-05'
        }
    });

    assert.equal(prepared.statusCode, 200);
    assert.equal(prepared.body.result.isError, false);
    assert.equal(prepared.body.result.structuredContent.ok, true);
    assert.equal(prepared.body.result.structuredContent.bundle.register_request.payload.theme, 'http 원격 MCP 테스트');

    const decided = await requestJson(handler, 'POST', '/mcp', {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
            name: 'confirmation_decide',
            arguments: {
                decision: 'reject'
            }
        }
    }, {
        headers: {
            [SESSION_HEADER]: sessionId,
            [PROTOCOL_HEADER]: '2025-11-05'
        }
    });

    assert.equal(decided.statusCode, 200);
    assert.equal(decided.body.result.isError, false);
    assert.equal(decided.body.result.structuredContent.ok, true);
    assert.equal(decided.body.result.structuredContent.status, 'rejected');
});

test('http mcp server requires bearer auth when configured', async () => {
    const handler = createHttpMcpHandler({
        authMode: 'bearer',
        authToken: 'top-secret',
        logger: SilentLogger
    });

    const unauthorized = await requestJson(handler, 'POST', '/mcp', {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
            protocolVersion: '2025-11-05'
        }
    });
    assert.equal(unauthorized.statusCode, 401);

    const authorized = await requestJson(handler, 'POST', '/mcp', {
        jsonrpc: '2.0',
        id: 2,
        method: 'initialize',
        params: {
            protocolVersion: '2025-11-05'
        }
    }, {
        headers: {
            authorization: 'Bearer top-secret',
            [PROTOCOL_HEADER]: '2025-11-05'
        }
    });
    assert.equal(authorized.statusCode, 200);
    assert.ok(String(authorized.headers[SESSION_HEADER] || '').trim());
});

test('http mcp server rejects requests without an active session after initialize', async () => {
    const handler = createHttpMcpHandler({
        authMode: 'none',
        logger: SilentLogger
    });

    const response = await requestJson(handler, 'POST', '/mcp', {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {}
    }, {
        headers: {
            [PROTOCOL_HEADER]: '2025-11-05'
        }
    });

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.error.message, 'Missing MCP session id.');
});
