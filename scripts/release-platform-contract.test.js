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

test('Production app releases require the canonical Production Trends API hostname', () => {
    const workflow = read('.github/workflows/build.yml');
    assert.match(workflow, /environment: production[\s\S]*BLOGGENIUS_TRENDS_API_URL: \$\{\{ vars\.BLOGGENIUS_TRENDS_API_URL \}\}[\s\S]*trends_api_url=\$BLOGGENIUS_TRENDS_API_URL/);
    assert.match(workflow, /BLOGGENIUS_BUILD_TRENDS_API_URL: \$\{\{ needs\.setup\.outputs\.trends_api_url \}\}[\s\S]*if \[\[ "\$BLOGGENIUS_BUILD_TRENDS_API_URL" != "https:\/\/trendapi\.bloggenius\.kr" \]\]/);
    assert.doesNotMatch(workflow, /BLOGGENIUS_PRODUCTION_TRENDS_API_URL/);
});
