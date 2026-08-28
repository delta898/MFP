#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
    createReleaseArtifact,
    verifyReleaseArtifact,
    verifyDevelopmentAttestation,
    createProductionPromotionChecklist
} = require('../src/environment/release-artifact');

function valueAfter(args, flag) {
    const index = args.indexOf(flag);
    return index >= 0 ? String(args[index + 1] || '').trim() : '';
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
}

function currentBranch() {
    const result = spawnSync('git', ['branch', '--show-current'], { encoding: 'utf8' });
    return result.status === 0 ? String(result.stdout || '').trim() : '';
}

function run(argv = process.argv.slice(2), options = {}) {
    const [command] = argv;
    const repoRoot = options.repoRoot || process.cwd();
    if (command === 'create') {
        const artifact = createReleaseArtifact({ repoRoot, revision: options.revision });
        return { exitCode: 0, output: `${JSON.stringify(artifact, null, 2)}\n` };
    }

    const artifactPath = valueAfter(argv, '--artifact');
    if (!artifactPath) throw new Error('--artifact is required');
    const artifact = readJson(artifactPath);
    if (command === 'verify') {
        const result = verifyReleaseArtifact(artifact, { repoRoot, revision: options.revision });
        return { exitCode: result.valid ? 0 : 1, output: `${JSON.stringify(result, null, 2)}\n` };
    }
    if (command === 'verify-development') {
        const evidencePath = valueAfter(argv, '--evidence');
        if (!evidencePath) throw new Error('--evidence is required');
        const result = verifyDevelopmentAttestation(artifact, readJson(evidencePath));
        return { exitCode: result.valid ? 0 : 1, output: `${JSON.stringify(result, null, 2)}\n` };
    }
    if (command === 'production-checklist') {
        const evidencePath = valueAfter(argv, '--evidence');
        if (!evidencePath) throw new Error('--evidence is required');
        const result = createProductionPromotionChecklist({
            repoRoot,
            revision: options.revision,
            branch: options.branch ?? currentBranch(),
            artifact,
            attestation: readJson(evidencePath)
        });
        return { exitCode: result.status === 'ready_for_user_approval' ? 0 : 1, output: `${JSON.stringify(result, null, 2)}\n` };
    }
    throw new Error('Expected command: create, verify, verify-development, or production-checklist');
}

if (require.main === module) {
    try {
        const result = run();
        process.stdout.write(result.output);
        process.exitCode = result.exitCode;
    } catch (error) {
        process.stderr.write(`Environment release gate failed: ${error.message}\n`);
        process.exitCode = 1;
    }
}

module.exports = { run };
