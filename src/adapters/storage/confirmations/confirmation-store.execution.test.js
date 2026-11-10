'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ConfirmationStore } = require('./confirmation-store');

test('confirmation store retains a compact execution outcome for later status checks', () => {
    const store = new ConfirmationStore();
    store.create({ id: 'confirm-result', channel: 'mcp', userId: 'u1', conversationId: 'mcp:u1' });
    store.accept('confirm-result');

    const completed = store.markExecuted('confirm-result', [{
        action_id: 'content.manuscript.generate_and_publish',
        capability_id: 'content.manuscript.generate_and_publish',
        result: { success: true, message: '원고 ID: draft-123', data: { manuscript: 'large content omitted' } }
    }]);

    assert.equal(completed.status, 'executed');
    assert.deepEqual(completed.execution, {
        success: true,
        results: [{ action_id: 'content.manuscript.generate_and_publish', success: true, message: '원고 ID: draft-123' }]
    });
    assert.equal(Object.hasOwn(completed.execution.results[0], 'data'), false);
});

test('confirmation store marks thrown execution failures without persisting raw error messages', () => {
    const store = new ConfirmationStore();
    store.create({ id: 'confirm-failed', channel: 'mcp' });
    store.accept('confirm-failed');

    const failed = store.markExecutionFailed('confirm-failed', 'ERR_BAD_REQUEST');
    assert.equal(failed.status, 'failed');
    assert.deepEqual(failed.execution, { success: false, errorCode: 'ERR_BAD_REQUEST' });
});

test('accept and reject only transition pending items after expiry cleanup', () => {
    for (const operation of ['accept', 'reject']) {
        const store = new ConfirmationStore({ ttlMs: 1000 });
        let now = 10000;
        store._now = () => now;
        store.create({ id: 'expired' });
        now += 1000;
        assert.equal(store[operation]('expired'), null);
        assert.equal(store.get('expired').status, 'expired');
        store.create({ id: 'processed' });
        assert.ok(store.accept('processed'));
        assert.equal(store[operation]('processed'), null);
        assert.equal(store.get('processed').status, 'accepted');
    }
});

test('retention preserves accepted work and gives completion outcomes time before cleanup', () => {
    for (const outcome of ['markExecuted', 'markExecutionFailed']) {
        const store = new ConfirmationStore({ ttlMs: 1000 });
        let now = 10000;
        store._now = () => now;
        for (const id of ['active', 'pending', 'rejected']) store.create({ id });
        store.accept('active');
        store.reject('rejected');
        now += 2000;
        assert.equal(store.get('pending'), null);
        assert.equal(store.get('rejected'), null);
        assert.equal(store.get('active').status, 'accepted');
        assert.equal(store[outcome]('active').status, outcome === 'markExecuted' ? 'executed' : 'failed');
        now += 999;
        assert.ok(store.get('active'));
        now += 1;
        assert.equal(store.get('active'), null);
    }
});

test('restart preserves an old accepted item and does not make it pending again', t => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'confirmation-restart-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const persistPath = path.join(dir, 'state.json');
    const store = new ConfirmationStore({ ttlMs: 1000, persistPath });
    store._now = () => Date.now() - 10000;
    store.create({ id: 'uncertain' });
    store.accept('uncertain');
    const restarted = new ConfirmationStore({ ttlMs: 1000, persistPath });
    assert.equal(restarted.get('uncertain').status, 'accepted');
    assert.equal(restarted.accept('uncertain'), null);
    assert.deepEqual(restarted.getPending(), []);
});

test('write failure leaves disk stale across restart rather than proving an outcome', t => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'confirmation-write-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const persistPath = path.join(dir, 'state.json');
    const store = new ConfirmationStore({ persistPath });
    store.create({ id: 'uncertain' });
    store.persistPath = dir; // Persistence fails without changing the original fixture.
    assert.throws(() => store.accept('uncertain'), { code: 'CONFIRMATION_STORAGE_ERROR' });
    const restarted = new ConfirmationStore({ persistPath });
    assert.equal(restarted.get('uncertain').status, 'pending');
});

test('a completed long action retains its result after restart until its completion retention expires', t => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'confirmation-result-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const persistPath = path.join(dir, 'state.json');
    let now = Date.now() - 3000;
    class ClockStore extends ConfirmationStore { _now() { return now; } }
    const store = new ClockStore({ ttlMs: 1000, persistPath });
    store.create({ id: 'result' });
    store.accept('result');
    now += 3000;
    store.markExecuted('result', [{ action_id: 'a', result: { success: true, message: 'done' } }]);
    const restarted = new ClockStore({ ttlMs: 1000, persistPath });
    assert.equal(restarted.get('result').execution.results[0].message, 'done');
    now += 1000;
    assert.equal(restarted.get('result'), null);
});


test('atomic approval write failures before and after rename never report success', t => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'confirmation-atomic-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    for (const phase of ['partial', 'after-rename']) {
        const persistPath = path.join(dir, `${phase}.json`);
        const store = new ConfirmationStore({ persistPath });
        store.create({ id: phase });
        const write = fs.writeFileSync;
        const rename = fs.renameSync;
        try {
            if (phase === 'partial') fs.writeFileSync = function(fd, data, ...args) {
                if (store.items.get(phase).status === 'accepted') {
                    write.call(fs, fd, '{', ...args);
                    throw new Error('injected partial write');
                }
                return write.call(fs, fd, data, ...args);
            };
            else fs.renameSync = function(...args) {
                const result = rename.apply(fs, args);
                if (store.items.get(phase).status === 'accepted') throw new Error('injected post-rename failure');
                return result;
            };
            assert.throws(() => store.accept(phase), { code: 'CONFIRMATION_STORAGE_ERROR' });
        } finally {
            fs.writeFileSync = write;
            fs.renameSync = rename;
        }
        const restarted = new ConfirmationStore({ persistPath });
        assert.equal(restarted.get(phase).status, phase === 'partial' ? 'pending' : 'accepted');
    }
});

test('corrupt persisted confirmation state fails closed', t => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'confirmation-corrupt-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const persistPath = path.join(dir, 'state.json');
    fs.writeFileSync(persistPath, '{');
    assert.throws(() => new ConfirmationStore({ persistPath }), { code: 'CONFIRMATION_STORAGE_ERROR' });
});
