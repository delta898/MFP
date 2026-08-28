'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { getBranchTargetPolicy } = require('./contract');

const ARTIFACT_SCHEMA_VERSION = 1;
const ATTESTATION_SCHEMA_VERSION = 1;

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function readJson(filePath, fsImpl = fs) {
    return JSON.parse(fsImpl.readFileSync(filePath, 'utf8'));
}

function listFiles(rootDir, fsImpl = fs) {
    const result = [];
    function visit(current) {
        for (const entry of fsImpl.readdirSync(current, { withFileTypes: true })) {
            const absolute = path.join(current, entry.name);
            if (entry.isDirectory()) visit(absolute);
            else if (entry.isFile()) result.push(absolute);
        }
    }
    visit(rootDir);
    return result.sort((left, right) => left.localeCompare(right));
}

function hashFile(repoRoot, absolutePath, fsImpl = fs) {
    return Object.freeze({
        path: path.relative(repoRoot, absolutePath).split(path.sep).join('/'),
        sha256: sha256(fsImpl.readFileSync(absolutePath))
    });
}

function resolveGitRevision(repoRoot, spawn = spawnSync) {
    const result = spawn('git', ['rev-parse', 'HEAD'], {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
    });
    if (result.status !== 0) throw new Error('Unable to resolve Git revision.');
    return String(result.stdout || '').trim();
}

function collectReleasePayload(options = {}) {
    const repoRoot = path.resolve(options.repoRoot || process.cwd());
    const fsImpl = options.fs || fs;
    const migrationDir = path.join(repoRoot, 'supabase/migrations');
    const functionDir = path.join(repoRoot, 'supabase/functions');
    const hostedManifestPath = path.join(repoRoot, 'supabase/hosted-development-manifest.json');
    const environmentManifestPath = path.join(repoRoot, 'supabase/environment-manifest.json');
    const hostedManifest = readJson(hostedManifestPath, fsImpl);

    const migrations = listFiles(migrationDir, fsImpl)
        .filter((file) => file.endsWith('.sql'))
        .map((file) => {
            const hashed = hashFile(repoRoot, file, fsImpl);
            return Object.freeze({
                version: path.basename(file).split('_')[0],
                ...hashed
            });
        });
    const edgeFunctionFiles = listFiles(functionDir, fsImpl)
        .filter((file) => /\.(?:ts|js|json)$/.test(file))
        .map((file) => hashFile(repoRoot, file, fsImpl));
    const edgeFunctions = (hostedManifest.edge_functions || [])
        .map((item) => Object.freeze({
            name: String(item.name || '').trim(),
            verify_jwt: item.verify_jwt === true
        }))
        .sort((left, right) => left.name.localeCompare(right.name));

    return Object.freeze({
        migrations: Object.freeze(migrations),
        edgeFunctions: Object.freeze(edgeFunctions),
        edgeFunctionFiles: Object.freeze(edgeFunctionFiles),
        contracts: Object.freeze([
            hashFile(repoRoot, environmentManifestPath, fsImpl),
            hashFile(repoRoot, hostedManifestPath, fsImpl)
        ])
    });
}

function createReleaseArtifact(options = {}) {
    const repoRoot = path.resolve(options.repoRoot || process.cwd());
    const revision = String(options.revision || resolveGitRevision(repoRoot, options.spawn)).trim();
    if (!/^[0-9a-f]{40}$/i.test(revision)) throw new Error('Release artifact requires a full Git revision.');
    const payload = collectReleasePayload({ ...options, repoRoot });
    const fingerprint = sha256(JSON.stringify({ sourceRevision: revision, payload }));
    return Object.freeze({
        schemaVersion: ARTIFACT_SCHEMA_VERSION,
        kind: 'bloggenius_supabase_release_artifact',
        sourceRevision: revision,
        fingerprint,
        payload
    });
}

