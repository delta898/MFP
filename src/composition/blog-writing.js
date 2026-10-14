'use strict';

const { createBlogWritingApplication } = require('../applications/blog/writing/application');

function createBlogWritingSystem(options = {}) {
    if (!options.aiGeneration) throw new TypeError('Blog Writing composition requires the shared AI Generation service.');
    const application = createBlogWritingApplication(options);
    return Object.freeze({ application });
}

module.exports = { createBlogWritingSystem };
