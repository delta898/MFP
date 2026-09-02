const test = require('node:test');
const assert = require('node:assert/strict');
const {
    createWordPressSignature,
    recordWordPressVerification,
    getWordPressVerification,
    resetConnectionVerificationState
} = require('./verification-state');

test.beforeEach(() => resetConnectionVerificationState());

test('WordPress verification is scoped to the exact settings without exposing secrets', () => {
    const candidate = {
        url: 'https://blog.example/',
        userId: 'Editor',
        appPassword: 'secret-password'
    };
    const signature = createWordPressSignature(candidate);
    recordWordPressVerification(candidate, {
        success: false,
        connected: false,
        message: '인증 실패'
    });

    assert.equal(signature.includes('secret-password'), false);
    assert.equal(getWordPressVerification(candidate).status, 'failed');
    assert.equal(getWordPressVerification({ ...candidate, appPassword: 'changed-password' }), null);
});
