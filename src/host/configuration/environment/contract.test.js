'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    ENVIRONMENTS,
    ENVIRONMENT_NAMES,
    assertEnvironmentName,
    isEnvironmentName
} = require('./contract');

test('environment contract exposes only local, development, and production', () => {
    assert.deepEqual(ENVIRONMENT_NAMES, ['local', 'development', 'production']);
    assert.equal(ENVIRONMENTS.LOCAL, 'local');
    assert.equal(ENVIRONMENTS.DEVELOPMENT, 'development');
    assert.equal(ENVIRONMENTS.PRODUCTION, 'production');
});

test('environment names are strict and do not silently alias dev to development', () => {
    assert.equal(isEnvironmentName(' DEVELOPMENT '), true);
    assert.equal(assertEnvironmentName(' Production '), 'production');
    assert.equal(isEnvironmentName('dev'), false);
    assert.throws(() => assertEnvironmentName('dev'), /Unknown BlogGenius environment/);
    assert.throws(() => assertEnvironmentName(''), /\(empty\)/);
});

