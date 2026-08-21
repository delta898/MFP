const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { collectUnitTestFiles } = require('./run-unit-tests');

test('unit test discovery includes only sorted *.test.js files from configured roots', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bloggenius-unit-tests-'));
    try {
        fs.mkdirSync(path.join(repoRoot, 'src', 'nested'), { recursive: true });
        fs.mkdirSync(path.join(repoRoot, 'scripts'), { recursive: true });
        fs.mkdirSync(path.join(repoRoot, 'ignored'), { recursive: true });
        fs.writeFileSync(path.join(repoRoot, 'src', 'zeta.test.js'), '');
        fs.writeFileSync(path.join(repoRoot, 'src', 'nested', 'alpha.test.js'), '');
        fs.writeFileSync(path.join(repoRoot, 'scripts', 'test-ui-e2e.js'), '');
        fs.writeFileSync(path.join(repoRoot, 'scripts', 'runner.test.js'), '');
        fs.writeFileSync(path.join(repoRoot, 'ignored', 'outside.test.js'), '');

        assert.deepEqual(collectUnitTestFiles(repoRoot, ['src', 'scripts']), [
            'scripts/runner.test.js',
            'src/nested/alpha.test.js',
            'src/zeta.test.js'
        ]);
    } finally {
        fs.rmSync(repoRoot, { recursive: true, force: true });
    }
});
