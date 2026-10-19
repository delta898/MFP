'use strict';

const { createSettingsWritingProfileApplication } = require('../applications/settings/writing-profile/application');
const { createStyleReferenceFetcher } = require('../adapters/web/style-reference-fetcher');

function createSettingsWritingProfileRuntime(options = {}) {
    const fetchStyleReference = options.fetchStyleReference || createStyleReferenceFetcher({
        axios: options.axios || require('axios'),
        cheerio: options.cheerio || require('cheerio')
    });
    return createSettingsWritingProfileApplication({ ...options, fetchStyleReference });
}

module.exports = { createSettingsWritingProfileRuntime };
