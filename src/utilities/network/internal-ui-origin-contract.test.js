const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '../../..');
const runtimeFiles = [
    'src/applications/blog/agent-actions/publish.js'
];

test('internal UI callers use the shared origin and never the obsolete UI_SERVER_PORT', () => {
    for (const relativePath of runtimeFiles) {
        const source = fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
        assert.doesNotMatch(source, /UI_SERVER_PORT/);
        assert.match(source, /getInternalUiOrigin/);
    }
});
