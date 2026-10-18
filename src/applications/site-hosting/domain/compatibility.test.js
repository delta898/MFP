'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    BLOGGENIUS_VERSION,
    SITE_HOSTING_CONTRACT_VERSION,
    compareVersions,
    isCompatibleWithBlogGenius
} = require('./compatibility');
const { DESIGN_STYLE_CONTRACT_VERSION } = require('../../../../ui/scripts/foundation/design-style-token-contract');

test('BlogGenius compatibility compares stable application release versions', () => {
    assert.equal(compareVersions('0.6.0', '0.5.5'), 1);
    assert.equal(compareVersions('0.6.0', '0.6.0'), 0);
    assert.equal(compareVersions('invalid', '0.6.0'), null);
    assert.equal(compareVersions('0.6.0-beta.1', '0.6.0'), null);
});

test('package compatibility requires minimum app version and an exact supported contract', () => {
    const compatibility = {
        min_bloggenius_version: '0.6.0',
        contract: { id: 'bloggenius-ui-style-tokens', version: DESIGN_STYLE_CONTRACT_VERSION }
    };
    assert.equal(isCompatibleWithBlogGenius(compatibility, { appVersion: '0.6.0' }), true);
    assert.equal(isCompatibleWithBlogGenius(compatibility, { appVersion: '0.5.5' }), false);
    assert.equal(isCompatibleWithBlogGenius({ ...compatibility, contract: { ...compatibility.contract, version: '2.0' } }, { appVersion: '0.6.0' }), false);
    assert.equal(isCompatibleWithBlogGenius(compatibility), compareVersions(BLOGGENIUS_VERSION, '0.6.0') >= 0);
    assert.equal(isCompatibleWithBlogGenius({
        min_bloggenius_version: '0.6.0',
        contract: { id: 'bloggenius-site-hosting-template', version: SITE_HOSTING_CONTRACT_VERSION }
    }, { appVersion: '0.6.0' }), true);
    assert.equal(isCompatibleWithBlogGenius({
        min_bloggenius_version: '0.6.0',
        contract: { id: 'bloggenius-site-hosting-template', version: '0.2.0-dev1' }
    }, { appVersion: '0.6.0' }), true);
    assert.equal(isCompatibleWithBlogGenius({
        min_bloggenius_version: '0.6.0',
        contract: { id: 'bloggenius-site-hosting-template', version: '0.5.0' }
    }, { appVersion: '0.6.0' }), false);
    assert.equal(isCompatibleWithBlogGenius({
        min_bloggenius_version: '0.6.0',
        contract: { id: 'bloggenius-site-hosting-template', version: '0.7.0' }
    }, { appVersion: '0.6.0' }), false);
    assert.equal(isCompatibleWithBlogGenius({
        min_bloggenius_version: '0.6.0',
        contract: { id: 'bloggenius-site-hosting-template', version: '0.7.1' }
    }, { appVersion: '0.6.0' }), false);
});

test('development and release-candidate builds can consume resources for their exact stable release line', () => {
    const compatibility = {
        min_bloggenius_version: '0.6.0',
        contract: { id: 'bloggenius-ui-style-tokens', version: DESIGN_STYLE_CONTRACT_VERSION }
    };
    assert.equal(isCompatibleWithBlogGenius(compatibility, { appVersion: '0.6.0-dev1' }), true);
    assert.equal(isCompatibleWithBlogGenius(compatibility, { appVersion: '0.6.0-rc1' }), true);
    assert.equal(isCompatibleWithBlogGenius(compatibility, { appVersion: '0.5.5-dev1' }), false);
    assert.equal(isCompatibleWithBlogGenius(compatibility, { appVersion: '0.5.5-rc1' }), false);
});