function verifyReleaseArtifact(artifact, options = {}) {
    const expected = createReleaseArtifact(options);
    const reasons = [];
    if (artifact?.schemaVersion !== ARTIFACT_SCHEMA_VERSION) reasons.push('artifact_schema_invalid');
    if (artifact?.kind !== expected.kind) reasons.push('artifact_kind_invalid');
    if (artifact?.sourceRevision !== expected.sourceRevision) reasons.push('source_revision_mismatch');
    if (artifact?.fingerprint !== expected.fingerprint) reasons.push('artifact_fingerprint_mismatch');
    return Object.freeze({
        valid: reasons.length === 0,
        fingerprint: expected.fingerprint,
        sourceRevision: expected.sourceRevision,
        reasons: Object.freeze(reasons)
    });
}

function verifyDevelopmentAttestation(artifact, attestation = {}) {
    const reasons = [];
    if (attestation.schemaVersion !== ATTESTATION_SCHEMA_VERSION) reasons.push('attestation_schema_invalid');
    if (attestation.target !== 'development') reasons.push('attestation_target_invalid');
    if (attestation.status !== 'passed') reasons.push('development_verification_not_passed');
    if (attestation.artifactFingerprint !== artifact?.fingerprint) reasons.push('artifact_not_verified_in_development');
    if (attestation.sourceRevision !== artifact?.sourceRevision) reasons.push('development_revision_mismatch');
    if (attestation.checks?.everyFunctionActive !== true) reasons.push('development_function_not_active');

    const expectedMigrations = (artifact?.payload?.migrations || []).map((item) => item.version);
    const actualMigrations = Array.isArray(attestation.migrations)
        ? attestation.migrations.map(String)
        : [];
    if (JSON.stringify(actualMigrations) !== JSON.stringify(expectedMigrations)) {
        reasons.push('development_migration_drift');
    }

    const expectedFunctions = artifact?.payload?.edgeFunctions || [];
    const actualFunctions = Array.isArray(attestation.edgeFunctions)
        ? [...attestation.edgeFunctions]
            .map((item) => ({ name: String(item.name || ''), verify_jwt: item.verify_jwt === true }))
            .sort((left, right) => left.name.localeCompare(right.name))
        : [];
    if (JSON.stringify(actualFunctions) !== JSON.stringify(expectedFunctions)) {
        reasons.push('development_function_drift');
    }

    return Object.freeze({
        valid: reasons.length === 0,
        target: 'development',
        artifactFingerprint: String(artifact?.fingerprint || ''),
        reasons: Object.freeze(reasons)
    });
}

function createProductionPromotionChecklist(options = {}) {
    const artifactVerification = verifyReleaseArtifact(options.artifact, options);
    const developmentVerification = verifyDevelopmentAttestation(
        options.artifact,
        options.attestation
    );
    const branchPolicy = getBranchTargetPolicy(options.branch);
    const productionBranch = branchPolicy.productionCandidate === true;
    const reasons = [
        ...artifactVerification.reasons,
        ...developmentVerification.reasons
    ];
    if (!productionBranch) reasons.push('production_branch_required');

    return Object.freeze({
        schemaVersion: 1,
        kind: 'bloggenius_production_promotion_checklist',
        status: reasons.length === 0 ? 'ready_for_user_approval' : 'blocked',
        deploysProduction: false,
        branch: String(options.branch || '').trim(),
        sourceRevision: String(options.artifact?.sourceRevision || ''),
        artifactFingerprint: String(options.artifact?.fingerprint || ''),
        checks: Object.freeze({
            artifactMatchesCurrentRevision: artifactVerification.valid,
            developmentVerified: developmentVerification.valid,
            productionCandidateBranch: productionBranch,
            userApprovalRequired: true,
            productionPreflightRequired: true,
            backupAndRecoveryRunbookRequired: true
        }),
        reasons: Object.freeze([...new Set(reasons)])
    });
}

module.exports = {
    ARTIFACT_SCHEMA_VERSION,
    ATTESTATION_SCHEMA_VERSION,
    sha256,
    collectReleasePayload,
    createReleaseArtifact,
    verifyReleaseArtifact,
    verifyDevelopmentAttestation,
    createProductionPromotionChecklist
};
