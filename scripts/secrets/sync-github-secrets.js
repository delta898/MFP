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
    'CLOUDFLARE_API_TOKEN', 'SUPABASE_ACCESS_TOKEN', 'SUPABASE_DB_PASSWORD', 'SUPABASE_DB_POOLER_URL',
    'BLOGGENIUS_DEVELOPMENT_SUPABASE_PUBLISHABLE_KEY', 'TRENDS_SUPABASE_SECRET_KEY',
    'TRENDS_API_TOKEN', 'TRENDS_READ_TOKEN_SECRET', 'TRENDS_NEWSLETTER_WORKER_TOKEN', 'TRENDS_NEWSLETTER_CANARY_TOKEN',
    'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'BREVO_API_KEY', 'NEWSLETTER_EMAIL_FROM',
    'NEWSLETTER_UNSUBSCRIBE_TOKEN_SECRET'
  ],
  production: [
    'CLOUDFLARE_API_TOKEN', 'SUPABASE_ACCESS_TOKEN', 'SUPABASE_DB_POOLER_URL',
    'BLOGGENIUS_PRODUCTION_SUPABASE_PUBLISHABLE_KEY', 'TRENDS_SUPABASE_SECRET_KEY',
    'TRENDS_API_TOKEN', 'TRENDS_READ_TOKEN_SECRET', 'TRENDS_NEWSLETTER_WORKER_TOKEN',
    'TRENDS_NEWSLETTER_CANARY_TOKEN', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID',
    'BREVO_API_KEY', 'NEWSLETTER_EMAIL_FROM', 'NEWSLETTER_UNSUBSCRIBE_TOKEN_SECRET'
  ]
});

const REQUIRED_VARIABLES = Object.freeze({
  development: ['BLOGGENIUS_TRENDS_API_URL', 'CLOUDFLARE_ACCOUNT_ID', 'NEWSLETTER_CANARY_EMAIL'],
  production: ['BLOGGENIUS_TRENDS_API_URL', 'CLOUDFLARE_ACCOUNT_ID', 'NEWSLETTER_CANARY_EMAIL']
});

const CANONICAL_TRENDS_API_URL = Object.freeze({
  development: 'https://trendapi-dev.bloggenius.kr',
  production: 'https://trendapi.bloggenius.kr'
});

// Old local Development files may still contain these. They are deliberately
// ignored because push workflows now control the mode transition themselves.
const IGNORED_LEGACY_NAMES = ['NEWSLETTER_EMAIL_MODE', 'NEWSLETTER_EMAIL_ALLOWLIST'];
const ALLOWED = new Set([...Object.values(REQUIRED).flat(), ...Object.values(REQUIRED_VARIABLES).flat(), ...IGNORED_LEGACY_NAMES]);

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
  const missingVariables = REQUIRED_VARIABLES[environment].filter((name) => !String(values[name] || '').trim());
  if (missingVariables.length) throw new Error(`Required ${environment} variables are missing or empty: ${missingVariables.join(', ')}`);
  for (const name of REQUIRED_VARIABLES[environment]) {
    if (name === 'CLOUDFLARE_ACCOUNT_ID' && !/^[a-f\d]{32}$/i.test(String(values[name]).trim())) {
      throw new Error(`${name} must be a 32-character hexadecimal Cloudflare account ID.`);
    }
    if (name === 'BLOGGENIUS_TRENDS_API_URL'
      && String(values[name]).trim() !== CANONICAL_TRENDS_API_URL[environment]) {
      throw new Error(`${name} must be ${CANONICAL_TRENDS_API_URL[environment]} for ${environment}.`);
    }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(values.NEWSLETTER_CANARY_EMAIL || '').trim())) {
    throw new Error('NEWSLETTER_CANARY_EMAIL must be a valid single administrator email address.');
  }
  if (environment === 'development' || environment === 'production') {
    let pooler;
    try { pooler = new URL(String(values.SUPABASE_DB_POOLER_URL || '').trim()); }
    catch { throw new Error(`SUPABASE_DB_POOLER_URL must be a valid ${environment} Supabase Session Pooler connection URL.`); }
    const projectRef = environment === 'development' ? 'bvtlwjbmjnfphxlrkzhm' : 'hocfjolcthvtgfaxjmse';
    if (!['postgres:', 'postgresql:'].includes(pooler.protocol)
      || !pooler.hostname.endsWith('.pooler.supabase.com')
      || pooler.port !== '5432'
      || pooler.username !== `postgres.${projectRef}`
      || pooler.pathname !== '/postgres'
      || !pooler.password) {
      throw new Error(`SUPABASE_DB_POOLER_URL must target the ${environment} Supabase Session Pooler (port 5432) and the expected project.`);
    }
  }
  return values;
}

