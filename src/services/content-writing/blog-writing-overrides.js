'use strict';

const { PROFILE_ENUMS } = require('./writing-profile');

const BLOG_WRITING_OVERRIDE_FIELDS = Object.freeze({
    length: Object.freeze({ enumKey: 'lengthPreset', path: ['channel', 'length', 'preset'] }),
    opening: Object.freeze({ enumKey: 'opening', path: ['channel', 'structure', 'opening'] }),
    development: Object.freeze({ enumKey: 'development', path: ['channel', 'structure', 'development'] }),
    ending: Object.freeze({ enumKey: 'ending', path: ['channel', 'structure', 'ending'] })
});

function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeBlogWritingOverrides(input = {}) {
    const source = isRecord(input) ? input : {};
    const result = {};
    for (const [field, definition] of Object.entries(BLOG_WRITING_OVERRIDE_FIELDS)) {
        const value = String(source[field] || '').trim().toLowerCase();
        if (PROFILE_ENUMS[definition.enumKey].includes(value)) result[field] = value;
    }
    return result;
}

module.exports = { BLOG_WRITING_OVERRIDE_FIELDS, normalizeBlogWritingOverrides };
