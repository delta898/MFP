'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PassThrough, Writable } = require('node:stream');
const test = require('node:test');
const { REQUIRED, REQUIRED_VARIABLES, ensureDevelopmentEnvironment, ensureProductionEnvironment, parseArguments, promptForConfirmation, readSecretFile, runGh, syncGitHubSecrets } = require('./sync-github-secrets');

function makeEnvironmentValues(environment) {
  return {
    ...Object.fromEntries(REQUIRED[environment].map((name) => [name,
      name === 'SUPABASE_DB_POOLER_URL'
        ? 'postgresql://postgres.hocfjolcthvtgfaxjmse:fixture-password@aws-0-us-east-1.pooler.supabase.com:5432/postgres'
        : `fixture-${name}`])),
    ...Object.fromEntries(REQUIRED_VARIABLES[environment].map((name) => [name,
      name === 'CLOUDFLARE_ACCOUNT_ID' ? 'a'.repeat(32)
        : name === 'NEWSLETTER_CANARY_EMAIL' ? 'admin@example.test'
          : `fixture-${name}`]))
  };
}

function makeSecretFile(t, values) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'github-secret-sync-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'secrets.env');
  fs.writeFileSync(filePath, Object.entries(values).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n'), { mode: 0o600 });
  fs.chmodSync(filePath, 0o600);
  return filePath;
}

function captureOutput() {
  let value = '';
  return {
    stream: new Writable({ write(chunk, _encoding, callback) { value += chunk.toString(); callback(); } }),
    read: () => value
  };
}

test('requires an explicit known environment', () => {
  assert.throws(() => parseArguments([]), /Choose --environment/);
  assert.throws(() => parseArguments(['--environment', 'prod']), /Choose --environment/);
  assert.throws(() => parseArguments(['--environment', 'development', '--yes']), /Unknown argument/);
  assert.equal(parseArguments(['--environment', 'development']).environment, 'development');
});

test('shows safe GitHub API error details without exposing token-shaped data', () => {
  assert.throws(() => runGh(['api', '--method', 'PUT', 'repos/owner/repo/environments/production'], undefined, () => ({
    status: 403,
    stderr: 'gh: Resource not accessible by personal access token (HTTP 403); Bearer ghp_abcdefghijklmnopqrstuvwxyz1234567890',
    stdout: ''
  })), (error) => {
    assert.match(error.message, /Resource not accessible by personal access token/);
    assert.doesNotMatch(error.message, /ghp_abcdefghijklmnopqrstuvwxyz/);
    return true;
  });
});

test('validates required and allowed names before any GitHub mutation', async (t) => {
  const values = makeEnvironmentValues('development');
  values.NEWSLETTER_EMAIL_MODE = 'allowlist';
  values.NEWSLETTER_EMAIL_ALLOWLIST = 'reader@example.test';
  values.UNEXPECTED_SECRET = 'fixture';
  const filePath = makeSecretFile(t, values);
  const calls = [];
  await assert.rejects(syncGitHubSecrets({ environment: 'development', filePath, yes: true, runCommand: (...args) => calls.push(args), output: captureOutput().stream }), /Unsupported secret names: UNEXPECTED_SECRET/);
  assert.equal(calls.length, 0);
});

test('requires a valid Cloudflare account ID before syncing GitHub settings', (t) => {
  const values = makeEnvironmentValues('production');
  values.CLOUDFLARE_ACCOUNT_ID = 'not-an-account-id';
  const filePath = makeSecretFile(t, values);
  assert.throws(() => readSecretFile(filePath, 'production'), /32-character hexadecimal Cloudflare account ID/);
});

test('requires a single valid Production canary destination before syncing', (t) => {
  const values = makeEnvironmentValues('production');
  values.NEWSLETTER_CANARY_EMAIL = 'not-an-email';
  const filePath = makeSecretFile(t, values);
  assert.throws(() => readSecretFile(filePath, 'production'), /NEWSLETTER_CANARY_EMAIL must be a valid/);
});

