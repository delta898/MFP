'use strict';

const { createSnsGenerationApplication } = require('../applications/sns/generation/application');

function createSnsGenerationSystem(options = {}) {
    const application = createSnsGenerationApplication(options);
    return Object.freeze({ application });
}

module.exports = { createSnsGenerationSystem };
