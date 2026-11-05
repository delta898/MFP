'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyChangedPaths, detectScope } = require('./deployment-change-scope');

test('BlogGenius application changes select the BlogGenius deployment bundle only', () => {
    assert.deepEqual(classifyChangedPaths([
        'apps/trends/trends-api/workers/src/index.ts',
        'supabase/migrations/202611060001_trends_newsletter.sql',
    ]), { bloggenius: true, mentivenus: false });
});

test('MentiVenus site changes select only the standalone site bundle', () => {
    assert.deepEqual(classifyChangedPaths([
        'workspace/site-hosting/sites/www-mentivenus-com/src/pages/index.astro',
    ]), { bloggenius: false, mentivenus: true });
});

test('shared site hosting and deployment pipeline changes select both bundles', () => {
    assert.deepEqual(classifyChangedPaths([
        'packages/plugins/core/astro-site-hosting/src/index.ts',
        '.github/workflows/environment-validation.yml',
    ]), { bloggenius: true, mentivenus: true });
});

test('unrelated files do not trigger a deployment', () => {
    assert.deepEqual(classifyChangedPaths(['README.md', 'src/ui/example.js']), {
        bloggenius: false,
        mentivenus: false,
    });
});

test('manual BlogGenius release operation preserves the full paired deployment', () => {
    assert.deepEqual(detectScope({ eventName: 'workflow_dispatch', operation: 'deploy-workers' }), {
        bloggenius: true,
        mentivenus: true,
    });
});

test('manual Development drift validation targets BlogGenius only', () => {
    assert.deepEqual(detectScope({ eventName: 'workflow_dispatch', mode: 'development-drift' }), {
        bloggenius: true,
        mentivenus: false,
    });
});
