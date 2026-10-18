const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
    configureConnectionVerificationState,
    recordConnectionVerification,
    resetConnectionVerificationState
} = require('../../connections/verification-state');
const {
    createAiModelVerificationSignature,
    getTrustedAiModelVerification
} = require('./model-verification');
const { getTransportBaseUrl } = require('../../../packages/plugins/core/ai-gateway/transport-registry');

const GOOGLE_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta';

test('Google verification canonicalizes an omitted fixed endpoint to the runtime endpoint', () => {
    const previouslyChecked = {
        provider: 'google',
        code: 'gemini-3.1-flash-image',
        api_key: 'fixture-google-key',
        base_url: GOOGLE_ENDPOINT
    };
    const currentProfile = { ...previouslyChecked, base_url: '' };

    assert.equal(getTransportBaseUrl('gemini_generate_content'), GOOGLE_ENDPOINT);
    assert.equal(
        createAiModelVerificationSignature('image', previouslyChecked),
        createAiModelVerificationSignature('image', currentProfile)
    );
});

test('provider-scoped verification follows transport capability, while custom endpoints remain identity-bound', () => {
    const kieA = { provider: 'kie', code: 'model-a', api_key: 'fixture-kie-key', base_url: 'https://api.kie.ai' };
    const kieB = { ...kieA, code: 'model-b' };
    assert.equal(
        createAiModelVerificationSignature('image', kieA),
        createAiModelVerificationSignature('image', kieB)
    );

    const directA = { provider: 'direct', code: 'custom-model', api_key: 'fixture-direct-key', base_url: 'https://one.example/v1' };
    const directB = { ...directA, base_url: 'https://two.example/v1' };
    assert.notEqual(
        createAiModelVerificationSignature('image', directA),
        createAiModelVerificationSignature('image', directB)
    );
});

test('a saved Google check with the fixed URL is trusted by a profile that omits it', () => {
    const filePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ai-model-verify-')), 'connection_verification.json');
    configureConnectionVerificationState({ fs, path, filePath });
    resetConnectionVerificationState({ filePath });
    const checkedModel = {
        provider: 'google',
        code: 'gemini-3.1-flash-image',
        api_key: 'fixture-google-key',
        base_url: GOOGLE_ENDPOINT
    };
    const currentProfile = { ...checkedModel, base_url: '' };
    const signature = createAiModelVerificationSignature('image', checkedModel);
    recordConnectionVerification('ai-role', signature, { success: true, connected: true }, {
        scope: 'image', provider: 'google', code: checkedModel.code, base_url: GOOGLE_ENDPOINT
    });

    assert.equal(Boolean(getTrustedAiModelVerification('image', currentProfile)), true);
});
