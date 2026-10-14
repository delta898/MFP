'use strict';

const { createCardNewsGenerationApplication } = require('../applications/card-news/generation/application');

function createCardNewsGenerationSystem(options = {}) {
    const application = createCardNewsGenerationApplication(options);
    return Object.freeze({ application });
}

module.exports = { createCardNewsGenerationSystem };
