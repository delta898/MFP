'use strict';

const BLOGGENIUS_VERSION = require('../../package.json').version;
const SUPPORTED_BLOGGENIUS_CONTRACTS = Object.freeze({
    'bloggenius-site-hosting-template': '0.7.2',
    'bloggenius-ui-style-tokens': '1.0'
});

function parseVersion(value) {
    const match = String(value || '').match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
    if (!match) return null;
    return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function compareVersions(left, right) {
    const a = parseVersion(left);
    const b = parseVersion(right);
    if (!a || !b) return null;
    for (const key of ['major', 'minor', 'patch']) {
        if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
    }
    return 0;
}

function isCompatibleWithBlogGenius(compatibility, options = {}) {
    const appVersion = String(options.appVersion || BLOGGENIUS_VERSION);
    const contracts = options.supportedContracts || SUPPORTED_BLOGGENIUS_CONTRACTS;
    const minimum = compatibility?.min_bloggenius_version;
    const contract = compatibility?.contract;
    // Development and release-candidate builds (for example 0.6.0-dev1 or
    // 0.6.0-rc1) exercise their target release line before the stable build.
    // Treat only those exact -devN/-rcN lines as their base version for gating.
    const prereleaseBaseVersion = appVersion.match(/^(\d+\.\d+\.\d+)-(?:dev|rc)\d+$/)?.[1];
    const comparison = compareVersions(prereleaseBaseVersion || appVersion, minimum);
    return comparison !== null && comparison >= 0
        && typeof contract?.id === 'string'
        && contracts[contract.id] === contract.version;
}

module.exports = {
    BLOGGENIUS_VERSION,
    SUPPORTED_BLOGGENIUS_CONTRACTS,
    compareVersions,
    isCompatibleWithBlogGenius
};
