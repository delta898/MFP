const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');

function readLauncher(filename) {
    return fs.readFileSync(path.join(repoRoot, filename), 'utf8');
}

function runLauncher(filename, args = []) {
    return spawnSync('bash', [path.join(repoRoot, filename), ...args], {
        cwd: repoRoot,
        encoding: 'utf8'
    });
}

test('local trends shell launcher requires an explicit action and exposes safe operator commands', () => {
    const source = readLauncher('trends_local.sh');
    const help = runLauncher('trends_local.sh');

    assert.equal(help.status, 0);
    assert.match(help.stdout, /사용법: \.\/trends_local\.sh <명령>/);
    assert.match(help.stdout, /collect\s+네이버 트렌드 수집/);
    assert.doesNotMatch(help.stdout, /npm run/);
    assert.match(source, /collect\)/);
    assert.match(source, /npm run trends:api:local/);
    assert.match(source, /npm run trends:collector:local/);
    assert.match(source, /npm run trends:env:status -- local/);
    assert.doesNotMatch(source, /production/);
});

test('development trends shell launcher requires an explicit action without production access', () => {
    const source = readLauncher('trends_dev.sh');
    const help = runLauncher('trends_dev.sh');

    assert.equal(help.status, 0);
    assert.match(help.stdout, /사용법: \.\/trends_dev\.sh <명령>/);
    assert.match(help.stdout, /collect\s+네이버 트렌드 수집/);
    assert.doesNotMatch(help.stdout, /npm run/);
    assert.match(source, /collect\)/);
    assert.match(source, /npm run trends:api:development/);
    assert.match(source, /npm run trends:collector:development/);
    assert.match(source, /npm run trends:env:status -- development/);
    assert.doesNotMatch(source, /production/);
});

test('trends shell launchers reject implicit collector options and unknown commands', () => {
    for (const filename of ['trends_local.sh', 'trends_dev.sh']) {
        const result = runLauncher(filename, ['--date=-1d']);

        assert.equal(result.status, 2);
        assert.match(result.stderr, /알 수 없는 명령입니다/);
        assert.match(result.stderr, /사용법:/);
    }
});
