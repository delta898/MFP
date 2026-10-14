'use strict';

const PLUGIN_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const OPERATION_ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;

class PluginContractError extends Error {
    constructor(message, options = {}) {
        super(message, options);
        this.name = 'PluginContractError';
        this.code = options.code || 'PLUGIN_CONTRACT_INVALID';
    }
}

function assertIdentifier(value, pattern, label) {
    if (typeof value !== 'string' || !pattern.test(value)) {
        throw new PluginContractError(`${label} must be a valid lowercase identifier.`);
    }
}

function normalizePluginDescriptor(plugin) {
    if (!plugin || typeof plugin !== 'object' || Array.isArray(plugin)) {
        throw new PluginContractError('Plugin descriptor must be an object.');
    }

    assertIdentifier(plugin.id, PLUGIN_ID_PATTERN, 'Plugin id');
    if (typeof plugin.name !== 'string' || !plugin.name.trim()) {
        throw new PluginContractError(`Plugin ${plugin.id} must provide a name.`);
    }
    if (typeof plugin.version !== 'string' || !plugin.version.trim()) {
        throw new PluginContractError(`Plugin ${plugin.id} must provide a version.`);
    }
    if (!plugin.operations || typeof plugin.operations !== 'object' || Array.isArray(plugin.operations)) {
        throw new PluginContractError(`Plugin ${plugin.id} must declare operations.`);
    }

    const operations = Object.create(null);
    Object.entries(plugin.operations).forEach(([id, operation]) => {
        assertIdentifier(id, OPERATION_ID_PATTERN, `Operation id in plugin ${plugin.id}`);
        if (!operation || typeof operation !== 'object' || Array.isArray(operation)) {
            throw new PluginContractError(`Operation ${plugin.id}.${id} must be an object.`);
        }
        if (typeof operation.description !== 'string' || !operation.description.trim()) {
            throw new PluginContractError(`Operation ${plugin.id}.${id} must provide a description.`);
        }
        if (typeof operation.input?.parse !== 'function') {
            throw new PluginContractError(`Operation ${plugin.id}.${id} must provide input.parse().`);
        }
        if (typeof operation.output?.parse !== 'function') {
            throw new PluginContractError(`Operation ${plugin.id}.${id} must provide output.parse().`);
        }
        if (typeof operation.execute !== 'function') {
            throw new PluginContractError(`Operation ${plugin.id}.${id} must provide execute().`);
        }
        operations[id] = Object.freeze({
            description: operation.description.trim(),
            input: operation.input,
            output: operation.output,
            execute: operation.execute
        });
    });

    if (Object.keys(operations).length === 0) {
        throw new PluginContractError(`Plugin ${plugin.id} must declare at least one operation.`);
    }

    return Object.freeze({
        id: plugin.id,
        name: plugin.name.trim(),
        version: plugin.version.trim(),
        operations: Object.freeze(operations)
    });
}

module.exports = {
    PluginContractError,
    normalizePluginDescriptor
};
