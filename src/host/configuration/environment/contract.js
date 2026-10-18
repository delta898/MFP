'use strict';

const ENVIRONMENT_SCHEMA_VERSION = 1;

const ENVIRONMENTS = Object.freeze({
    LOCAL: 'local',
    DEVELOPMENT: 'development',
    PRODUCTION: 'production'
});

const ENVIRONMENT_NAMES = Object.freeze(Object.values(ENVIRONMENTS));

function normalizeEnvironmentName(value) {
    return String(value || '').trim().toLowerCase();
}

function isEnvironmentName(value) {
    return ENVIRONMENT_NAMES.includes(normalizeEnvironmentName(value));
}

function assertEnvironmentName(value) {
    const normalized = normalizeEnvironmentName(value);
    if (!ENVIRONMENT_NAMES.includes(normalized)) {
        throw new Error(
            `Unknown BlogGenius environment: ${normalized || '(empty)'}. `
            + `Expected one of: ${ENVIRONMENT_NAMES.join(', ')}.`
        );
    }
    return normalized;
}

module.exports = {
    ENVIRONMENT_SCHEMA_VERSION,
    ENVIRONMENTS,
    ENVIRONMENT_NAMES,
    normalizeEnvironmentName,
    isEnvironmentName,
    assertEnvironmentName
};
