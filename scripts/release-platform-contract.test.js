'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

test('official release builds target only macOS Apple Silicon and Windows x64', () => {
    const workflow = read('.github/workflows/build.yml');
    const workflowSuffixes = [...workflow.matchAll(/^\s+suffix:\s+([^\s]+)$/gm)].map(match => match[1]);

    assert.deepEqual(workflowSuffixes, ['mac-arm64', 'win-x64']);
    assert.doesNotMatch(workflow, /mac-intel|linux-x64/);
});
