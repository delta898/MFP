const test = require('node:test');
const assert = require('node:assert/strict');
const { createAgentUserRuleCapabilities } = require('./user-rules');

function fixture() {
    const rules = [];
    const store = {
        async createUserCommandRule(input) {
            const saved = { ...input, id: 'rule-1', status: 'active' };
            rules.push(saved);
            return saved;
        },
        async listUserCommandRules(userId, options = {}) {
            return rules.filter((item) => item.user_id === userId && (!options.activeOnly || item.status === 'active'));
        },
        async getUserCommandRuleByTrigger(userId, trigger) {
            const normalized = String(trigger || '').trim().toLocaleLowerCase('ko-KR');
            return rules.find((item) => item.user_id === userId && item.normalized_trigger === normalized) || null;
        },
        async getUserCommandRule(userId, id) { return rules.find((item) => item.user_id === userId && item.id === id) || null; },
        async setUserCommandRuleStatus(userId, id, status) {
            const rule = rules.find((item) => item.user_id === userId && item.id === id);
            if (!rule) return null;
            rule.status = status;
            return rule;
        },
        async deleteUserCommandRule(userId, id) {
            const index = rules.findIndex((item) => item.user_id === userId && item.id === id);
            if (index < 0) return false;
            rules.splice(index, 1);
            return true;
        },
        getLocalOwnerIdentity() { return { owner_user_id: 'local:owner' }; }
    };
    const actions = [{
        id: 'content.idea.suggest', type: 'content.generate', domain: 'content.idea',
        effect: 'generated_output', confirmPolicy: 'never',
        agentExposure: {
            title: '글감 추천', inputSchema: {
                type: 'object', properties: { query: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 5 } },
                additionalProperties: false
            }
        },
        validate(params = {}) {
            const normalizedParams = { query: String(params.query || ''), limit: Number(params.limit || 3) };
            const valid = normalizedParams.limit >= 1 && normalizedParams.limit <= 5;
            return { ok: valid, errors: valid ? [] : ['limit invalid'], normalizedParams };
        }
    }];
    return { store, actions, rules };
}

test('개인 규칙은 등록된 단일 action으로만 저장하고 확인 정책 정보를 보여준다', async () => {
    const f = fixture();
    const [create] = createAgentUserRuleCapabilities({ eventStore: f.store, listAgentCapabilities: () => f.actions });
    const params = { trigger: '[ideas]', action: { action_id: 'content.idea.suggest', params: { query: '가을 여행', limit: 3 } } };
    const context = { user: { id: 'telegram-user' }, memory: { owner_memory: { owner_user_id: 'local:owner' } } };

    const validation = await create.validate(params, context);
    assert.equal(validation.ok, true);
    const preview = await create.preview(params, context);
    assert.match(preview.summary, /\[ideas\]/);
    assert.deepEqual(preview.after.action_params, { query: '가을 여행', limit: 3 });
    const result = await create.execute(params, context);
    assert.equal(result.success, true);
    assert.equal(f.rules[0].user_id, 'telegram-user');
    assert.equal(f.rules[0].action_params.limit, 3);
});

test('개인 규칙 등록은 미등록 기능, 잘못된 입력, 인증 정보를 거부한다', async () => {
    const f = fixture();
    const [create] = createAgentUserRuleCapabilities({ eventStore: f.store, listAgentCapabilities: () => f.actions });
    const context = { user: { id: 'telegram-user' } };

    assert.equal((await create.validate({ trigger: '[bad]', action: { action_id: 'unknown.run', params: {} } }, context)).ok, false);
    assert.equal((await create.validate({ trigger: '[bad]', action: { action_id: 'content.idea.suggest', params: { limit: 8 } } }, context)).ok, false);
    assert.equal((await create.validate({ trigger: '[secret]', action: { action_id: 'content.idea.suggest', params: { query: 'x', api_key: 'secret' } } }, context)).ok, false);
});

test('개인 규칙 목록·비활성화·삭제는 요청한 사용자 범위로 동작한다', async () => {
    const f = fixture();
    const capabilities = createAgentUserRuleCapabilities({ eventStore: f.store, listAgentCapabilities: () => f.actions });
    const [create, list, remove, setStatus] = capabilities;
    const context = { user: { id: 'owner-a' } };
    await create.execute({ trigger: '[ideas]', action: { action_id: 'content.idea.suggest', params: {} } }, context);

    assert.match((await list.execute({}, context)).message, /\[ideas\].*글감 추천/);
    await setStatus.execute({ trigger: '[ideas]', status: 'disabled' }, context);
    assert.equal((await f.store.listUserCommandRules('owner-a', { activeOnly: true })).length, 0);
    const reenabled = await setStatus.execute({ trigger: '[ideas]', status: 'active' }, context);
    assert.equal(reenabled.success, true);
    assert.equal((await f.store.listUserCommandRules('owner-a', { activeOnly: true })).length, 1);
    await remove.execute({ trigger: '[ideas]' }, context);
    assert.equal((await f.store.listUserCommandRules('owner-a')).length, 0);
    assert.equal((await list.execute({}, { user: { id: 'owner-b' } })).data.rules.length, 0);
});
