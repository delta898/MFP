const test = require('node:test');
const assert = require('node:assert/strict');

const { resolveToolScript } = require('./run-trends-tool');

test('resolveToolScript maps api launcher to trends-api server', () => {
    const scriptPath = resolveToolScript('api');

    assert.match(scriptPath, /apps\/trends\/trends-api\/src\/server\.js$/);
});

test('resolveToolScript maps collector launcher to trends-collector entrypoint', () => {
    const scriptPath = resolveToolScript('collector');

    assert.match(scriptPath, /apps\/trends\/trends-collector\/bin\/collect\.js$/);
});
