'use strict';

const { createWordPressPublisherPlugin, PLUGIN_METADATA: WORDPRESS_PUBLISHER_METADATA } = require('../../packages/plugins/core/wordpress-publisher');
const { createContentGeneratorPlugin, PLUGIN_METADATA: CONTENT_GENERATOR_METADATA } = require('../../packages/plugins/core/content-generator');

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
        metadata: WORDPRESS_PUBLISHER_METADATA,
        create: (dependencies) => createWordPressPublisherPlugin(dependencies)
    }),
    Object.freeze({
        id: 'content-generator',
        metadata: CONTENT_GENERATOR_METADATA,
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
        const metadataDeclared = Boolean(registration.metadata);
        const metadata = registration.metadata || Object.freeze({
            id: registration.id,
            name: registration.id,
            version: '',
            summary: '',
            operations: Object.freeze([])
        });
        if (!metadata || metadata.id !== registration.id || typeof metadata.name !== 'string'
            || typeof metadata.version !== 'string' || typeof metadata.summary !== 'string'
            || !Array.isArray(metadata.operations)
            || metadata.operations.some((operation) => !operation || typeof operation.id !== 'string'
                || !operation.id.trim() || typeof operation.description !== 'string')) {
            throw new CorePluginRegistryError(`Core Plugin ${registration.id} has invalid discovery metadata.`);
        }
        if (new Set(metadata.operations.map((operation) => operation.id)).size !== metadata.operations.length) {
            throw new CorePluginRegistryError(`Core Plugin ${registration.id} has duplicate operation metadata.`);
        }
        const safeMetadata = Object.freeze({
            id: metadata.id,
            name: metadata.name,
            version: metadata.version,
            summary: metadata.summary,
            operations: Object.freeze(metadata.operations.map((operation) => Object.freeze({
                id: operation.id,
                description: operation.description
            })))
        });
        if (byId.has(registration.id)) {
            throw new CorePluginRegistryError(`Core Plugin is registered more than once: ${registration.id}`, 'CORE_PLUGIN_DUPLICATE');
        }
        byId.set(registration.id, Object.freeze({
            id: registration.id,
            metadata: safeMetadata,
            metadataDeclared,
            create: registration.create
        }));
    });

    return byId;
}

function createCorePluginRegistry(registrations = CORE_PLUGIN_REGISTRATIONS) {
    const registrationsById = validateRegistrations(registrations);

    function list() {
        return Array.from(registrationsById.keys());
    }

    function listMetadata() {
        return Array.from(registrationsById.values(), ({ metadata }) => metadata);
    }

    function getMetadata(pluginId) {
        return registrationsById.get(String(pluginId || '').trim())?.metadata || null;
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
        if (registration.metadataDeclared) {
            const operationMetadata = Object.entries(plugin.operations || {})
                .map(([operationId, operation]) => ({ id: operationId, description: operation.description }));
            if (plugin.name !== registration.metadata.name || plugin.version !== registration.metadata.version
                || JSON.stringify(operationMetadata) !== JSON.stringify(registration.metadata.operations)) {
                throw new CorePluginRegistryError(`Core Plugin instance does not match its discovery metadata: ${id}`, 'CORE_PLUGIN_METADATA_MISMATCH');
            }
        }
        return plugin;
    }

    return Object.freeze({ list, listMetadata, getMetadata, has, createPlugin });
}

module.exports = {
    CORE_PLUGIN_REGISTRATIONS,
    CorePluginRegistryError,
    createCorePluginRegistry
};
