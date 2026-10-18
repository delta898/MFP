'use strict';

const { createGatewayOperations } = require('./provider-adapters');
const { describeSupport } = require('./support');
const { createModelCatalogService } = require('./catalog');
const { createProviderTransport } = require('./provider-transport');

function createPlugin(options = {}) {
    const transport = options.transport || createProviderTransport({
        getProviderProfile: options.getProviderProfile,
        ...(options.fetch ? { fetch: options.fetch } : {}),
        ...(options.lookup ? { lookup: options.lookup } : {}),
        ...(options.maxDownloadBytes ? { maxDownloadBytes: options.maxDownloadBytes } : {})
    });
    return Object.freeze({ operations: createGatewayOperations({ ...options, transport }) });
}

module.exports = { createPlugin, createModelCatalogService, describeSupport };
