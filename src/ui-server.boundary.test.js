const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const uiServerPath = path.join(__dirname, 'ui-server.js');

test('ui-server remains a bounded composition root', () => {
    const source = fs.readFileSync(uiServerPath, 'utf8');
    const lineCount = source.split('\n').length - 1;
    assert.equal(lineCount <= 1200, true, `ui-server.js grew to ${lineCount} lines`);

    for (const policyFunction of [
        'normalizeTimeHHmm',
        'normalizeBlogAutoSettings',
        'buildMajorSettings',
        'applyRuntimeConfigFromMajor',
        'parseMajorFieldsFromRequest',
        'parseBase64ImagePayload'
    ]) {
        assert.doesNotMatch(
            source,
            new RegExp(`^function ${policyFunction}\\b`, 'm'),
            `${policyFunction} belongs in a focused runtime module`
        );
    }

    assert.match(source, /createAutomationPolicyRuntime/);
    assert.match(source, /createUiSettingsFieldsRuntime/);
});
