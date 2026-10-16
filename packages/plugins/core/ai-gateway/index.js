'use strict';

const { createGatewayOperations } = require('./provider-adapters');
const { describeSupport } = require('./support');
const { createModelCatalogService } = require('./catalog');

function createPlugin(options = {}) {
    return Object.freeze({ operations: createGatewayOperations(options) });
}

module.exports = { createPlugin, createModelCatalogService, describeSupport };
