'use strict';

const { createWidgetPluginCatalog } = require('../platform/widget-plugin-catalog');

function createBundledWidgetPluginCatalog({ fs, path, logger, configDir }) {
    return createWidgetPluginCatalog({
        fs,
        path,
        logger,
        roots: [
            path.join(configDir, 'plugins'),
            path.resolve(__dirname, '../../packages/plugins/core')
        ]
    });
}

module.exports = { createBundledWidgetPluginCatalog };
