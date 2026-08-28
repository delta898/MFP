'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflowPath = path.join(process.cwd(), '.github/workflows/environment-validation.yml');
const workflow = fs.readFileSync(workflowPath, 'utf8');

test('documentation and convenience launchers do not trigger environment validation', () => {
    const ignoredDocumentation = workflow.match(/- 'docs\/\*\*'/g) || [];
    const ignoredMarkdown = workflow.match(/- '\*\*\/\*\.md'/g) || [];
    const ignoredLaunchers = workflow.match(/- 'run_\*\.sh'/g) || [];

    assert.equal(ignoredDocumentation.length, 2);
    assert.equal(ignoredMarkdown.length, 2);
    assert.equal(ignoredLaunchers.length, 2);
});

test('environment CI rebuilds local Supabase before unit validation', () => {
    assert.match(workflow, /npm run env:local:start/);
    assert.match(workflow, /npm run env:local:reset/);
    assert.match(workflow, /npm run env:local:verify/);
    assert.match(workflow, /npm run test:unit/);
});

test('development drift reads hosted state and emits sanitized promotion evidence', () => {
    assert.match(workflow, /github\.ref == 'refs\/heads\/dev'/);
    assert.match(workflow, /github\.ref == 'refs\/heads\/dev' &&[\s\S]*inputs\.mode == 'development-drift'/);
    assert.match(workflow, /supabase migration list[\s\S]*--project-ref[\s\S]*--output-format json/);
    assert.match(workflow, /supabase functions list[\s\S]*--project-ref[\s\S]*--output-format json/);
    assert.doesNotMatch(workflow, /supabase link/);
    assert.match(workflow, /npm run env:development:drift/);
    assert.match(workflow, /development-promotion-/);
});

test('production remains a manual non-deploying checklist', () => {
    assert.match(workflow, /inputs\.mode == 'production-checklist'/);
    assert.match(workflow, /development_run_id is required/);
    assert.match(workflow, /npm run (?:--silent )?env:production:checklist/);
    assert.doesNotMatch(workflow, /supabase db push/);
    assert.doesNotMatch(workflow, /supabase functions deploy/);
    assert.doesNotMatch(workflow, /supabase secrets set/);
});

test('environment validation uses Node 24 based artifact and Supabase actions', () => {
    assert.doesNotMatch(workflow, /actions\/(?:upload|download)-artifact@v4/);
    assert.doesNotMatch(workflow, /supabase\/setup-cli@v[12]/);
    assert.doesNotMatch(workflow, /version:\s*latest/);
    assert.match(workflow, /actions\/upload-artifact@v6/);
    assert.match(workflow, /actions\/download-artifact@v7/);
    assert.equal((workflow.match(/supabase\/setup-cli@v3/g) || []).length, 2);
    assert.equal((workflow.match(/version:\s*2\.114\.0/g) || []).length, 2);
});
