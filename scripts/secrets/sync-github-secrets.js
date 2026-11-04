#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');
const { spawnSync } = require('node:child_process');
const readline = require('node:readline/promises');

const REPO_ROOT = path.resolve(__dirname, '../..');
const FILES = Object.freeze({
  development: path.join(REPO_ROOT, '.secrets/.secret.dev.env'),
  production: path.join(REPO_ROOT, '.secrets/.secret.prod.env')
});

const REQUIRED = Object.freeze({
  development: [
    'CLOUDFLARE_API_TOKEN', 'SUPABASE_ACCESS_TOKEN', 'SUPABASE_DB_PASSWORD',
    'BLOGGENIUS_DEVELOPMENT_SUPABASE_PUBLISHABLE_KEY', 'TRENDS_SUPABASE_SECRET_KEY',
    'TRENDS_API_TOKEN', 'TRENDS_READ_TOKEN_SECRET', 'TRENDS_NEWSLETTER_WORKER_TOKEN',
    'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'BREVO_API_KEY', 'NEWSLETTER_EMAIL_FROM',
    'NEWSLETTER_EMAIL_MODE', 'NEWSLETTER_EMAIL_ALLOWLIST', 'NEWSLETTER_UNSUBSCRIBE_TOKEN_SECRET'
  ],
  production: [
    'CLOUDFLARE_API_TOKEN', 'SUPABASE_ACCESS_TOKEN', 'SUPABASE_DB_PASSWORD',
    'BLOGGENIUS_PRODUCTION_SUPABASE_PUBLISHABLE_KEY', 'TRENDS_SUPABASE_SECRET_KEY',
    'TRENDS_API_TOKEN', 'TRENDS_READ_TOKEN_SECRET'
  ]
});

const ALLOWED = new Set(Object.values(REQUIRED).flat());

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--environment') options.environment = argv[++index];
    else if (argument === '--confirm-production') options.confirmProduction = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!['development', 'production'].includes(options.environment)) {
    throw new Error('Choose --environment development or production.');
  }
  return options;
}

function readSecretFile(filePath, environment) {
  if (!fs.existsSync(filePath)) throw new Error(`Secret file not found: ${path.relative(REPO_ROOT, filePath)}`);
  if (fs.lstatSync(filePath).isSymbolicLink()) throw new Error('Secret file must not be a symbolic link.');
  const mode = fs.statSync(filePath).mode & 0o777;
  if ((mode & 0o077) !== 0) throw new Error('Secret file permissions must be 600 (owner read/write only).');
  const source = fs.readFileSync(filePath, 'utf8');
  const seen = new Set();
  const duplicates = new Set();
  for (const line of source.split(/\r?\n/)) {
    const name = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1];
    if (!name) continue;
    if (seen.has(name)) duplicates.add(name);
    seen.add(name);
  }
  if (duplicates.size) throw new Error(`Duplicate secret names: ${[...duplicates].sort().join(', ')}`);
  const values = parseEnv(source);
  const names = Object.keys(values);
  if (names.length === 0) throw new Error('Secret file has no entries.');
  const unknown = names.filter((name) => !ALLOWED.has(name));
  if (unknown.length) throw new Error(`Unsupported secret names: ${unknown.join(', ')}`);
  const missing = REQUIRED[environment].filter((name) => !String(values[name] || '').trim());
  if (missing.length) throw new Error(`Required ${environment} secrets are missing or empty: ${missing.join(', ')}`);
  if (environment === 'development' && values.NEWSLETTER_EMAIL_MODE.trim() !== 'allowlist') {
    throw new Error('Development NEWSLETTER_EMAIL_MODE must be allowlist.');
  }
  if (environment === 'development' && !values.NEWSLETTER_EMAIL_ALLOWLIST.trim()) {
    throw new Error('Development NEWSLETTER_EMAIL_ALLOWLIST must contain at least one test recipient.');
  }
  return values;
}

function runGh(args, input) {
  const result = spawnSync('gh', args, {
    cwd: REPO_ROOT,
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'ignore', 'ignore']
  });
  if (result.error || result.status !== 0) throw new Error(`GitHub CLI command failed (${result.error ? 'not available' : `exit ${result.status}`}).`);
}

async function promptForConfirmation(expected, { input = process.stdin, output = process.stdout } = {}) {
  if (!input.isTTY) throw new Error('Interactive confirmation required; run this command in a terminal.');
  const prompt = readline.createInterface({ input, output, terminal: true });
  try {
    const response = (await prompt.question(`Type ${expected} to continue: `)).trim();
    if (response !== expected) throw new Error('Confirmation did not match; no secrets were changed.');
  } finally {
    prompt.close();
  }
}

async function syncGitHubSecrets({ environment, confirmProduction = false, yes = false, filePath, runCommand = runGh, output = process.stdout, confirm = promptForConfirmation }) {
  if (environment === 'production' && !confirmProduction) {
    throw new Error('Production sync requires --confirm-production.');
  }
  const values = readSecretFile(filePath || FILES[environment], environment);
  runCommand(['auth', 'status']);
  runCommand(['secret', 'list', '--env', environment]);
  const names = Object.keys(values).sort();
  output.write(`Target GitHub Environment: ${environment}\nSecrets to update (${names.length}): ${names.join(', ')}\n`);
  if (!yes || environment === 'production') {
    const expected = environment === 'production' ? 'PRODUCTION' : 'DEVELOPMENT';
    await confirm(expected, { output });
  }
  let updated = 0;
  for (const name of names) {
    runCommand(['secret', 'set', name, '--env', environment], values[name]);
    updated += 1;
    output.write(`Updated ${name}\n`);
  }
  output.write(`Completed: ${updated} GitHub ${environment} environment secrets updated. Values were not displayed.\n`);
  return { environment, updated: names };
}

if (require.main === module) {
  syncGitHubSecrets(parseArguments(process.argv.slice(2))).catch((error) => {
    process.stderr.write(`Secret sync stopped: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { ALLOWED, FILES, REQUIRED, parseArguments, promptForConfirmation, readSecretFile, syncGitHubSecrets };
