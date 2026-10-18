const { readConnectionVerification } = require('../../adapters/storage/connection-verifications/state-store');
const { createConnectionSignature, isVerificationTrusted } = require('../connection-verification/policy');
const {
    getCanonicalTransportEndpoint,
    getTransportVerificationScope,
    inferTransport
} = require('../../../packages/plugins/core/ai-gateway/transport-registry');

function createAiModelVerificationSignature(scope, modelConfig = {}) {
    const normalizedScope = String(scope || '').trim();
    const provider = String(modelConfig?.provider || '').trim().toLowerCase();
    const transport = String(modelConfig?.transport || inferTransport(normalizedScope, provider)).trim();
    const verificationScope = getTransportVerificationScope(transport);
    const parts = [
        normalizedScope,
        provider
    ];
    if (verificationScope !== 'provider') parts.push(String(modelConfig?.code || '').trim());
    if (String(modelConfig?.api_key || '').trim()) parts.push(String(modelConfig.api_key).trim());
    if (verificationScope !== 'provider') {
        const endpoint = getCanonicalTransportEndpoint(transport, modelConfig?.base_url);
        if (endpoint) parts.push(endpoint);
    }
    return createConnectionSignature(parts);
}

function getTrustedAiModelVerification(scope, modelConfig = {}) {
    const signature = createAiModelVerificationSignature(scope, modelConfig);
    if (!signature) return null;
    const record = readConnectionVerification('ai-role', signature);
    if (!record || !isVerificationTrusted('ai-role', record)) return null;
    return record;
}

module.exports = { createAiModelVerificationSignature, getTrustedAiModelVerification };
