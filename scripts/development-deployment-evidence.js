#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
}

function valueAfter(args, flag) {
    const index = args.indexOf(flag);
    return index >= 0 ? String(args[index + 1] || '').trim() : '';
}

function normalizeMigrationVersions(value) {
    const rows = Array.isArray(value)
        ? value
        : (value?.migrations || value?.result || value?.data || []);
    return rows
        .map((row) => {
            if (typeof row === 'string') return row.trim();
            if (Object.hasOwn(row || {}, 'remote_version')) {
                return String(row.remote_version || '').trim();
            }
            if (typeof row?.remote === 'string') return row.remote.trim();
            if (row?.remote === false || row?.remote === null) return '';
            return String(row?.version || '').trim();
        })
        .filter((version) => /^\d{12,14}$/.test(version));
}

function normalizeFunctions(value) {
    const rows = Array.isArray(value)
        ? value
        : (value?.functions || value?.result || value?.data || []);
    return rows
        .map((row) => ({
            name: String(row?.name || row?.slug || '').trim(),
            verify_jwt: row?.verify_jwt === true || row?.verifyJwt === true,
            status: String(row?.status || 'ACTIVE').trim().toUpperCase()
        }))
        .filter((row) => row.name)
        .sort((left, right) => left.name.localeCompare(right.name));
}

function createDevelopmentEvidence({ artifact, migrationOutput, functionOutput }) {
    const migrations = normalizeMigrationVersions(migrationOutput);
    const functionRows = normalizeFunctions(functionOutput);
    const edgeFunctions = functionRows.map(({ name, verify_jwt }) => ({ name, verify_jwt }));
    const active = functionRows.every((item) => item.status === 'ACTIVE');
    const structurallyComplete = migrations.length > 0 && edgeFunctions.length > 0;
    return Object.freeze({
        schemaVersion: 1,
        target: 'development',
        status: structurallyComplete && active ? 'passed' : 'failed',
        artifactFingerprint: String(artifact?.fingerprint || ''),
        sourceRevision: String(artifact?.sourceRevision || ''),
        migrations: Object.freeze(migrations),
        edgeFunctions: Object.freeze(edgeFunctions),
        checks: Object.freeze({
            remoteMigrationHistoryRead: migrations.length > 0,
            remoteFunctionsRead: edgeFunctions.length > 0,
            everyFunctionActive: active
        })
    });
}

function run(argv = process.argv.slice(2)) {
    const artifactPath = valueAfter(argv, '--artifact');
    const migrationsPath = valueAfter(argv, '--migrations');
    const functionsPath = valueAfter(argv, '--functions');
    if (!artifactPath || !migrationsPath || !functionsPath) {
        throw new Error('--artifact, --migrations, and --functions are required');
    }
    const evidence = createDevelopmentEvidence({
        artifact: readJson(artifactPath),
        migrationOutput: readJson(migrationsPath),
        functionOutput: readJson(functionsPath)
    });
    return { exitCode: evidence.status === 'passed' ? 0 : 1, output: `${JSON.stringify(evidence, null, 2)}\n` };
}

if (require.main === module) {
    try {
        const result = run();
        process.stdout.write(result.output);
        process.exitCode = result.exitCode;
    } catch (error) {
        process.stderr.write(`Development evidence failed: ${error.message}\n`);
        process.exitCode = 1;
    }
}

module.exports = {
    normalizeMigrationVersions,
    normalizeFunctions,
    createDevelopmentEvidence,
    run
};
