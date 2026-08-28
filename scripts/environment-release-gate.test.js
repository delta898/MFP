'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createReleaseArtifact } = require('../src/environment/release-artifact');
const { run } = require('./environment-release-gate');

const REVISION = 'c'.repeat(40);

function withFiles(callback) {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bloggenius-release-gate-'));
    try {
        const artifact = createReleaseArtifact({ repoRoot: process.cwd(), revision: REVISION });
        const evidence = {
            schemaVersion: 1,
            target: 'development',
            status: 'passed',
            artifactFingerprint: artifact.fingerprint,
            sourceRevision: artifact.sourceRevision,
            migrations: artifact.payload.migrations.map((item) => item.version),
            edgeFunctions: artifact.payload.edgeFunctions,
            checks: { everyFunctionActive: true }
        };
        const artifactPath = path.join(tempDir, 'artifact.json');
        const evidencePath = path.join(tempDir, 'evidence.json');
        fs.writeFileSync(artifactPath, JSON.stringify(artifact));
        fs.writeFileSync(evidencePath, JSON.stringify(evidence));
        return callback({ artifactPath, evidencePath });
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}

test('CLI creates and verifies a credential-free artifact', () => {
    const created = run(['create'], { repoRoot: process.cwd(), revision: REVISION });
    const artifact = JSON.parse(created.output);

    assert.equal(created.exitCode, 0);
    assert.equal(artifact.sourceRevision, REVISION);
    assert.doesNotMatch(created.output, /publishable|password|secret/i);
});

test('CLI verifies development evidence and produces a non-deploying production checklist', () => {
    withFiles(({ artifactPath, evidencePath }) => {
        const verified = run([
            'verify-development', '--artifact', artifactPath, '--evidence', evidencePath
        ], { repoRoot: process.cwd(), revision: REVISION });
        const checklist = run([
            'production-checklist', '--artifact', artifactPath, '--evidence', evidencePath
        ], {
            repoRoot: process.cwd(),
            revision: REVISION,
            branch: 'main'
        });

        assert.equal(verified.exitCode, 0);
        assert.equal(JSON.parse(verified.output).valid, true);
        assert.equal(checklist.exitCode, 0);
        assert.equal(JSON.parse(checklist.output).deploysProduction, false);
    });
});
