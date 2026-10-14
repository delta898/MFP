'use strict';

const { createWordPressPublisherPlugin } = require('../../packages/plugins/core/wordpress-publisher');
const { createContentGeneratorPlugin } = require('../../packages/plugins/core/content-generator');

class CorePluginRegistryError extends Error {
    constructor(message, code = 'CORE_PLUGIN_REGISTRY_INVALID') {
        super(message);
        this.name = 'CorePluginRegistryError';
        this.code = code;
    }
}

const CORE_PLUGIN_REGISTRATIONS = Object.freeze([
    Object.freeze({
        id: 'wordpress-publisher',
        create: (dependencies) => createWordPressPublisherPlugin(dependencies)
    }),
    Object.freeze({
        id: 'content-generator',
        create: (dependencies) => createContentGeneratorPlugin(dependencies)
    })
]);

function validateRegistrations(registrations) {
    if (!Array.isArray(registrations)) {
        throw new CorePluginRegistryError('Core Plugin registrations must be an array.');
    }

    const byId = new Map();
    registrations.forEach((registration, index) => {
        if (!registration || typeof registration !== 'object' || Array.isArray(registration)) {
            throw new CorePluginRegistryError(`Core Plugin registration at index ${index} must be an object.`);
        }
        if (typeof registration.id !== 'string' || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(registration.id)) {
            throw new CorePluginRegistryError(`Core Plugin registration at index ${index} has an invalid id.`);
        }
        if (typeof registration.create !== 'function') {
            throw new CorePluginRegistryError(`Core Plugin ${registration.id} must provide create().`);
        }
        if (byId.has(registration.id)) {
            throw new CorePluginRegistryError(`Core Plugin is registered more than once: ${registration.id}`, 'CORE_PLUGIN_DUPLICATE');
        }
        byId.set(registration.id, Object.freeze({ id: registration.id, create: registration.create }));
    });

    return byId;
}

function createCorePluginRegistry(registrations = CORE_PLUGIN_REGISTRATIONS) {
    const registrationsById = validateRegistrations(registrations);

    function list() {
        return Array.from(registrationsById.keys());
    }

    function has(pluginId) {
        return registrationsById.has(String(pluginId || '').trim());
    }

    function createPlugin(pluginId, dependencies = {}) {
        const id = String(pluginId || '').trim();
        const registration = registrationsById.get(id);
        if (!registration) {
            throw new CorePluginRegistryError(`Core Plugin is not registered: ${id}`, 'CORE_PLUGIN_NOT_REGISTERED');
        }
        if (!dependencies || typeof dependencies !== 'object' || Array.isArray(dependencies)) {
            throw new CorePluginRegistryError(`Dependencies for Core Plugin ${id} must be an object.`);
        }
        const plugin = registration.create(dependencies);
        if (!plugin || typeof plugin !== 'object' || Array.isArray(plugin)) {
            throw new CorePluginRegistryError(`Core Plugin factory returned no Plugin instance: ${id}`, 'CORE_PLUGIN_INSTANCE_MISSING');
        }
        if (plugin.id !== id) {
            throw new CorePluginRegistryError(
                `Core Plugin factory id mismatch: expected ${id}, received ${String(plugin.id || '') || 'none'}`,
                'CORE_PLUGIN_ID_MISMATCH'
            );
        }
        return plugin;
    }

    return Object.freeze({ list, has, createPlugin });
}

module.exports = {
    CORE_PLUGIN_REGISTRATIONS,
    CorePluginRegistryError,
    createCorePluginRegistry
};
