'use strict';

class PluginRuntimeCompositionError extends Error {
    constructor(message, code = 'PLUGIN_COMPOSITION_INVALID') {
        super(message);
        this.name = 'PluginRuntimeCompositionError';
        this.code = code;
    }
}

function composePlugins(options = {}) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
        throw new PluginRuntimeCompositionError('Runtime Plugin composition options must be an object.');
    }
    const catalog = options.catalog;
    if (typeof catalog?.list !== 'function' || typeof catalog?.has !== 'function' || typeof catalog?.createPlugin !== 'function') {
        throw new PluginRuntimeCompositionError('Runtime Plugin composition requires a valid Plugin catalog.');
    }

    const pluginIds = options.pluginIds;
    const dependenciesByPluginId = options.dependenciesByPluginId == null
        ? {}
        : options.dependenciesByPluginId;
    if (!Array.isArray(pluginIds) || pluginIds.some((id) => typeof id !== 'string' || !id.trim())) {
        throw new PluginRuntimeCompositionError('Selected Plugin ids must be a non-empty-string array.');
    }
    if (!dependenciesByPluginId || typeof dependenciesByPluginId !== 'object' || Array.isArray(dependenciesByPluginId)) {
        throw new PluginRuntimeCompositionError('Plugin dependencies must be an object keyed by Plugin id.');
    }

    const selectedIds = new Set();
    for (const value of pluginIds) {
        const id = value.trim();
        if (!catalog.has(id)) {
            throw new PluginRuntimeCompositionError(`Selected Plugin is not in the bundled catalog: ${id}`, 'PLUGIN_NOT_IN_CATALOG');
        }
        if (selectedIds.has(id)) {
            throw new PluginRuntimeCompositionError(`Plugin was selected more than once: ${id}`, 'PLUGIN_DUPLICATE_SELECTION');
        }
        selectedIds.add(id);
    }

    for (const id of Object.keys(dependenciesByPluginId)) {
        if (!catalog.has(id)) {
            throw new PluginRuntimeCompositionError(`Dependencies were supplied for a Plugin outside the catalog: ${id}`, 'PLUGIN_NOT_IN_CATALOG');
        }
        if (!selectedIds.has(id)) {
            throw new PluginRuntimeCompositionError(`Dependencies were supplied for an unselected Plugin: ${id}`, 'PLUGIN_NOT_SELECTED');
        }
    }

    return Object.freeze(pluginIds.map((id) => catalog.createPlugin(
        id.trim(),
        dependenciesByPluginId[id.trim()] == null ? {} : dependenciesByPluginId[id.trim()]
    )));
}

module.exports = { PluginRuntimeCompositionError, composePlugins };
