'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    normalizeMigrationVersions,
    normalizeFunctions,
    createDevelopmentEvidence
} = require('./development-deployment-evidence');

test('development evidence normalizes official CLI JSON without provider credentials', () => {
    assert.deepEqual(normalizeMigrationVersions([
        { local: '202608270000', remote: '202608270000' },
        { remote_version: '202608270001' },
        { version: '202608270002', remote: false }
    ]), ['202608270000', '202608270001']);
    assert.deepEqual(normalizeFunctions([
        { name: 'knowledge-gateway', verify_jwt: true, status: 'ACTIVE' },
        { slug: 'keyword-research', verifyJwt: false, status: 'active' }
    ]), [
        { name: 'keyword-research', verify_jwt: false, status: 'ACTIVE' },
        { name: 'knowledge-gateway', verify_jwt: true, status: 'ACTIVE' }
    ]);
});

test('development evidence fails closed for missing or inactive remote surfaces', () => {
    const failed = createDevelopmentEvidence({
        artifact: { fingerprint: 'fingerprint', sourceRevision: 'revision' },
        migrationOutput: [{ remote: '202608270000' }],
        functionOutput: [{ name: 'knowledge-gateway', verify_jwt: true, status: 'INACTIVE' }]
    });
    const missing = createDevelopmentEvidence({
        artifact: { fingerprint: 'fingerprint' },
        migrationOutput: [],
        functionOutput: []
    });

    assert.equal(failed.status, 'failed');
    assert.equal(failed.checks.everyFunctionActive, false);
    assert.equal(missing.status, 'failed');
    assert.equal(missing.checks.remoteMigrationHistoryRead, false);
});
