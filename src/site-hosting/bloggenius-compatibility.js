'use strict';

const BLOGGENIUS_VERSION = require('../../package.json').version;
const SITE_HOSTING_CONTRACT = require('./site-hosting-contract.json');
const SITE_HOSTING_CONTRACT_VERSION = SITE_HOSTING_CONTRACT.version;
const SITE_HOSTING_SUPPORTED_CONTRACT_VERSIONS = Object.freeze([
    SITE_HOSTING_CONTRACT_VERSION,
    ...(Array.isArray(SITE_HOSTING_CONTRACT.previous_versions_supported) ? SITE_HOSTING_CONTRACT.previous_versions_supported : [])
]);
const SITE_HOSTING_TEMPLATE_UPDATE_POLICY = Object.freeze({
    strategy: SITE_HOSTING_CONTRACT.template_update_policy?.strategy || '',
    managed_paths: Object.freeze([...(SITE_HOSTING_CONTRACT.template_update_policy?.managed_paths || [])]),
    preserved_paths: Object.freeze([...(SITE_HOSTING_CONTRACT.template_update_policy?.preserved_paths || [])])
});
const SUPPORTED_BLOGGENIUS_CONTRACTS = Object.freeze({
    ...Object.fromEntries(SITE_HOSTING_CONTRACT.contract_ids.map((id) => [id, SITE_HOSTING_SUPPORTED_CONTRACT_VERSIONS])),
    'bloggenius-ui-style-tokens': '1.0'
});

function isSupportedSiteHostingContractVersion(version) {
    return SITE_HOSTING_SUPPORTED_CONTRACT_VERSIONS.includes(String(version || ''));
}

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
        && (Array.isArray(contracts[contract.id])
            ? contracts[contract.id].includes(contract.version)
            : contracts[contract.id] === contract.version);
}

module.exports = {
    BLOGGENIUS_VERSION,
    SITE_HOSTING_CONTRACT_VERSION,
    SITE_HOSTING_SUPPORTED_CONTRACT_VERSIONS,
    SITE_HOSTING_TEMPLATE_UPDATE_POLICY,
    SUPPORTED_BLOGGENIUS_CONTRACTS,
    isSupportedSiteHostingContractVersion,
    compareVersions,
    isCompatibleWithBlogGenius
};
