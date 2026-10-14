'use strict';

const path = require('node:path');
const { normalizePluginManifest } = require('../platform/plugin-contract');

class CorePluginRegistryError extends Error {
    constructor(message, code = 'CORE_PLUGIN_REGISTRY_INVALID', options = {}) {
        super(message, options);
        this.name = 'CorePluginRegistryError';
        this.code = code;
    }
}

const CORE_PACKAGE_ROOT = path.resolve(__dirname, '../../packages/plugins/core');

function bundledPackage(directory) {
    const packageRoot = path.join(CORE_PACKAGE_ROOT, directory);
    const packageMetadata = require(path.join(packageRoot, 'package.json'));
    const manifest = packageMetadata.bloggeniusPlugin;
    return Object.freeze({
        id: manifest?.id,
        manifest,
        version: packageMetadata.version,
        create: (dependencies) => {
            const packageRuntime = require(packageRoot);
            if (typeof packageRuntime.createPlugin !== 'function') {
                throw new CorePluginRegistryError(
                    `Core Plugin ${manifest?.id || directory} does not export createPlugin().`,
                    'CORE_PLUGIN_FACTORY_MISSING'
                );
            }
            return packageRuntime.createPlugin(dependencies);
        }
    });
}

const CORE_PLUGIN_REGISTRATIONS = Object.freeze([
    bundledPackage('wordpress-publisher'),
    bundledPackage('ai-gateway'),
    bundledPackage('hello-world')
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
        if (typeof registration.create !== 'function') {
            throw new CorePluginRegistryError(`Core Plugin registration at index ${index} must provide create().`);
        }
        let manifest;
        try {
            manifest = normalizePluginManifest(registration.manifest, registration.version);
        } catch (cause) {
            throw new CorePluginRegistryError(
                `Core Plugin registration at index ${index} has an invalid manifest: ${cause.message}`,
                cause.code || 'CORE_PLUGIN_MANIFEST_INVALID',
                { cause }
            );
        }
        if (byId.has(manifest.id)) {
            throw new CorePluginRegistryError(
                `Core Plugin is registered more than once: ${manifest.id}`,
                'CORE_PLUGIN_DUPLICATE'
            );
        }
        byId.set(manifest.id, Object.freeze({
            manifest: registration.manifest,
            normalizedManifest: manifest,
            version: registration.version,
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
        return Array.from(registrationsById.values(), ({ normalizedManifest }) => Object.freeze({
            manifestVersion: normalizedManifest.manifestVersion,
            id: normalizedManifest.id,
            name: normalizedManifest.name,
            version: normalizedManifest.packageVersion,
            summary: normalizedManifest.summary,
            hostApi: normalizedManifest.hostApi,
            operations: Object.freeze(Object.entries(normalizedManifest.operations).map(([id, operation]) => (
                Object.freeze({
                    id,
                    description: operation.description,
                    inputSchema: operation.inputSchema,
                    outputSchema: operation.outputSchema,
                    capabilities: operation.capabilities
                })
            )))
        }));
    }

    function getMetadata(pluginId) {
        const id = String(pluginId || '').trim();
        return listMetadata().find((metadata) => metadata.id === id) || null;
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
        const implementation = registration.create(dependencies);
        if (!implementation || typeof implementation !== 'object' || Array.isArray(implementation)
            || !implementation.operations || typeof implementation.operations !== 'object'
            || Array.isArray(implementation.operations)) {
            throw new CorePluginRegistryError(`Core Plugin factory returned no operations: ${id}`, 'CORE_PLUGIN_INSTANCE_MISSING');
        }
        const declaredOperationIds = Object.keys(registration.normalizedManifest.operations).sort();
        const implementedOperationIds = Object.keys(implementation.operations).sort();
        if (JSON.stringify(declaredOperationIds) !== JSON.stringify(implementedOperationIds)
            || implementedOperationIds.some((operationId) => typeof implementation.operations[operationId]?.execute !== 'function')) {
            throw new CorePluginRegistryError(
                `Core Plugin runtime operations do not match its manifest: ${id}`,
                'CORE_PLUGIN_OPERATION_MISMATCH'
            );
        }
        return Object.freeze({
            manifest: registration.normalizedManifest.manifest,
            version: registration.version,
            operations: implementation.operations
        });
    }

    return Object.freeze({ list, listMetadata, getMetadata, has, createPlugin });
}

module.exports = {
    CORE_PLUGIN_REGISTRATIONS,
    CorePluginRegistryError,
    createCorePluginRegistry
};
