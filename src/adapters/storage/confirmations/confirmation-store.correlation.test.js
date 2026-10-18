const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ConfirmationStore } = require('./confirmation-store');

test('confirmation correlation은 bounded identifiers로 저장하고 재시작 뒤 복원한다', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'naver-auto-blog-confirmation-'));
    const persistPath = path.join(directory, 'confirmations.json');
    try {
        const store = new ConfirmationStore({ persistPath });
        const created = store.create({
            userId: 'owner-local',
            correlation: {
                kind: 'recommendation_action',
                owner_id: 'owner-local',
                resource_id: 'recommendation:test',
                operation_id: 'handoff:test:1',
                ignored: 'not persisted'
            }
        });
        assert.deepEqual(created.correlation, {
            kind: 'recommendation_action',
            owner_id: 'owner-local',
            resource_id: 'recommendation:test',
            operation_id: 'handoff:test:1'
        });
        const restored = new ConfirmationStore({ persistPath });
        assert.deepEqual(restored.get(created.id).correlation, created.correlation);
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

test('incomplete correlation은 저장하지 않는다', () => {
    const store = new ConfirmationStore();
    assert.equal(store.create({ correlation: { kind: 'recommendation_action' } }).correlation, null);
    assert.equal(store.create({ correlation: {
        kind: 'recommendation_action', owner_id: 'owner\nother',
        resource_id: 'recommendation:test', operation_id: 'handoff:test:1'
    } }).correlation, null);
});
