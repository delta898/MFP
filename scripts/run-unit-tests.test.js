const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { DEFAULT_ROOTS, collectUnitTestFiles, createUnitTestEnvironment } = require('./run-unit-tests');

test('unit tests default to local runtime environment without overriding an explicit selection', () => {
    assert.equal(createUnitTestEnvironment({ PATH: '/bin' }).BLOGGENIUS_ENV, 'local');
    assert.equal(createUnitTestEnvironment({ BLOGGENIUS_ENV: 'development' }).BLOGGENIUS_ENV, 'development');
});

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

test('unit test discovery includes the bundled Plugin package root by default', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bloggenius-plugin-tests-'));
    try {
        fs.mkdirSync(path.join(repoRoot, 'packages', 'plugins', 'core'), { recursive: true });
        fs.writeFileSync(path.join(repoRoot, 'packages', 'plugins', 'core', 'publisher.test.js'), '');

        assert.equal(DEFAULT_ROOTS.includes('packages'), true);
        assert.deepEqual(collectUnitTestFiles(repoRoot), ['packages/plugins/core/publisher.test.js']);
    } finally {
        fs.rmSync(repoRoot, { recursive: true, force: true });
    }
});
