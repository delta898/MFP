'use strict';

const { createGatewayOperations } = require('./provider-adapters');
const { describeSupport } = require('./support');

function createPlugin(options = {}) {
    return Object.freeze({ operations: createGatewayOperations(options) });
}

module.exports = { createPlugin, describeSupport };
