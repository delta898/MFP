'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    createReleaseArtifact,
    verifyReleaseArtifact,
    verifyDevelopmentAttestation,
    createProductionPromotionChecklist
} = require('./release-artifact');

const REVISION = 'a'.repeat(40);

function createArtifact() {
    return createReleaseArtifact({ repoRoot: process.cwd(), revision: REVISION });
}

function createAttestation(artifact, overrides = {}) {
    return {
        schemaVersion: 1,
        target: 'development',
        status: 'passed',
        artifactFingerprint: artifact.fingerprint,
        sourceRevision: artifact.sourceRevision,
        migrations: artifact.payload.migrations.map((item) => item.version),
        edgeFunctions: artifact.payload.edgeFunctions,
        checks: { everyFunctionActive: true },
        ...overrides
    };
}

test('release artifact deterministically fingerprints canonical migrations and functions', () => {
    const first = createArtifact();
    const second = createArtifact();

    assert.equal(first.fingerprint, second.fingerprint);
    assert.equal(first.sourceRevision, REVISION);
    assert.equal(first.payload.migrations.length, 20);
    assert.equal(first.payload.edgeFunctions.length, 5);
    assert.ok(first.payload.edgeFunctionFiles.length > first.payload.edgeFunctions.length);
    assert.ok(first.payload.migrations.every((item) => /^[0-9]{12}$/.test(item.version)));
});

test('the same deployment files at a different revision produce a different artifact', () => {
    const first = createArtifact();
    const second = createReleaseArtifact({
        repoRoot: process.cwd(),
        revision: 'd'.repeat(40)
    });

    assert.notEqual(first.fingerprint, second.fingerprint);
});

test('artifact verification binds the payload to the current Git revision', () => {
    const artifact = createArtifact();
    const valid = verifyReleaseArtifact(artifact, { repoRoot: process.cwd(), revision: REVISION });
    const stale = verifyReleaseArtifact(artifact, {
        repoRoot: process.cwd(),
        revision: 'b'.repeat(40)
    });

    assert.equal(valid.valid, true);
    assert.equal(stale.valid, false);
    assert.ok(stale.reasons.includes('source_revision_mismatch'));
});

test('development attestation detects migration, function, and artifact drift', () => {
    const artifact = createArtifact();
    const valid = verifyDevelopmentAttestation(artifact, createAttestation(artifact));
    const drifted = verifyDevelopmentAttestation(artifact, createAttestation(artifact, {
        artifactFingerprint: 'different',
        sourceRevision: 'different',
        migrations: artifact.payload.migrations.slice(0, -1).map((item) => item.version),
        edgeFunctions: artifact.payload.edgeFunctions.slice(0, -1),
        checks: { everyFunctionActive: false }
    }));

    assert.equal(valid.valid, true);
    assert.equal(drifted.valid, false);
    assert.deepEqual(drifted.reasons, [
        'artifact_not_verified_in_development',
        'development_revision_mismatch',
        'development_function_not_active',
        'development_migration_drift',
        'development_function_drift'
    ]);
});

test('production checklist never deploys and requires identical development evidence', () => {
    const artifact = createArtifact();
    const attestation = createAttestation(artifact);
    const ready = createProductionPromotionChecklist({
        repoRoot: process.cwd(),
        revision: REVISION,
        branch: 'release/v0.4.0',
        artifact,
        attestation
    });
    const blocked = createProductionPromotionChecklist({
        repoRoot: process.cwd(),
        revision: REVISION,
        branch: 'dev',
        artifact,
        attestation
    });

    assert.equal(ready.status, 'ready_for_user_approval');
    assert.equal(ready.deploysProduction, false);
    assert.equal(ready.checks.userApprovalRequired, true);
    assert.equal(blocked.status, 'blocked');
    assert.ok(blocked.reasons.includes('production_branch_required'));
});
