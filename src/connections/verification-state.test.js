const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MODULE_PATH = './verification-state';

function freshModule() {
    delete require.cache[require.resolve(MODULE_PATH)];
    return require(MODULE_PATH);
}

function tempFile() {
    return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'verify-state-')), 'connection_verification.json');
}

const CONFIG = { url: 'https://blog.example.com', userId: 'editor', appPassword: 'secret-1' };

test('wordpress verification survives a restart via the state file', () => {
    const filePath = tempFile();
    let store = freshModule();
    store.configureConnectionVerificationState({ fs, path, filePath });
    const recorded = store.recordWordPressVerification(CONFIG, { success: true, connected: true, message: 'ok' });
    assert.equal(recorded.status, 'connected');
    assert.ok(fs.existsSync(filePath));

    // Simulate an app restart: drop the module (and its in-memory Map) entirely.
    store = freshModule();
    store.configureConnectionVerificationState({ fs, path, filePath });
    const restored = store.getWordPressVerification(CONFIG);
    assert.equal(restored.status, 'connected');
    assert.equal(restored.connected, true);
    assert.equal(restored.message, 'ok');
    assert.ok(restored.checked_at);
});

test('changed credentials do not reuse a previous verification', () => {
    const filePath = tempFile();
    const store = freshModule();
    store.configureConnectionVerificationState({ fs, path, filePath });
    store.recordWordPressVerification(CONFIG, { success: true, connected: true });
    assert.equal(store.getWordPressVerification({ ...CONFIG, appPassword: 'secret-2' }), null);
});

test('failed verifications persist with their message', () => {
    const filePath = tempFile();
    let store = freshModule();
    store.configureConnectionVerificationState({ fs, path, filePath });
    store.recordWordPressVerification(CONFIG, { success: false, connected: false, message: '401 unauthorized' });

    store = freshModule();
    store.configureConnectionVerificationState({ fs, path, filePath });
    const restored = store.getWordPressVerification(CONFIG);
    assert.equal(restored.status, 'failed');
    assert.equal(restored.message, '401 unauthorized');
});

test('a corrupt state file degrades to unverified instead of throwing', () => {
    const filePath = tempFile();
    fs.writeFileSync(filePath, 'not-json{{{');
    const store = freshModule();
    store.configureConnectionVerificationState({ fs, path, filePath });
    assert.equal(store.getWordPressVerification(CONFIG), null);
    const recorded = store.recordWordPressVerification(CONFIG, { success: true, connected: true });
    assert.equal(recorded.status, 'connected');
});

test('reset clears memory and the state file', () => {
    const filePath = tempFile();
    const store = freshModule();
    store.configureConnectionVerificationState({ fs, path, filePath });
    store.recordWordPressVerification(CONFIG, { success: true, connected: true });
    store.resetConnectionVerificationState();
    assert.equal(store.getWordPressVerification(CONFIG), null);
    assert.deepEqual(JSON.parse(fs.readFileSync(filePath, 'utf8')), {});
});

test('generic kinds persist with trust windows', () => {
    const filePath = tempFile();
    const store = freshModule();
    store.configureConnectionVerificationState({ fs, path, filePath });
    const signature = store.createConnectionSignature(['text', 'openai', 'gpt-5', 'key-1']);
    assert.ok(signature);
    assert.equal(store.createConnectionSignature(['text', 'openai', 'gpt-5', '']), '');
    store.recordConnectionVerification('ai-role', signature, { success: true, connected: true });
    const read = store.readConnectionVerification('ai-role', signature);
    assert.equal(read.status, 'connected');
    assert.equal(store.isVerificationTrusted('ai-role', read), true);
    assert.equal(store.isVerificationTrusted('ai-role', { ...read, status: 'failed' }), false);
    const aged = { ...read, checked_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString() };
    assert.equal(store.isVerificationTrusted('ai-role', aged), false);
    assert.equal(store.isVerificationTrusted('unknown-kind', read), false);
    assert.equal(store.readConnectionVerification('ai-role', 'nope'), null);
});

test('verification meta survives restarts and lists by kind', () => {
    const filePath = tempFile();
    let store = freshModule();
    store.configureConnectionVerificationState({ fs, path, filePath });
    const sigA = store.createConnectionSignature(['text', 'openai', 'gpt-5', 'key-1']);
    const sigB = store.createConnectionSignature(['text', 'google', 'gemini-3-flash', 'key-2']);
    store.recordConnectionVerification('ai-role', sigA, { success: true, connected: true }, { scope: 'text', provider: 'openai', code: 'gpt-5' });
    store.recordConnectionVerification('ai-role', sigB, { success: true, connected: true }, { scope: 'text', provider: 'google', code: 'gemini-3-flash', base_url: '', api_key: 'key-2' });

    store = freshModule();
    store.configureConnectionVerificationState({ fs, path, filePath });
    const listed = store.listConnectionVerifications('ai-role');
    assert.equal(listed.length, 2);
    const openai = listed.find((entry) => entry.meta?.provider === 'openai');
    assert.equal(openai.meta.code, 'gpt-5');
    assert.equal(openai.meta.api_key, undefined);
    assert.equal(store.listConnectionVerifications('sheets').length, 0);
    assert.deepEqual(store.listConnectionVerifications(''), []);
});
