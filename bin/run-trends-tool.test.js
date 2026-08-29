const test = require('node:test');
const assert = require('node:assert/strict');
const packageJson = require('../package.json');

const { parseToolLauncherArgs, resolveToolScript } = require('./run-trends-tool');

test('resolveToolScript maps api launcher to trends-api server', () => {
    const scriptPath = resolveToolScript('api');

    assert.match(scriptPath, /apps\/trends\/trends-api\/src\/server\.js$/);
});

test('resolveToolScript maps collector launcher to trends-collector entrypoint', () => {
    const scriptPath = resolveToolScript('collector');

    assert.match(scriptPath, /apps\/trends\/trends-collector\/bin\/collect\.js$/);
});

test('resolveToolScript rejects unknown launchers', () => {
    assert.throws(() => resolveToolScript('unknown'), /unknown trends tool/);
});

test('parseToolLauncherArgs separates the environment from tool arguments', () => {
    assert.deepEqual(
        parseToolLauncherArgs(['collector', '--environment', 'development', '--date', '2026-08-29']),
        {
            toolName: 'collector',
            environment: 'development',
            extraArgs: ['--date', '2026-08-29']
        }
    );
    assert.deepEqual(
        parseToolLauncherArgs(['api', '--environment=local']),
        { toolName: 'api', environment: 'local', extraArgs: [] }
    );
    assert.throws(
        () => parseToolLauncherArgs(['api', '--environment']),
        /requires a value/
    );
});

test('package scripts expose safe local and development shortcuts without production convenience launchers', () => {
    assert.equal(typeof packageJson.scripts['trends:api:local'], 'string');
    assert.equal(typeof packageJson.scripts['trends:api:development'], 'string');
    assert.equal(typeof packageJson.scripts['trends:collector:local'], 'string');
    assert.equal(typeof packageJson.scripts['trends:collector:development'], 'string');
    assert.equal(packageJson.scripts['trends:api:production'], undefined);
    assert.equal(packageJson.scripts['trends:collector:production'], undefined);
});
