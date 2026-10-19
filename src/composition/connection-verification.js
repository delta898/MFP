'use strict';

const stateStore = require('../adapters/storage/connection-verifications/state-store');
const aiTransport = require('../../packages/plugins/core/ai-gateway/transport-registry');
const { createConnectionVerificationService } = require('../services/connection-verification/service');

const connectionVerification = createConnectionVerificationService({
    repository: {
        read: stateStore.readConnectionVerification,
        record: stateStore.recordConnectionVerification,
        list: stateStore.listConnectionVerifications
    },
    aiTransport
});

module.exports = { connectionVerification };
