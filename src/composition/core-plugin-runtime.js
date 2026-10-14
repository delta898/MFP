'use strict';

const { createCorePluginRegistry } = require('./core-plugin-registry');
const { createPluginHost } = require('../platform/plugin-host');

class CorePluginRuntimeError extends Error {
    constructor(message, code = 'CORE_PLUGIN_RUNTIME_INVALID') {
        super(message);
        this.name = 'CorePluginRuntimeError';
        this.code = code;
    }
}

function createCorePluginRuntime(options = {}) {
    const registry = options.registry || createCorePluginRegistry();
    const host = options.host || createPluginHost();
    if (typeof registry?.listMetadata !== 'function' || typeof registry?.has !== 'function' || typeof registry?.createPlugin !== 'function'
        || typeof host?.register !== 'function' || typeof host?.hasPlugin !== 'function'
        || typeof host?.listPlugins !== 'function' || typeof host?.execute !== 'function') {
        throw new CorePluginRuntimeError('Core Plugin runtime requires a valid registry and Plugin Host.');
    }

    function ensurePlugins(pluginIds, dependenciesByPluginId = {}) {
        if (!Array.isArray(pluginIds) || pluginIds.some((id) => typeof id !== 'string' || !id.trim())) {
            throw new CorePluginRuntimeError('Plugin IDs must be a non-empty-string array.');
        }
        if (!dependenciesByPluginId || typeof dependenciesByPluginId !== 'object' || Array.isArray(dependenciesByPluginId)) {
            throw new CorePluginRuntimeError('Plugin dependencies must be an object keyed by Plugin ID.');
        }
        const uniqueIds = new Set();
        for (const rawId of pluginIds) {
            const id = rawId.trim();
            if (uniqueIds.has(id)) throw new CorePluginRuntimeError(`Plugin was selected more than once: ${id}`, 'PLUGIN_DUPLICATE_SELECTION');
            uniqueIds.add(id);
            if (!registry.has(id)) throw new CorePluginRuntimeError(`Plugin is not in the bundled catalog: ${id}`, 'PLUGIN_NOT_IN_CATALOG');
        }
        for (const id of Object.keys(dependenciesByPluginId)) {
            if (!uniqueIds.has(id)) throw new CorePluginRuntimeError(`Dependencies were supplied for an unselected Plugin: ${id}`, 'PLUGIN_NOT_SELECTED');
        }

        for (const id of uniqueIds) {
            if (host.hasPlugin(id)) continue;
            const plugin = registry.createPlugin(id, dependenciesByPluginId[id] || {});
            host.register(plugin);
        }
        return Object.freeze({
            executeOperation: (pluginId, operationId, input, context) => host.execute(pluginId, operationId, input, context)
        });
    }

    function listPlugins() {
        const runtimeById = new Map(host.listPlugins().map((plugin) => [plugin.id, plugin]));
        return registry.listMetadata().map((metadata) => {
            const runtime = runtimeById.get(metadata.id);
            return Object.freeze({
                ...metadata,
                state: runtime?.state || 'not_loaded',
                activeExecutions: runtime?.activeExecutions || 0
            });
        });
    }

    function getPlugin(pluginId) {
        const id = String(pluginId || '').trim();
        return listPlugins().find((plugin) => plugin.id === id) || null;
    }

    return Object.freeze({
        registry,
        host,
        ensurePlugins,
        listPlugins,
        getPlugin
    });
}

module.exports = { CorePluginRuntimeError, createCorePluginRuntime };
