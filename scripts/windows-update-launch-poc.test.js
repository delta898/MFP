const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

test('Windows updater launch PoC compares the current and bootstrap boundaries safely', () => {
    const app = read('scripts/windows/update-launch-poc/app/main.js');
    const runner = read('scripts/windows/update-launch-poc/run-poc.ps1');

    assert.match(app, /\['current', 'bootstrap'\]/);
    assert.match(app, /detached: true/);
    assert.match(app, /detached: false/);
    assert.match(app, /Start-Process -FilePath \$powerShellPath/);
    assert.match(app, /helper\.ready/);
    assert.match(app, /helper\.survived/);
    assert.doesNotMatch(app, /require\(['"]\.\.\/.*updater/);
    assert.doesNotMatch(app, /BlogGenius\.exe/);
    assert.match(runner, /Get-AuthenticodeSignature/);
    assert.match(runner, /CodeIntegrity\/Operational/);
    assert.match(runner, /AppLocker\/MSI and Script/);
    assert.match(runner, /Windows Defender\/Operational/);
});

test('Windows updater launch PoC runner requires the bootstrap helper to survive', () => {
    const runner = read('scripts/windows/update-launch-poc/run-poc.ps1');

    assert.match(runner, /mode -eq 'bootstrap'/);
    assert.match(runner, /\$_.helperReady -and \$_.helperSurvived/);
    assert.match(runner, /exit 1/);
});
