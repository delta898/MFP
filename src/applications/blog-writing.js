'use strict';

const { createWordPressPublishingApplication } = require('./wordpress-publishing');

function createBlogWritingApplication(options = {}) {
    if (typeof options.executeOperation !== 'function') {
        throw new TypeError('Blog Writing Application requires executeOperation().');
    }

    const wordpress = options.wordpressApplication
        || createWordPressPublishingApplication({ executeOperation: options.executeOperation });

    return Object.freeze({
        async generateText(prompt, executionContext = {}) {
            if (typeof prompt !== 'string' || !prompt.trim()) {
                throw new TypeError('Blog manuscript prompt must be a non-empty string.');
            }
            const generated = await options.executeOperation(
                'content-generator',
                'text.generate',
                { prompt: prompt.trim() },
                executionContext
            );
            return generated.text;
        },

        async listWordPressCategories(search = '', executionContext = {}) {
            const result = await options.executeOperation(
                'wordpress-publisher',
                'categories.list',
                { search: typeof search === 'string' ? search.trim() : '' },
                executionContext
            );
            return result;
        },

        async publishWordPress(request, executionContext = {}) {
            return wordpress.publish(request, executionContext);
        }
    });
}

module.exports = { createBlogWritingApplication };