function runGh(args, input, spawn = spawnSync) {
  const result = spawn('gh', args, {
    cwd: REPO_ROOT,
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe']
  });
  if (result.error || result.status !== 0) {
    let operation = args.slice(0, 2).join(' ');
    if (args[0] === 'secret' && args[1] === 'list') operation = `list secrets for environment ${args[args.indexOf('--env') + 1] || '(unknown)'}`;
    else if (args[0] === 'variable' && args[1] === 'list') operation = `list variables for environment ${args[args.indexOf('--env') + 1] || '(unknown)'}`;
    else if ((args[0] === 'secret' || args[0] === 'variable') && args[1] === 'set') operation = `set ${args[0]} ${args[2] || '(unknown)'}`;
    else if (args[0] === 'api') operation = `${args[1] === '--method' ? args[2] : 'GET'} ${args.find((value) => /^repos\//.test(value)) || 'GitHub API'}`;
    const safeDetail = args[0] === 'api'
      ? String(result.stderr || '').trim()
        .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [redacted]')
        .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]+)\b/g, '[redacted token]')
        .slice(0, 500)
      : '';
    throw new Error(`GitHub CLI could not ${operation} (${result.error ? 'gh unavailable' : `exit ${result.status}`})${safeDetail ? `: ${safeDetail}` : '.'}`);
  }
  return String(result.stdout || '').trim();
}

function parseJsonResult(value, operation) {
  try { return JSON.parse(value); }
  catch { throw new Error(`GitHub returned an invalid response while attempting to ${operation}.`); }
}

function listEnvironmentNames({ runCommand = runGh, repo }) {
  return runCommand(['api', `repos/${repo}/environments`, '--paginate', '--jq', '.environments[].name'])
    .split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
}

function hasProductionProtection(environment, _reviewerId, branchPolicies) {
  const hasNoApprovalGate = !(environment?.protection_rules || []).some((rule) =>
    rule?.type === 'required_reviewers' || (rule?.type === 'wait_timer' && rule.wait_timer > 0));
  return hasNoApprovalGate
    && environment?.deployment_branch_policy?.custom_branch_policies === true
    && branchPolicies.some((policy) => policy?.name === 'release/*' && policy?.type === 'branch')
    && branchPolicies.some((policy) => policy?.name === 'v*' && policy?.type === 'tag');
}

function readProductionBranchPolicies(runCommand, policyEndpoint) {
  const raw = runCommand(['api', policyEndpoint, '--paginate', '--jq', '.branch_policies']);
  const policies = raw ? parseJsonResult(raw, 'inspect the Production Environment branch and tag policies') : [];
  if (!Array.isArray(policies)) throw new Error('GitHub returned invalid Production Environment branch policies.');
  return policies;
}

