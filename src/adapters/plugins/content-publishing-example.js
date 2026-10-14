'use strict';

function createContentPublishingPluginAdapters(options = {}) {
    if (typeof options.executeOperation !== 'function') throw new TypeError('Example Plugin adapter requires executeOperation().');
    const executeOperation = options.executeOperation;
    return Object.freeze({
        textGeneration: Object.freeze({
            generate: (input, context) => executeOperation('sample-text-generator', 'generate', input, context)
        }),
        publication: Object.freeze({
            publish: (input, context) => executeOperation('sample-publisher', 'publish', input, context)
        })
    });
}

module.exports = { createContentPublishingPluginAdapters };
