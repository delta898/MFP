'use strict';

const { createPluginHost } = require('../platform/plugin-host');
const { createWordPressPublishingApplication } = require('../applications/wordpress-publishing');

function createWordPressPublishingSystem(options = {}) {
    if (!options.wordpressPlugin) throw new TypeError('Composition requires a WordPress Publisher Plugin.');
    const pluginHost = createPluginHost({ plugins: [options.wordpressPlugin] });
    const application = createWordPressPublishingApplication({
        executeOperation: (pluginId, operationId, input, context) => (
            pluginHost.execute(pluginId, operationId, input, context)
        )
    });
    return Object.freeze({ pluginHost, application });
}

module.exports = { createWordPressPublishingSystem };
