const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');

function readLauncher(filename) {
    return fs.readFileSync(
        path.join(repoRoot, 'apps', 'trends', 'trends-collector', 'commands', filename),
        'utf8'
    );
}

function runLauncher(filename, args = []) {
    return spawnSync('bash', [
        path.join(repoRoot, 'apps', 'trends', 'trends-collector', 'commands', filename),
        ...args
    ], {
        cwd: repoRoot,
        encoding: 'utf8'
    });
}

test('Local collector launcher exposes one purpose without an API server command', () => {
    const source = readLauncher('collect_local.sh');
    const help = runLauncher('collect_local.sh', ['--help']);

    assert.equal(help.status, 0);
    assert.match(help.stdout, /trends-collector\/commands\/collect_local\.sh/);
    assert.match(help.stdout, /Local Trends API로 전송/);
    assert.doesNotMatch(help.stdout, /npm run/);
    assert.match(source, /npm run trends:collector:local/);
    assert.doesNotMatch(source, /trends:api|production/);
});

test('Development collector launcher exposes one purpose without an API server command', () => {
    const source = readLauncher('collect_development.sh');
    const help = runLauncher('collect_development.sh', ['help']);

    assert.equal(help.status, 0);
    assert.match(help.stdout, /trends-collector\/commands\/collect_development\.sh/);
    assert.match(help.stdout, /Development Trends API로 전송/);
    assert.doesNotMatch(help.stdout, /npm run/);
    assert.match(source, /npm run trends:collector:development/);
    assert.doesNotMatch(source, /trends:api|production/);
});

test('collector launchers pass collection options to their explicit npm environment command', () => {
    for (const filename of ['collect_local.sh', 'collect_development.sh']) {
        const source = readLauncher(filename);

        assert.match(source, /exec npm run trends:collector:(?:local|development) -- "\$@"/);
    }
});
