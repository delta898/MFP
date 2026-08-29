const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

function readLauncher(filename) {
    return fs.readFileSync(path.join(repoRoot, filename), 'utf8');
}

test('local trends shell launcher defaults to the local collector and exposes safe operator commands', () => {
    const source = readLauncher('trends_local.sh');

    assert.match(source, /COMMAND="collector"/);
    assert.match(source, /-\*\)/);
    assert.match(source, /npm run trends:api:local/);
    assert.match(source, /npm run trends:collector:local/);
    assert.match(source, /npm run trends:env:status -- local/);
    assert.doesNotMatch(source, /production/);
});

test('development trends shell launcher defaults to the development collector without production access', () => {
    const source = readLauncher('trends_dev.sh');

    assert.match(source, /COMMAND="collector"/);
    assert.match(source, /-\*\)/);
    assert.match(source, /npm run trends:api:development/);
    assert.match(source, /npm run trends:collector:development/);
    assert.match(source, /npm run trends:env:status -- development/);
    assert.doesNotMatch(source, /production/);
});
