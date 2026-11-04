'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PassThrough, Writable } = require('node:stream');
const test = require('node:test');
const { REQUIRED, parseArguments, promptForConfirmation, readSecretFile, syncGitHubSecrets } = require('./sync-github-secrets');

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

test('validates required and allowed names before any GitHub mutation', async (t) => {
  const values = Object.fromEntries(REQUIRED.development.map((name) => [name, `fixture-${name}`]));
  values.NEWSLETTER_EMAIL_MODE = 'allowlist';
  values.NEWSLETTER_EMAIL_ALLOWLIST = 'reader@example.test';
  values.UNEXPECTED_SECRET = 'fixture';
  const filePath = makeSecretFile(t, values);
  const calls = [];
  await assert.rejects(syncGitHubSecrets({ environment: 'development', filePath, yes: true, runCommand: (...args) => calls.push(args), output: captureOutput().stream }), /Unsupported secret names: UNEXPECTED_SECRET/);
  assert.equal(calls.length, 0);
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
  const values = Object.fromEntries(REQUIRED.development.map((name) => [name, `fixture-${name}`]));
  values.NEWSLETTER_EMAIL_MODE = 'allowlist';
  values.NEWSLETTER_EMAIL_ALLOWLIST = 'reader@example.test';
  const filePath = makeSecretFile(t, values);
  const calls = [];
  const output = captureOutput();
  const result = await syncGitHubSecrets({
    environment: 'development', filePath, yes: true,
    runCommand: (args, input) => calls.push({ args, input }), output: output.stream
  });
  assert.equal(calls[0].args.join(' '), 'auth status');
  assert.deepEqual(calls[1].args, ['secret', 'list', '--env', 'development']);
  assert.equal(calls.length, Object.keys(values).length + 2);
  assert.ok(calls.slice(2).every(({ args }) => args.at(-1) === 'development'));
  assert.deepEqual(result.updated, Object.keys(values).sort());
  for (const value of Object.values(values)) assert.ok(calls.some((call) => call.input === value));
  assert.ok(!Object.values(values).some((value) => output.read().includes(value)));
});

test('production requires an explicit production guard before reading or mutating secrets', async () => {
  let calls = 0;
  await assert.rejects(syncGitHubSecrets({ environment: 'production', filePath: '/missing', runCommand: () => { calls += 1; } }), /requires --confirm-production/);
  assert.equal(calls, 0);
});

test('production always requires interactive confirmation even if yes is requested internally', async (t) => {
  const values = Object.fromEntries(REQUIRED.production.map((name) => [name, `fixture-${name}`]));
  const filePath = makeSecretFile(t, values);
  const calls = [];
  await assert.rejects(syncGitHubSecrets({
    environment: 'production', confirmProduction: true, yes: true, filePath,
    runCommand: (args) => calls.push(args), output: captureOutput().stream
  }), /Interactive confirmation required/);
  assert.ok(!calls.some((args) => args[0] === 'secret' && args[1] === 'set'));
});

test('confirmation prompt accepts the target text from an interactive input stream', async () => {
  const input = new PassThrough();
  input.isTTY = true;
  input.end('DEVELOPMENT\n');
  await promptForConfirmation('DEVELOPMENT', { input, output: captureOutput().stream });
});
