'use strict';

const { createPluginHost } = require('../platform/plugin-host');
const { createContentPublishingExample } = require('../applications/examples/content-publishing');
const { createContentPublishingPluginAdapters } = require('../adapters/plugins/content-publishing-example');

function createContentPublishingExampleSystem(plugins) {
    const pluginHost = createPluginHost({ plugins });
    const capabilities = createContentPublishingPluginAdapters({
        executeOperation: (pluginId, operationId, input, context) => pluginHost.execute(pluginId, operationId, input, context)
    });
    const application = createContentPublishingExample(capabilities);

    return Object.freeze({ pluginHost, application });
}

module.exports = { createContentPublishingExampleSystem };
