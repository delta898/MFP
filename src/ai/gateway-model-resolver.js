'use strict';

const { describeSupport } = require('../../packages/plugins/core/ai-gateway');

function resolveGatewayModels(kind, catalog, support = describeSupport()) {
    if (!['text', 'image'].includes(kind)) throw new TypeError('AI model kind must be text or image.');
    const models = Array.isArray(catalog?.[kind]) ? catalog[kind] : [];
    const routes = Array.isArray(support?.routes) ? support.routes : [];
    return models.filter((model) => routes.some((route) => route.kind === kind
        && route.provider === model.provider
        && route.transport === model.transport
        && (!Array.isArray(route.modelIds) || route.modelIds.includes(model.code))));
}

function resolveGatewayModel(kind, selection, catalog, support = describeSupport()) {
    const provider = String(selection?.provider || '').trim().toLowerCase();
    const modelId = String(selection?.modelId || selection?.code || '').trim();
    if (!provider || !modelId) return null;
    const model = resolveGatewayModels(kind, catalog, support).find((item) => item.provider === provider && item.code === modelId);
    return model ? Object.freeze({ provider: model.provider, modelId: model.code }) : null;
}

function supportsGatewayFeature(kind, selection, feature, support = describeSupport(), catalog = null) {
    const provider = String(selection?.provider || '').trim().toLowerCase();
    const modelId = String(selection?.modelId || selection?.code || '').trim();
    const route = support.routes?.find((item) => item.kind === kind && item.provider === provider
        && (!Array.isArray(item.modelIds) || item.modelIds.includes(modelId)));
    if (feature !== 'jsonResponse' || route?.jsonMode !== true) return false;
    const catalogModel = catalog?.[kind]?.find((item) => item.provider === provider && item.code === modelId);
    return !catalogModel || catalogModel.capabilities?.structured_output !== false;
}

module.exports = { resolveGatewayModel, resolveGatewayModels, supportsGatewayFeature };
