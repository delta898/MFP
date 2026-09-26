const assert = require('node:assert/strict');
const test = require('node:test');
const packageJson = require('../package.json');

test('full unit TC runs a dependency audit that blocks high and critical advisories', () => {
    assert.equal(packageJson.scripts['test:security'], 'npm audit --audit-level=high');
    assert.equal(packageJson.scripts['pretest:unit'], 'npm run test:security');
});

test('dependency security gate reports vulnerabilities without automatically changing dependencies', () => {
    const command = packageJson.scripts['test:security'];
    assert.doesNotMatch(command, /\baudit fix\b|--force/);
});
