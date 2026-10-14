'use strict';

const { normalizePluginDescriptor, PluginContractError } = require('./plugin-contract');

const PROGRESS_PHASES = new Set(['submitted', 'waiting', 'generating', 'downloading']);

class PluginHostError extends Error {
    constructor(message, code) {
        super(message);
        this.name = 'PluginHostError';
        this.code = code;
    }
}

function validateSchema(validator, value, label) {
    try {
        if (validator(value)) return value;
        const issues = validator.errors?.map((error) => `${error.instancePath || '/'} ${error.message}`).join('; ');
        throw new TypeError(issues || 'Value did not match the declared schema.');
    } catch (cause) {
        throw new PluginContractError(`${label} did not satisfy its declared contract.`, {
            cause,
            code: 'PLUGIN_OPERATION_CONTRACT_VIOLATION'
        });
    }
}

function normalizeProgressEvent(pluginId, operationId, event) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
        throw new TypeError('Plugin progress event must be an object.');
    }
    const keys = Object.keys(event);
    if (keys.some((key) => !['phase', 'progress'].includes(key))) {
        throw new TypeError('Plugin progress event contains an unsupported field.');
    }
    if (!PROGRESS_PHASES.has(event.phase)) {
        throw new TypeError('Plugin progress phase is not supported.');
    }
    if (event.progress !== undefined
        && (!Number.isFinite(event.progress) || event.progress < 0 || event.progress > 100)) {
        throw new TypeError('Plugin progress must be a number from 0 to 100.');
    }
    return Object.freeze({
        pluginId,
        operationId,
        phase: event.phase,
        ...(event.progress === undefined ? {} : { progress: event.progress })
    });
}

function createPluginHost(options = {}) {
    const plugins = new Map();

    function register(definition) {
        const plugin = normalizePluginDescriptor(definition);
        if (plugins.has(plugin.id)) {
            throw new PluginContractError(`Plugin is already registered: ${plugin.id}`, {
                code: 'PLUGIN_DUPLICATE'
            });
        }
        plugins.set(plugin.id, {
            descriptor: plugin,
            state: 'enabled',
            activeExecutions: 0,
            drainWaiters: [],
            transition: null
        });
        return { id: plugin.id, state: 'enabled' };
    }

    function resolvePlugin(pluginId) {
        const plugin = plugins.get(String(pluginId || '').trim());
        if (!plugin) {
            throw new PluginHostError(`Plugin is not registered: ${pluginId}`, 'PLUGIN_NOT_FOUND');
        }
        return plugin;
    }

    function hasPlugin(pluginId) {
        return plugins.has(String(pluginId || '').trim());
    }

    function listPlugins() {
        return Array.from(plugins.values(), ({ descriptor, state, activeExecutions }) => ({
            id: descriptor.id,
            name: descriptor.name,
            version: descriptor.version,
            state,
            activeExecutions
        }));
    }

    function listOperations() {
        const operations = [];
        plugins.forEach(({ descriptor, state }) => {
            if (state !== 'enabled') return;
            Object.entries(descriptor.operations).forEach(([operationId, operation]) => {
                operations.push({
                    pluginId: descriptor.id,
                    operationId,
                    description: operation.description,
                    inputSchema: operation.inputSchema,
                    outputSchema: operation.outputSchema,
                    capabilities: operation.capabilities
                });
            });
        });
        return operations;
    }

    async function execute(pluginId, operationId, input, executionContext = {}) {
        if (!executionContext || typeof executionContext !== 'object' || Array.isArray(executionContext)) {
            throw new TypeError('Plugin execution context must be an object.');
        }
        if (executionContext.reportProgress !== undefined && typeof executionContext.reportProgress !== 'function') {
            throw new TypeError('Plugin progress callback must be a function.');
        }
        const plugin = resolvePlugin(pluginId);
        if (plugin.state !== 'enabled') {
            throw new PluginHostError(`Plugin is not enabled: ${plugin.descriptor.id}`, 'PLUGIN_DISABLED');
        }
        const operation = plugin.descriptor.operations[String(operationId || '').trim()];
        if (!operation) {
            throw new PluginHostError(
                `Operation is not registered: ${plugin.descriptor.id}.${operationId}`,
                'OPERATION_NOT_FOUND'
            );
        }

        // Count before awaiting so disable prevents new dispatch and drains this call.
        plugin.activeExecutions += 1;
        try {
            const validatedInput = validateSchema(
                operation.validateInput,
                input,
                `Input for ${plugin.descriptor.id}.${operationId}`
            );
            const result = await operation.execute(validatedInput, Object.freeze({
                signal: executionContext.signal,
                reportProgress(event) {
                    if (typeof executionContext.reportProgress !== 'function') return;
                    executionContext.reportProgress(normalizeProgressEvent(
                        plugin.descriptor.id,
                        String(operationId || '').trim(),
                        event
                    ));
                }
            }));
            return validateSchema(
                operation.validateOutput,
                result,
                `Output for ${plugin.descriptor.id}.${operationId}`
            );
        } finally {
            plugin.activeExecutions -= 1;
            if (plugin.activeExecutions === 0) {
                plugin.drainWaiters.splice(0).forEach((resolve) => resolve());
            }
        }
    }

    async function setEnabled(pluginId, enabled) {
        const plugin = resolvePlugin(pluginId);
        if (typeof enabled !== 'boolean') {
            throw new TypeError('Plugin enabled state must be a boolean.');
        }
        if (plugin.state === 'disabling') {
            if (enabled) throw new PluginHostError(`Plugin is still disabling: ${plugin.descriptor.id}`, 'PLUGIN_TRANSITIONING');
            await plugin.transition;
            return { id: plugin.descriptor.id, state: plugin.state };
        }
        if ((plugin.state === 'enabled') === enabled) {
            return { id: plugin.descriptor.id, state: plugin.state };
        }
        if (enabled) {
            plugin.state = 'enabled';
            return { id: plugin.descriptor.id, state: plugin.state };
        }

        // Mark first so all subsequent calls are rejected while active work drains.
        plugin.state = 'disabling';
        plugin.transition = (async () => {
            if (plugin.activeExecutions > 0) {
                await new Promise((resolve) => plugin.drainWaiters.push(resolve));
            }
            plugin.state = 'disabled';
        })();
        try {
            await plugin.transition;
        } finally {
            plugin.transition = null;
        }
        return { id: plugin.descriptor.id, state: plugin.state };
    }

    (Array.isArray(options.plugins) ? options.plugins : []).forEach(register);

    return Object.freeze({ register, hasPlugin, listPlugins, listOperations, execute, setEnabled });
}

module.exports = {
    PluginHostError,
    createPluginHost
};
