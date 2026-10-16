'use strict';

const EMPTY_SUPPORT = Object.freeze({ routes: Object.freeze([]) });

function resolveGatewayModels(kind, catalog, support = EMPTY_SUPPORT) {
    if (!['text', 'image'].includes(kind)) throw new TypeError('AI model kind must be text or image.');
    const models = Array.isArray(catalog?.[kind]) ? catalog[kind] : [];
    // The Gateway's models.list result is already constrained to implemented routes.
    // Do not recreate a second model inventory or model-ID intersection here.
    return models;
}

function resolveGatewayModel(kind, selection, catalog, support = EMPTY_SUPPORT) {
    const provider = String(selection?.provider || '').trim().toLowerCase();
    const modelId = String(selection?.modelId || selection?.code || '').trim();
    if (!provider || !modelId) return null;
    const model = resolveGatewayModels(kind, catalog, support).find((item) => item.provider === provider && item.code === modelId);
    return model ? Object.freeze({ provider: model.provider, modelId: model.code }) : null;
}

function supportsGatewayFeature(kind, selection, feature, support = EMPTY_SUPPORT, catalog = null) {
    const provider = String(selection?.provider || '').trim().toLowerCase();
    const modelId = String(selection?.modelId || selection?.code || '').trim();
    const routes = Array.isArray(support?.routes) ? support.routes : [];
    const route = routes.find((item) => item.kind === kind && item.provider === provider);
    if (feature !== 'jsonResponse' || route?.jsonMode !== true) return false;
    const catalogModel = catalog?.[kind]?.find((item) => item.provider === provider && item.code === modelId);
    return !catalogModel || catalogModel.capabilities?.structured_output !== false;
}

module.exports = { resolveGatewayModel, resolveGatewayModels, supportsGatewayFeature };
