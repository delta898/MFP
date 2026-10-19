'use strict';

const { createConnectionSignature, isVerificationTrusted } = require('./policy');

function createConnectionVerificationService({ repository, aiTransport } = {}) {
    if (!repository || typeof repository.read !== 'function'
        || typeof repository.record !== 'function' || typeof repository.list !== 'function') {
        throw new TypeError('Connection verification requires a verification repository.');
    }
    if (!aiTransport || typeof aiTransport.inferTransport !== 'function'
        || typeof aiTransport.getTransportVerificationScope !== 'function'
        || typeof aiTransport.getCanonicalTransportEndpoint !== 'function') {
        throw new TypeError('Connection verification requires AI transport metadata.');
    }

    function createAiModelSignature(scope, modelConfig = {}) {
        const normalizedScope = String(scope || '').trim();
        const provider = String(modelConfig?.provider || '').trim().toLowerCase();
        const transport = String(modelConfig?.transport || aiTransport.inferTransport(normalizedScope, provider)).trim();
        const verificationScope = aiTransport.getTransportVerificationScope(transport);
        const parts = [normalizedScope, provider];
        if (verificationScope !== 'provider') parts.push(String(modelConfig?.code || '').trim());
        if (String(modelConfig?.api_key || '').trim()) parts.push(String(modelConfig.api_key).trim());
        if (verificationScope !== 'provider') {
            const endpoint = aiTransport.getCanonicalTransportEndpoint(transport, modelConfig?.base_url);
            if (endpoint) parts.push(endpoint);
        }
        return createConnectionSignature(parts);
    }

    function getTrustedAiModelVerification(scope, modelConfig = {}) {
        const signature = createAiModelSignature(scope, modelConfig);
        if (!signature) return null;
        const record = repository.read('ai-role', signature);
        return record && isVerificationTrusted('ai-role', record) ? record : null;
    }

    return Object.freeze({
        createSignature: createConnectionSignature,
        isTrusted: isVerificationTrusted,
        read: repository.read,
        record: repository.record,
        list: repository.list,
        createAiModelSignature,
        getTrustedAiModelVerification
    });
}

module.exports = { createConnectionVerificationService };