test('requires the Production Supabase IPv4 session pooler URL', (t) => {
  const values = makeEnvironmentValues('production');
  const validFilePath = makeSecretFile(t, values);
  assert.doesNotThrow(() => readSecretFile(validFilePath, 'production'));
  delete values.SUPABASE_DB_POOLER_URL;
  const missingFilePath = makeSecretFile(t, values);
  assert.throws(() => readSecretFile(missingFilePath, 'production'), /Required production secrets are missing or empty: SUPABASE_DB_POOLER_URL/);
  values.SUPABASE_DB_POOLER_URL = 'postgresql://postgres:fixture-password@db.hocfjolcthvtgfaxjmse.supabase.co:5432/postgres';
  const filePath = makeSecretFile(t, values);
  assert.throws(() => readSecretFile(filePath, 'production'), /Production session pooler on port 5432/);
  values.SUPABASE_DB_POOLER_URL = 'postgresql://postgres.hocfjolcthvtgfaxjmse:fixture-password@aws-0-us-east-1.pooler.supabase.com:6543/postgres';
  const transactionPoolerFilePath = makeSecretFile(t, values);
  assert.throws(() => readSecretFile(transactionPoolerFilePath, 'production'), /Production session pooler on port 5432/);
});

test('refuses permissive local secret file permissions', (t) => {
  const filePath = makeSecretFile(t, { CLOUDFLARE_API_TOKEN: 'fixture' });
  fs.chmodSync(filePath, 0o644);
  assert.throws(() => readSecretFile(filePath, 'development'), /permissions must be 600/);
});

test('rejects duplicate secret names', (t) => {
  const filePath = makeSecretFile(t, { CLOUDFLARE_API_TOKEN: 'fixture' });
  fs.appendFileSync(filePath, '\nCLOUDFLARE_API_TOKEN=second');
  assert.throws(() => readSecretFile(filePath, 'development'), /Duplicate secret names: CLOUDFLARE_API_TOKEN/);
});

test('syncs only names to the selected GitHub environment without printing values', async (t) => {
  const values = makeEnvironmentValues('development');
  values.NEWSLETTER_EMAIL_MODE = 'allowlist';
  values.NEWSLETTER_EMAIL_ALLOWLIST = 'reader@example.test';
  const filePath = makeSecretFile(t, values);
  const calls = [];
  const output = captureOutput();
  const result = await syncGitHubSecrets({
    environment: 'development', filePath, yes: true,
    runCommand: (args, input) => {
      calls.push({ args, input });
      if (args[0] === 'repo') return 'delta898/MFP';
      if (args[0] === 'api' && args[1] === 'repos/delta898/MFP/environments') return 'development';
      return '';
    }, output: output.stream
  });
  assert.equal(calls[0].args.join(' '), 'auth status');
  assert.deepEqual(calls[3].args, ['secret', 'list', '--env', 'development']);
  assert.deepEqual(calls[4].args, ['variable', 'list', '--env', 'development']);
  assert.equal(calls.length, Object.keys(values).length + 5);
  assert.deepEqual(result.updated, Object.keys(values).filter((name) => !REQUIRED_VARIABLES.development.includes(name)).sort());
  for (const name of REQUIRED.development) assert.ok(calls.some((call) => call.input === values[name]));
  assert.deepEqual(result.updatedVariables, ['CLOUDFLARE_ACCOUNT_ID']);
  assert.ok(calls.some(({ args }) => args.join(' ') === `variable set CLOUDFLARE_ACCOUNT_ID --env development --body ${values.CLOUDFLARE_ACCOUNT_ID}`));
  assert.ok(!Object.values(values).some((value) => output.read().includes(value)));
});

test('creates a missing Development Environment restricted to the dev branch', () => {
  const calls = [];
  const runCommand = (args, input) => {
    calls.push({ args, input });
    if (args[0] === 'api' && args[1] === 'repos/delta898/MFP/environments') return '';
    if (args[0] === 'api' && args[1] === 'repos/delta898/MFP/environments/development') {
      return JSON.stringify({ deployment_branch_policy: { custom_branch_policies: true } });
    }
    if (args[0] === 'api' && args[1] === 'repos/delta898/MFP/environments/development/deployment-branch-policies') {
      return 'dev';
    }
    return '';
  };
  assert.equal(ensureDevelopmentEnvironment({ runCommand, repo: 'delta898/MFP', environmentNames: [] }), true);
  const branchPolicy = calls.find(({ args }) => args.includes('--method') && args.includes('POST'));
  assert.deepEqual(JSON.parse(branchPolicy.input), { name: 'dev', type: 'branch' });
});

test('production requires an explicit production guard before reading or mutating secrets', async () => {
  let calls = 0;
  await assert.rejects(syncGitHubSecrets({ environment: 'production', filePath: '/missing', runCommand: () => { calls += 1; } }), /requires --confirm-production/);
  assert.equal(calls, 0);
});

