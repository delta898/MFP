'use strict';

const {
    CLAUDE_OPENAI_BASE_URL,
    KIE_BASE_URL,
    OPENAI_BASE_URL
} = require('../../../../packages/plugins/core/ai-gateway/provider-endpoints');
const {
    findModelDefinition,
    getAiModelCatalog
} = require('../../../../packages/plugins/core/ai-gateway/catalog-registry');
const { inferTransport } = require('../../../../packages/plugins/core/ai-gateway/transport-registry');

function createAiGatewayModelMetadata() {
    return Object.freeze({
        getModelCatalog: getAiModelCatalog,
        findModelDefinition,
        inferTransport,
        providerBaseUrls: Object.freeze({
            anthropic: CLAUDE_OPENAI_BASE_URL,
            openai: OPENAI_BASE_URL,
            kie: KIE_BASE_URL
        })
    });
}

module.exports = { createAiGatewayModelMetadata };
