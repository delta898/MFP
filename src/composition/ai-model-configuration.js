'use strict';

const { createAiGatewayModelMetadata } = require('../adapters/plugins/ai-gateway/model-metadata');
const { createModelConfigurationService } = require('../services/ai/model-configuration');

function createAiModelConfiguration() {
    return createModelConfigurationService(createAiGatewayModelMetadata());
}

module.exports = { createAiModelConfiguration };
