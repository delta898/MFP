'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { applyRuntimeNetworkPolicy } = require('./runtime-network-policy');

test('runtime network policy keeps dual-stack and widens the family attempt window', () => {
    let selected = null;
    const result = applyRuntimeNetworkPolicy({
        force: true,
        familyAttemptTimeoutMs: 1500,
        netImpl: {
            getDefaultAutoSelectFamily: () => true,
            getDefaultAutoSelectFamilyAttemptTimeout: () => 250,
            setDefaultAutoSelectFamilyAttemptTimeout(value) { selected = value; }
        }
    });

    assert.equal(selected, 1500);
    assert.deepEqual(result, {
        autoSelectFamily: true,
        familyAttemptTimeoutMs: 1500,
        previousFamilyAttemptTimeoutMs: 250,
        ipv4Only: false
    });
});

test('runtime network policy bounds invalid attempt timeout values', () => {
    let selected = null;
    applyRuntimeNetworkPolicy({
        force: true,
        familyAttemptTimeoutMs: 99999,
        netImpl: {
            getDefaultAutoSelectFamily: () => true,
            getDefaultAutoSelectFamilyAttemptTimeout: () => 250,
            setDefaultAutoSelectFamilyAttemptTimeout(value) { selected = value; }
        }
    });
    assert.equal(selected, 5000);
});
