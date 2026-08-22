const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createJsCompositionRuntime } = require('../src/ui-runtime/js-composition-runtime');

const repoRoot = path.resolve(__dirname, '..');
const uiRoot = path.join(repoRoot, 'ui');

function composedScript() {
    return createJsCompositionRuntime({ fs, path }).composeJsFile({ uiRoot }).js;
}

test('composed UI script has no duplicate top-level function declarations', () => {
    const names = Array.from(
        composedScript().matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm),
        (match) => match[1]
    );
    const duplicates = [...new Set(names.filter((name, index) => names.indexOf(name) !== index))];
    assert.deepEqual(duplicates, []);
});

test('blog collection status targets the rendered result element', () => {
    const source = fs.readFileSync(path.join(uiRoot, 'scripts/features/automation/blog-collect-ui.js'), 'utf8');
    assert.match(source, /getElementById\('blog-collect-trends-result'\)/);
    assert.doesNotMatch(source, /getElementById\('blog-collect-result'\)/);
});

test('legacy action binding remains bounded until lifecycle extraction', () => {
    const filePath = path.join(uiRoot, 'scripts/features/legacy-actions-controllers.js');
    const lines = fs.readFileSync(filePath, 'utf8').split('\n').length - 1;
    assert.equal(lines <= 2600, true, `legacy action binding has ${lines} lines`);
});

test('UI lifecycle has one bootstrap and one binding registration path', () => {
    const source = fs.readFileSync(path.join(uiRoot, 'scripts/foundation/lifecycle.js'), 'utf8');
    assert.equal(Array.from(source.matchAll(/addEventListener\('DOMContentLoaded'/g)).length, 1);
    assert.equal(Array.from(source.matchAll(/\bbindActions\(\)/g)).length, 1);
    assert.equal(Array.from(source.matchAll(/\binitGlobalPublishSettingsSync\(\)/g)).length, 1);
});
