const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeTrigger, normalizeUserCommandRule, matchUserCommandRule } = require('./user-command-rules');

test('사용자 trigger normalization uses exact trimmed, case-insensitive text matching', () => {
    assert.equal(normalizeTrigger('  [POST]  '), '[post]');
    assert.equal(normalizeTrigger('[post] extra'), '[post] extra');
    assert.equal(matchUserCommandRule(' [POST] ', [{ trigger: '[post]', status: 'active' }]).trigger, '[post]');
    assert.equal(matchUserCommandRule('[post] extra', [{ trigger: '[post]', status: 'active' }]), null);
    assert.equal(matchUserCommandRule('[post]', [{ trigger: '[post]', status: 'disabled' }]), null);
});

test('user command rule contract validates trigger, canonical action identity, and object parameters', () => {
    assert.deepEqual(normalizeUserCommandRule({
        trigger: '[post]', action_id: 'content.idea.suggest', params: { limit: 3 }
    }), {
        trigger: '[post]', normalized_trigger: '[post]', action_id: 'content.idea.suggest', action_params: { limit: 3 }
    });
    assert.throws(() => normalizeUserCommandRule({ trigger: 'x', action_id: 'a.b' }), { code: 'USER_RULE_TRIGGER_INVALID' });
    assert.throws(() => normalizeUserCommandRule({ trigger: '[x]', action_id: 'a.b', params: [] }), { code: 'USER_RULE_PARAMS_INVALID' });
    assert.throws(() => normalizeUserCommandRule({ trigger: '[x]', params: {} }), { code: 'USER_RULE_ACTION_INVALID' });
});
