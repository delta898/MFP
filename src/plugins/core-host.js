'use strict';

const { buildCapabilityId } = require('../agent/action-schema');

function normalizePlugin(plugin, context) {
    if (!plugin || typeof plugin !== 'object') {
        throw new TypeError('Core Plugin descriptor must be an object.');
    }

    const id = String(plugin.id || '').trim();
    if (!/^[a-z][a-z0-9-]*$/.test(id)) {
        throw new Error(`Invalid Core Plugin id: ${id || '(empty)'}`);
    }
    const name = String(plugin.name || '').trim();
    const version = String(plugin.version || '').trim();
    if (!name) throw new Error(`Core Plugin ${id} must provide a name.`);
    if (!version) throw new Error(`Core Plugin ${id} must provide a version.`);
    if (String(plugin.kind || '').trim() !== 'core') {
        throw new Error(`Only bundled Core Plugins can be registered: ${id}`);
    }
    if (plugin.enabledByDefault !== undefined && typeof plugin.enabledByDefault !== 'boolean') {
        throw new TypeError(`Core Plugin enabledByDefault must be a boolean: ${id}`);
    }
    if (typeof plugin.contribute !== 'function') {
        throw new Error(`Core Plugin ${id} must provide contribute().`);
    }

    const contributions = plugin.contribute({ context }) || {};
    const capabilities = Array.isArray(contributions.capabilities) ? contributions.capabilities : [];

    return {
        id,
        name,
        version,
        enabled: plugin.enabledByDefault !== false,
        state: plugin.enabledByDefault === false ? 'disabled' : 'enabled',
        inFlightExecutions: 0,
        drainWaiters: [],
        capabilities
    };
}

function createCorePluginHost(options = {}) {
    const coreCapabilities = Array.isArray(options.coreCapabilities) ? options.coreCapabilities : [];
    const plugins = new Map();
    const capabilityOwners = new Map();
    const coreCapabilityMap = new Map();

    function resolveCapabilityId(capability) {
        const explicitId = String(capability?.id || '').trim();
        const domain = String(capability?.domain || '').trim();
        const name = String(capability?.name || '').trim();
        const id = explicitId || (domain && name ? buildCapabilityId(domain, name) : '');
        if (!id) throw new Error('Capability must provide an id or domain/name.');
        return id;
    }

    function assertUniqueCapability(id, ownerId) {
        const existingOwner = capabilityOwners.get(id);
        if (existingOwner) {
            throw new Error(`Duplicate capability ${id} from ${ownerId}; already registered by ${existingOwner}.`);
        }
    }

    coreCapabilities.forEach((capability) => {
        const id = resolveCapabilityId(capability);
        assertUniqueCapability(id, 'core');
        coreCapabilityMap.set(id, capability);
        capabilityOwners.set(id, 'core');
    });

    (Array.isArray(options.plugins) ? options.plugins : []).forEach((definition) => {
        const pluginId = String(definition?.id || '').trim();
        if (plugins.has(pluginId)) {
            throw new Error(`Duplicate Core Plugin id: ${pluginId}`);
        }
        const suppliedContext = options.contexts?.[pluginId];
        if (suppliedContext !== undefined
            && (!suppliedContext || typeof suppliedContext !== 'object' || Array.isArray(suppliedContext))) {
            throw new TypeError(`Core Plugin context must be an object: ${pluginId}`);
        }
        const context = Object.freeze({ ...(suppliedContext || {}) });
        const plugin = normalizePlugin(definition, context);
        const capabilityMap = new Map();
        plugin.capabilities.forEach((capability) => {
            const id = resolveCapabilityId(capability);
            assertUniqueCapability(id, plugin.id);
            const wrappedCapability = { ...capability };
            ['validate', 'preview', 'execute'].forEach((method) => {
                if (typeof capability?.[method] !== 'function') {
                    throw new Error(`Core Plugin ${plugin.id} capability ${id} must provide ${method}().`);
                }
                wrappedCapability[method] = async (...args) => {
                    if (!plugin.enabled || plugin.state !== 'enabled') {
                        throw new Error(`Core Plugin is not enabled: ${plugin.id}`);
                    }
                    if (method !== 'execute') return capability[method](...args);

                    plugin.inFlightExecutions += 1;
                    try {
                        return await capability[method](...args);
                    } finally {
                        plugin.inFlightExecutions -= 1;
                        if (plugin.inFlightExecutions === 0) {
                            plugin.drainWaiters.splice(0).forEach((resolve) => resolve());
                        }
                    }
                };
            });
            capabilityMap.set(id, wrappedCapability);
            capabilityOwners.set(id, plugin.id);
        });
        plugin.capabilityMap = capabilityMap;
        plugins.set(plugin.id, plugin);
    });

    function getCapability(id) {
        const normalizedId = String(id || '').trim();
        if (coreCapabilityMap.has(normalizedId)) return coreCapabilityMap.get(normalizedId);
        const ownerId = capabilityOwners.get(normalizedId);
        if (!ownerId) return null;
        const plugin = plugins.get(ownerId);
        return plugin?.enabled ? plugin.capabilityMap.get(normalizedId) || null : null;
    }

    return {
        listCapabilities() {
            const capabilities = [...coreCapabilityMap.values()];
            plugins.forEach((plugin) => {
                if (plugin.enabled) capabilities.push(...plugin.capabilityMap.values());
            });
            return capabilities;
        },
        getCapability,
        hasCapability(id) {
            return getCapability(id) !== null;
        },
        listPlugins() {
            return Array.from(plugins.values(), (plugin) => ({
                id: plugin.id,
                name: plugin.name,
                version: plugin.version,
                kind: 'core',
                enabled: plugin.enabled,
                state: plugin.state
            }));
        },
        async setPluginEnabled(id, enabled) {
            const plugin = plugins.get(String(id || '').trim());
            if (!plugin) throw new Error(`Core Plugin is not registered: ${id}`);
            if (typeof enabled !== 'boolean') {
                throw new TypeError('Core Plugin enabled state must be a boolean.');
            }
            const nextEnabled = enabled;
            if (plugin.state === 'disabling') {
                if (nextEnabled) throw new Error(`Core Plugin is still disabling: ${plugin.id}`);
                await plugin.transition;
                return { id: plugin.id, enabled: false, state: plugin.state };
            }
            if (plugin.enabled === nextEnabled) {
                return { id: plugin.id, enabled: plugin.enabled, state: plugin.state };
            }

            if (nextEnabled) {
                plugin.enabled = true;
                plugin.state = 'enabled';
            } else {
                // Stop new dispatch before waiting for already-started effects.
                plugin.enabled = false;
                plugin.state = 'disabling';
                plugin.transition = (async () => {
                    if (plugin.inFlightExecutions > 0) {
                        await new Promise((resolve) => plugin.drainWaiters.push(resolve));
                    }
                    plugin.state = 'disabled';
                })();
                try { await plugin.transition; }
                finally { plugin.transition = null; }
            }
            return {
                id: plugin.id,
                enabled: plugin.enabled,
                state: plugin.state
            };
        }
    };
}

module.exports = {
    createCorePluginHost
};