function ensureProductionEnvironment({ runCommand = runGh, repo, environmentNames = listEnvironmentNames({ runCommand, repo }) }) {
  const endpoint = `repos/${repo}/environments/production`;
  const policyEndpoint = `${endpoint}/deployment-branch-policies`;
  const existed = environmentNames.includes('production');
  const current = existed
    ? parseJsonResult(runCommand(['api', endpoint]), 'inspect the Production Environment')
    : { protection_rules: [], deployment_branch_policy: null };
  const rules = Array.isArray(current?.protection_rules) ? current.protection_rules : [];
  const unsupportedRules = rules.filter((rule) => !['wait_timer', 'required_reviewers', 'branch_policy'].includes(rule?.type));
  if (unsupportedRules.length) {
    throw new Error('The existing Production Environment has protection rules this utility cannot safely preserve; no secrets or variables were changed.');
  }

  let branchPolicies = [];
  if (current?.deployment_branch_policy?.custom_branch_policies === true) {
    branchPolicies = readProductionBranchPolicies(runCommand, policyEndpoint);
    const unexpectedPolicies = branchPolicies.filter((policy) => !(
      (policy?.name === 'release/*' && policy?.type === 'branch')
      || (policy?.name === 'v*' && policy?.type === 'tag')
    ));
    if (unexpectedPolicies.length) {
      throw new Error('The existing Production Environment has unexpected deployment branch or tag policies; review them before syncing. No secrets or variables were changed.');
    }
  }

  const alreadyProtected = hasProductionProtection(current, null, branchPolicies);
  if (!alreadyProtected) {
    const updateBody = {
      wait_timer: 0,
      prevent_self_review: false,
      reviewers: [],
      deployment_branch_policy: { protected_branches: false, custom_branch_policies: true }
    };
    runCommand(['api', '--method', 'PUT', endpoint, '--input', '-'], JSON.stringify(updateBody));
  }

  let environment = parseJsonResult(runCommand(['api', endpoint]), 'verify the Production Environment protection');
  if (environment?.deployment_branch_policy?.custom_branch_policies === true) {
    branchPolicies = readProductionBranchPolicies(runCommand, policyEndpoint);
  } else {
    branchPolicies = [];
  }
  for (const required of [{ name: 'release/*', type: 'branch' }, { name: 'v*', type: 'tag' }]) {
    if (!branchPolicies.some((policy) => policy?.name === required.name && policy?.type === required.type)) {
      runCommand(['api', '--method', 'POST', policyEndpoint, '--input', '-'], JSON.stringify(required));
      branchPolicies = readProductionBranchPolicies(runCommand, policyEndpoint);
      environment = parseJsonResult(runCommand(['api', endpoint]), 'verify the Production Environment protection');
    }
  }
  if (!hasProductionProtection(environment, null, branchPolicies)) {
    throw new Error('The Production Environment protection policy could not be verified; no secrets or variables were changed.');
  }
  return !existed;
}

