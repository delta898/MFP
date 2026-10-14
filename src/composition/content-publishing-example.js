'use strict';

const { createPluginHost } = require('../platform/plugin-host');
const { createContentPublishingExample } = require('../applications/examples/content-publishing');

function createContentPublishingExampleSystem(plugins) {
    const pluginHost = createPluginHost({ plugins });
    const application = createContentPublishingExample({
        executeOperation: (pluginId, operationId, input, context) => (
            pluginHost.execute(pluginId, operationId, input, context)
        )
    });

    return Object.freeze({ pluginHost, application });
}

module.exports = { createContentPublishingExampleSystem };
