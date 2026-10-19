'use strict';

const { createSettingsWritingProfileApplication } = require('../applications/settings/writing-profile/application');
const { createStyleReferenceFetcher } = require('../adapters/web/style-reference-fetcher');
const { createWritingProfileRepository } = require('../adapters/storage/writing-profiles/repository');

function createSettingsWritingProfileRuntime(options = {}) {
    const fs = options.fs || require('node:fs');
    const path = options.path || require('node:path');
    const config = options.config || {};
    const writingProfileRepository = options.writingProfileRepository || createWritingProfileRepository({
        fs,
        path,
        filePath: config.WRITING_PROFILE_PATH
            || path.join(config.CONFIG_DIR || process.cwd(), 'config', 'writing_profile.json'),
        legacyContentConfig: config.content
    });
    const fetchStyleReference = options.fetchStyleReference || createStyleReferenceFetcher({
        axios: options.axios || require('axios'),
        cheerio: options.cheerio || require('cheerio')
    });
    return createSettingsWritingProfileApplication({ ...options, fs, path, config, writingProfileRepository, fetchStyleReference });
}

module.exports = { createSettingsWritingProfileRuntime };