test('creates a missing Production Environment with a reviewer and release-only deployment policy', () => {
  const calls = [];
  let policyReads = 0;
  const runCommand = (args, input) => {
    calls.push({ args, input });
    if (args[0] === 'api' && args[1] === 'repos/delta898/MFP/environments') return 'development';
    if (args[0] === 'api' && args[1] === 'repos/delta898/MFP/environments/production') {
      return JSON.stringify({
        protection_rules: [{ type: 'required_reviewers', prevent_self_review: false, reviewers: [{ type: 'User', reviewer: { id: 42 } }] }],
        deployment_branch_policy: { custom_branch_policies: true }
      });
    }
    if (args[0] === 'api' && args[1] === 'repos/delta898/MFP/environments/production/deployment-branch-policies') {
      policyReads += 1;
      return policyReads === 1 ? '' : 'release/*';
    }
    return '';
  };
  assert.equal(ensureProductionEnvironment({ runCommand, repo: 'delta898/MFP', reviewerId: '42' }), true);
  const create = calls.find(({ args }) => args.includes('--method') && args.includes('PUT'));
  assert.deepEqual(JSON.parse(create.input), {
    wait_timer: 0,
    prevent_self_review: false,
    reviewers: [{ type: 'User', id: 42 }],
    deployment_branch_policy: { protected_branches: false, custom_branch_policies: true }
  });
  const branchPolicy = calls.find(({ args }) => args.includes('--method') && args.includes('POST'));
  assert.deepEqual(JSON.parse(branchPolicy.input), { name: 'release/*', type: 'branch' });
});

test('repairs an existing Production Environment while preserving wait timers and reviewers', () => {
  const calls = [];
  let environmentReads = 0;
  let policyReads = 0;
  const runCommand = (args, input) => {
    calls.push({ args, input });
    if (args[0] === 'api' && args[1] === 'repos/delta898/MFP/environments') return 'development\nproduction';
    if (args[0] === 'api' && args[1] === 'repos/delta898/MFP/environments/production') {
      environmentReads += 1;
      return JSON.stringify(environmentReads === 1 ? {
        protection_rules: [
          { type: 'wait_timer', wait_timer: 10 },
          { type: 'required_reviewers', prevent_self_review: true, reviewers: [{ type: 'User', reviewer: { id: 77 } }] }
        ],
        deployment_branch_policy: null
      } : {
        protection_rules: [
          { type: 'wait_timer', wait_timer: 10 },
          { type: 'required_reviewers', prevent_self_review: false, reviewers: [
            { type: 'User', reviewer: { id: 77 } }, { type: 'User', reviewer: { id: 42 } }
          ] }
        ],
        deployment_branch_policy: { custom_branch_policies: true }
      });
    }
    if (args[0] === 'api' && args[1] === 'repos/delta898/MFP/environments/production/deployment-branch-policies') {
      policyReads += 1;
      return policyReads === 1 ? '' : 'release/*';
    }
    return '';
  };
  assert.equal(ensureProductionEnvironment({ runCommand, repo: 'delta898/MFP', reviewerId: '42' }), false);
  const update = calls.find(({ args }) => args.includes('--method') && args.includes('PUT'));
  assert.deepEqual(JSON.parse(update.input), {
    wait_timer: 10,
    prevent_self_review: false,
    reviewers: [{ type: 'User', id: 77 }, { type: 'User', id: 42 }],
    deployment_branch_policy: { protected_branches: false, custom_branch_policies: true }
  });
});

test('production always requires interactive confirmation even if yes is requested internally', async (t) => {
  const values = makeEnvironmentValues('production');
  const filePath = makeSecretFile(t, values);
  const calls = [];
  await assert.rejects(syncGitHubSecrets({
    environment: 'production', confirmProduction: true, yes: true, filePath,
    runCommand: (args) => {
      calls.push(args);
      if (args[0] === 'repo') return 'delta898/MFP';
      if (args[0] === 'api' && args.includes('user')) return '42';
      if (args[0] === 'api' && args[1] === 'repos/delta898/MFP/environments') return 'development';
      return '';
    }, output: captureOutput().stream
  }), /Interactive confirmation required/);
  assert.ok(!calls.some((args) => args[0] === 'secret' && args[1] === 'set'));
  assert.ok(!calls.some((args) => args.includes('--method')));
});

test('confirmation prompt accepts the target text from an interactive input stream', async () => {
  const input = new PassThrough();
  input.isTTY = true;
  input.end('DEVELOPMENT\n');
  await promptForConfirmation('DEVELOPMENT', { input, output: captureOutput().stream });
});
