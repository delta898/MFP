const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createSettingsService } = require('./settings.service');
const {
    configureConnectionVerificationState,
    createConnectionSignature,
    readConnectionVerification,
    resetConnectionVerificationState
} = require('../../connections/verification-state');

const TEXT_CONFIG = { provider: 'openai', code: 'gpt-5.6-terra', name: 'GPT-5.6 Terra', api_key: 'key-1' };

function configureStore() {
    const filePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ai-verify-')), 'connection_verification.json');
    resetConnectionVerificationState();
    configureConnectionVerificationState({ fs, path, filePath });
    return filePath;
}

function createService(tester, configOverrides = {}) {
    const CONFIG = {
        TEXT_MODEL_CONFIG: { ...TEXT_CONFIG },
        IMAGE_MODEL_CONFIG: { provider: 'kie', code: 'nano-banana-pro', api_key: 'key-2' },
        CHAT_MODEL_CONFIG: { ...TEXT_CONFIG },
        ...configOverrides
    };
    const service = createSettingsService({
        CONFIG,
        buildMajorSettings: () => ({ fields: {} }),
        resolveWritableConfigPath: () => path.join(os.tmpdir(), 'ai-verify-config.json'),
        ModelConnectionTester: tester
    });
    return { CONFIG, service };
}

const successTester = {
    async testModelConnection() {
        return { success: true, connected: true };
    }
};

test('ai role checks persist per-model verification', async () => {
    configureStore();
    const { service } = createService(successTester);
    const result = await service.testAiRoleConnection({ scope: 'text' });
    assert.equal(result.success, true);

    const signature = createConnectionSignature(['text', 'openai', 'gpt-5.6-terra', 'key-1']);
    const record = readConnectionVerification('ai-role', signature);
    assert.equal(record.status, 'connected');
});

test('ai role settings expose trusted verification for unchanged models', async () => {
    configureStore();
    const { service } = createService(successTester);
    await service.testAiRoleConnection({ scope: 'text' });

    const settings = await service.getAiRoleSettings();
    assert.equal(settings.verification.text.status, 'connected');
    assert.equal(settings.verification.text.trusted, true);
    assert.ok(settings.verification.text.checked_at);
    assert.equal(settings.verification.image.trusted, undefined);
    assert.deepEqual(settings.verification.image.history, []);
});

test('changed api keys invalidate persisted ai verification', async () => {
    configureStore();
    const { CONFIG, service } = createService(successTester);
    await service.testAiRoleConnection({ scope: 'text' });
    CONFIG.TEXT_MODEL_CONFIG = { ...TEXT_CONFIG, api_key: 'key-2' };

    const settings = await service.getAiRoleSettings();
    assert.notEqual(settings.verification.text.trusted, true);
    assert.equal(settings.verification.text.status, undefined);
    // History still remembers the previously verified key.
    assert.equal(settings.verification.text.history.length, 1);
});

test('failed ai role checks persist the failure', async () => {
    configureStore();
    const { service } = createService({
        async testModelConnection() {
            const error = new Error('invalid key');
            error.code = 'AI_MODEL_CONNECTION_CHECK_FAILED';
            throw error;
        }
    });
    await assert.rejects(service.testAiRoleConnection({ scope: 'image' }));
    // KIE is provider-level: the code is not part of the signature.
    const signature = createConnectionSignature(['image', 'kie', 'key-2']);
    const record = readConnectionVerification('ai-role', signature);
    assert.equal(record.status, 'failed');
    assert.match(record.message, /invalid key/);
});

test('unsaved model checks record under the requested values', async () => {
    const filePath = configureStore();
    const { service } = createService(successTester);
    await service.testAiModelConnection({ kind: 'text', provider: 'openai', presetCode: 'gpt-5.6-terra', apiKey: 'unsaved-secret', name: 'GPT-5.6 Terra' });
    const stored = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const entries = Object.entries(stored).filter(([key]) => key.startsWith('ai-role:'));
    assert.equal(entries.length, 1);
    assert.equal(entries[0][1].status, 'connected');
});

test('ai role settings expose trusted history across providers', async () => {
    configureStore();
    const { service } = createService(successTester);
    await service.testAiRoleConnection({ scope: 'text' });
    await service.testAiModelConnection({ kind: 'text', provider: 'google', presetCode: 'gemini-3-flash', apiKey: 'key-g', name: 'Gemini 3 Flash' });

    const settings = await service.getAiRoleSettings();
    assert.equal(settings.verification.text.trusted, true);
    const providers = settings.verification.text.history.map((entry) => entry.provider).sort();
    assert.deepEqual(providers, ['google', 'openai']);
    const google = settings.verification.text.history.find((entry) => entry.provider === 'google');
    assert.equal(google.code, 'gemini-3-flash');
    assert.equal(google.trusted, true);
    assert.ok(google.checked_at);
});

test('kie trust is provider-level: switching models keeps verification', async () => {
    configureStore();
    const { CONFIG, service } = createService(successTester);
    CONFIG.TEXT_MODEL_CONFIG = { provider: 'kie', code: 'model-a', api_key: 'kie-key' };
    await service.testAiRoleConnection({ scope: 'text' });
    CONFIG.TEXT_MODEL_CONFIG = { provider: 'kie', code: 'model-b', api_key: 'kie-key' };

    const settings = await service.getAiRoleSettings();
    assert.equal(settings.verification.text.trusted, true);
    assert.equal(settings.verification.text.history.length, 1);
});
