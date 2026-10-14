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

    function createPlugins(options = {}) {
        if (!options || typeof options !== 'object' || Array.isArray(options)) {
            throw new CorePluginRegistryError('Core Plugin composition options must be an object.');
        }
        const pluginIds = options.pluginIds;
        const dependenciesByPluginId = options.dependenciesByPluginId == null
            ? {}
            : options.dependenciesByPluginId;
        if (!Array.isArray(pluginIds) || pluginIds.some((id) => typeof id !== 'string')) {
            throw new CorePluginRegistryError('Selected Core Plugin ids must be an array of strings.');
        }
        const selectedIds = new Set();
        for (const id of pluginIds) {
            if (!registrationsById.has(id)) {
                throw new CorePluginRegistryError(`Selected Core Plugin is not registered: ${id}`, 'CORE_PLUGIN_NOT_REGISTERED');
            }
            if (selectedIds.has(id)) {
                throw new CorePluginRegistryError(`Core Plugin was selected more than once: ${id}`, 'CORE_PLUGIN_DUPLICATE_SELECTION');
            }
            selectedIds.add(id);
        }
        if (!dependenciesByPluginId || typeof dependenciesByPluginId !== 'object' || Array.isArray(dependenciesByPluginId)) {
            throw new CorePluginRegistryError('Core Plugin dependencies must be an object keyed by Plugin id.');
        }
        for (const id of Object.keys(dependenciesByPluginId)) {
            if (!registrationsById.has(id)) {
                throw new CorePluginRegistryError(`Dependencies were supplied for an unregistered Core Plugin: ${id}`, 'CORE_PLUGIN_NOT_REGISTERED');
            }
            if (!selectedIds.has(id)) {
                throw new CorePluginRegistryError(`Dependencies were supplied for an unselected Core Plugin: ${id}`, 'CORE_PLUGIN_NOT_SELECTED');
            }
        }

        return Object.freeze(Array.from(registrationsById.values())
            .filter((registration) => selectedIds.has(registration.id))
            .map((registration) => {
                const plugin = registration.create(dependenciesByPluginId[registration.id] || {});
                if (!plugin || typeof plugin !== 'object' || Array.isArray(plugin)) {
                    throw new CorePluginRegistryError(`Core Plugin factory returned no Plugin instance: ${registration.id}`, 'CORE_PLUGIN_INSTANCE_MISSING');
                }
                if (plugin.id !== registration.id) {
                    throw new CorePluginRegistryError(
                        `Core Plugin factory id mismatch: expected ${registration.id}, received ${String(plugin.id || '') || 'none'}`,
                        'CORE_PLUGIN_ID_MISMATCH'
                    );
                }
                return plugin;
            }));
    }

    return Object.freeze({ list, createPlugins });
}

module.exports = {
    CORE_PLUGIN_REGISTRATIONS,
    CorePluginRegistryError,
    createCorePluginRegistry
};
