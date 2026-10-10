'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { UI_SIZE_POLICIES, evaluateUiSize } = require('./ui-size-policy');

test('UI size policies distinguish recommendations from merge-blocking maxima', () => {
    for (const [name, policy] of Object.entries(UI_SIZE_POLICIES)) {
        const metric = Object.hasOwn(policy, 'maximumLines') ? 'Lines' : 'Entries';
        const recommended = policy[`recommended${metric}`];
        const maximum = policy[`maximum${metric}`];
        assert.equal(evaluateUiSize(name, recommended).status, 'ok', `${name} at recommendation`);
        assert.equal(evaluateUiSize(name, recommended + 1).status, 'warning', `${name} above recommendation`);
        assert.equal(evaluateUiSize(name, maximum).status, 'warning', `${name} at maximum`);
        assert.equal(evaluateUiSize(name, maximum + 1).status, 'error', `${name} above maximum`);
    }
});

test('UI size policy rejects unknown categories and invalid measurements', () => {
    assert.throws(() => evaluateUiSize('unknown', 1), /Unknown UI size policy/u);
    assert.throws(() => evaluateUiSize('htmlPartial', -1), /non-negative integer/u);
    assert.throws(() => evaluateUiSize('htmlPartial', 1.5), /non-negative integer/u);
});
