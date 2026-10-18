'use strict';

const path = require('node:path');
const { createSiteTemplateCatalog } = require('../../../src/adapters/catalogs/amade/cached-template-catalog');

const templatesRoot = path.join(__dirname, 'templates');

function createFixtureSiteTemplateCatalog(options = {}) {
    return createSiteTemplateCatalog({ ...options, templatesRoot: options.templatesRoot || templatesRoot });
}

module.exports = { templatesRoot, createFixtureSiteTemplateCatalog };