function ensureDevelopmentEnvironment({ runCommand = runGh, repo, environmentNames = listEnvironmentNames({ runCommand, repo }) }) {
  const endpoint = `repos/${repo}/environments/development`;
  const policyEndpoint = `${endpoint}/deployment-branch-policies`;
  const existed = environmentNames.includes('development');
  const current = existed
    ? parseJsonResult(runCommand(['api', endpoint]), 'inspect the Development Environment')
    : { protection_rules: [], deployment_branch_policy: null };
  const rules = Array.isArray(current?.protection_rules) ? current.protection_rules : [];
  if (rules.some((rule) => !['wait_timer', 'required_reviewers', 'branch_policy'].includes(rule?.type))) {
    throw new Error('The existing Development Environment has protection rules this utility cannot safely preserve; no secrets or variables were changed.');
  }

  let branchPolicies = [];
  if (current?.deployment_branch_policy?.custom_branch_policies === true) {
    branchPolicies = parseJsonResult(
      runCommand(['api', policyEndpoint, '--paginate', '--jq', '.branch_policies']),
      'inspect the Development Environment branch policies'
    );
  }
  const hasOnlyDevPolicy = current?.deployment_branch_policy?.custom_branch_policies === true
    && branchPolicies.length === 1 && branchPolicies[0]?.name === 'dev';
  if (!hasOnlyDevPolicy) {
    const reviewersByKey = new Map();
    for (const entry of rules.find((rule) => rule?.type === 'required_reviewers')?.reviewers || []) {
      const id = Number(entry?.reviewer?.id);
      if ((entry?.type === 'User' || entry?.type === 'Team') && Number.isInteger(id) && id > 0) {
        reviewersByKey.set(`${entry.type}:${id}`, { type: entry.type, id });
      }
    }
    const waitTimer = rules.find((rule) => rule?.type === 'wait_timer')?.wait_timer;
    runCommand(['api', '--method', 'PUT', endpoint, '--input', '-'], JSON.stringify({
      wait_timer: Number.isInteger(waitTimer) ? waitTimer : 0,
      prevent_self_review: rules.find((rule) => rule?.type === 'required_reviewers')?.prevent_self_review ?? false,
      reviewers: [...reviewersByKey.values()],
      deployment_branch_policy: { protected_branches: false, custom_branch_policies: true }
    }));
    const afterUpdate = runCommand(['api', policyEndpoint, '--paginate', '--jq', '.branch_policies']);
    branchPolicies = afterUpdate ? parseJsonResult(afterUpdate, 'inspect the Development Environment branch policies') : [];
    for (const policy of branchPolicies) {
      if (policy?.name !== 'dev' && policy?.id) {
        runCommand(['api', '--method', 'DELETE', `${policyEndpoint}/${policy.id}`]);
      }
    }
    if (!branchPolicies.some((policy) => policy?.name === 'dev')) {
      runCommand(['api', '--method', 'POST', policyEndpoint, '--input', '-'], JSON.stringify({ name: 'dev', type: 'branch' }));
    }
  }

  const environment = parseJsonResult(runCommand(['api', endpoint]), 'inspect the Development Environment');
  branchPolicies = parseJsonResult(
    runCommand(['api', policyEndpoint, '--paginate', '--jq', '.branch_policies']),
    'verify the Development Environment branch policies'
  );
  if (environment?.deployment_branch_policy?.custom_branch_policies !== true
    || branchPolicies.length !== 1 || branchPolicies[0]?.name !== 'dev') {
    throw new Error('The Development Environment could not be restricted to the dev branch; no secrets or variables were changed.');
  }
  return !existed;
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
  const repo = runCommand(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']);
  if (!repo) throw new Error('Could not determine the GitHub repository; no secrets or variables were changed.');
  const environmentNames = listEnvironmentNames({ runCommand, repo });
  const environmentExists = environmentNames.includes(environment);
  const names = Object.keys(values).filter((name) => REQUIRED[environment].includes(name)).sort();
  const variableNames = Object.keys(values).filter((name) => REQUIRED_VARIABLES[environment].includes(name)).sort();
  let environmentCreated = false;
  output.write(`Target GitHub Environment: ${environment}\nSecrets to update (${names.length}): ${names.join(', ')}\nVariables to update (${variableNames.length}): ${variableNames.join(', ')}\n`);
  output.write(environment === 'production'
    ? 'Environment guard: allow release/* branches and v* tags; release pushes deploy without a reviewer gate.\n'
    : 'Environment guard: allow deployment from dev only.\n');
  if (environment === 'production') {
    // No reviewer identity is needed: an authorized release/* push is the deployment approval.
  } else if (environmentExists) {
    runCommand(['secret', 'list', '--env', environment]);
    runCommand(['variable', 'list', '--env', environment]);
  }
  if (environment === 'production' || !yes) {
    await confirm(environment === 'production' ? 'PRODUCTION' : 'DEVELOPMENT', { output });
  }
  if (environment === 'production') {
    environmentCreated = ensureProductionEnvironment({ runCommand, repo, environmentNames });
  } else {
    environmentCreated = ensureDevelopmentEnvironment({ runCommand, repo, environmentNames });
  }
  if (!environmentExists || environment === 'production') {
    runCommand(['secret', 'list', '--env', environment]);
    runCommand(['variable', 'list', '--env', environment]);
  }
  let updated = 0;
  for (const name of names) {
    runCommand(['secret', 'set', name, '--env', environment], values[name]);
    updated += 1;
    output.write(`Updated ${name}\n`);
  }
  for (const name of variableNames) {
    runCommand(['variable', 'set', name, '--env', environment, '--body', values[name]]);
    output.write(`Updated variable ${name}\n`);
  }
  output.write(`Completed: ${updated} GitHub ${environment} environment secrets and ${variableNames.length} variables updated. Secret values were not displayed.\n`);
  return { environment, updated: names, updatedVariables: variableNames, environmentCreated };
}

if (require.main === module) {
  syncGitHubSecrets(parseArguments(process.argv.slice(2))).catch((error) => {
    process.stderr.write(`GitHub Environment sync stopped: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { ALLOWED, CANONICAL_TRENDS_API_URL, FILES, REQUIRED, REQUIRED_VARIABLES, ensureDevelopmentEnvironment, ensureProductionEnvironment, hasProductionProtection, listEnvironmentNames, parseArguments, promptForConfirmation, readSecretFile, runGh, syncGitHubSecrets };
