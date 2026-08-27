#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
    evaluateDeploymentPreflight
} = require('../src/environment/deployment-guard');

const DEFAULT_LINK_METADATA_PATH = 'supabase/.temp/linked-project.json';

function normalizeText(value) {
    return String(value || '').trim();
}

function parseArgs(argv) {
    const args = [...argv];
    const parsed = {
        command: normalizeText(args.shift()),
        target: '',
        operation: '',
        productionApproval: '',
        json: false
    };

    for (let index = 0; index < args.length; index += 1) {
        const arg = normalizeText(args[index]);
        if (arg === '--target') parsed.target = normalizeText(args[++index]);
        else if (arg === '--operation') parsed.operation = normalizeText(args[++index]);
        else if (arg === '--approve-production') {
            parsed.productionApproval = normalizeText(args[++index]);
        } else if (arg === '--json') parsed.json = true;
        else throw new Error(`Unknown argument: ${arg}`);
    }

    if (parsed.command !== 'check') throw new Error('Expected command: check');
    if (!parsed.target) throw new Error('--target is required');
    if (!parsed.operation) throw new Error('--operation is required');
    return Object.freeze(parsed);
}

function resolveCurrentBranch(cwd, spawn = spawnSync, env = process.env) {
    const result = spawn('git', ['branch', '--show-current'], {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
    });
    const localBranch = result.status === 0 ? normalizeText(result.stdout) : '';
    if (localBranch) return localBranch;

    const pullRequestBranch = normalizeText(env.GITHUB_HEAD_REF);
    if (pullRequestBranch) return pullRequestBranch;
    if (normalizeText(env.GITHUB_REF_TYPE) === 'branch') {
        return normalizeText(env.GITHUB_REF_NAME);
    }
    return '';
}

function readLinkedProject(cwd, fsImpl = fs) {
    const metadataPath = path.resolve(cwd, DEFAULT_LINK_METADATA_PATH);
    if (!fsImpl.existsSync(metadataPath)) return null;
    const parsed = JSON.parse(fsImpl.readFileSync(metadataPath, 'utf8'));
    return Object.freeze({
        name: normalizeText(parsed?.name),
        ref: normalizeText(parsed?.ref)
    });
}

function formatPreflightText(result) {
    const lines = [
        'BlogGenius environment preflight',
        `Decision: ${result.allowed ? 'ALLOWED' : 'DENIED'}`,
        `Target: ${result.target}`,
        `Branch: ${result.branch || '(detached or unavailable)'}`,
        `Operation: ${result.operation} (${result.surface})`,
        `Project: ${result.project.name || '(not configured)'}`,
        `Project ref: ${result.project.ref || '(not configured)'}`,
        `Linked project: ${result.linkedProject.status}`,
        `Production approval: ${result.productionApprovalRequired
            ? (result.productionApprovalVerified ? 'verified' : 'required')
            : 'not required'}`,
        `Mode: dry-run preflight`
    ];
    if (result.reasons.length) lines.push(`Reasons: ${result.reasons.join(', ')}`);
    return `${lines.join('\n')}\n`;
}

function runCli(options = {}) {
    const argv = options.argv || process.argv.slice(2);
    const cwd = options.cwd || process.cwd();
    const env = options.env || process.env;
    const parsed = parseArgs(argv);
    const branch = options.branch
        ?? resolveCurrentBranch(cwd, options.spawn || spawnSync, env);
    const linkedProject = options.linkedProject === undefined
        ? readLinkedProject(cwd, options.fs || fs)
        : options.linkedProject;
    const result = evaluateDeploymentPreflight({
        target: parsed.target,
        branch,
        operation: parsed.operation,
        productionApproval: parsed.productionApproval,
        env,
        linkedProject
    });
    const output = parsed.json
        ? `${JSON.stringify(result, null, 2)}\n`
        : formatPreflightText(result);
    return Object.freeze({ exitCode: result.allowed ? 0 : 1, output, result });
}

if (require.main === module) {
    try {
        const outcome = runCli();
        process.stdout.write(outcome.output);
        process.exitCode = outcome.exitCode;
    } catch (error) {
        process.stderr.write(`Environment preflight failed: ${error.message}\n`);
        process.exitCode = 1;
    }
}

module.exports = {
    DEFAULT_LINK_METADATA_PATH,
    parseArgs,
    resolveCurrentBranch,
    readLinkedProject,
    formatPreflightText,
    runCli
};
