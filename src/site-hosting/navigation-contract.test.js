'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizeMenuDestination, normalizeNavigationItems } = require('./navigation-contract');

test('menu destinations accept valid URLs and paths without imposing route policy', () => {
    for (const destination of [
        '/', '/about/', '/about/team/', '../about/team', 'https://example.com/path?x=1#part',
        'mailto:hello@example.com', 'tel:+821012345678', '//example.com/path', '/%2fadmin/', '/%2e%2e/'
    ]) assert.equal(normalizeMenuDestination(destination), destination);
    for (const destination of ['', 'https://[bad-host/', '/bad%zz/', 'java\nscript:alert(1)', 'javascript:alert(1)', 'data:text/html,hi']) {
        assert.throws(() => normalizeMenuDestination(destination), { code: 'SITE_HOSTING_MENU_PATH_INVALID' }, destination);
    }
});

test('menu records retain repeated valid destinations but reject unknown fields and malformed labels', () => {
    assert.deepEqual(normalizeNavigationItems([{ label: '소개', href: '/about/' }]), [{ label: '소개', href: '/about/' }]);
    assert.throws(() => normalizeNavigationItems([{ label: '소개', href: '/about/', target: 'external' }]), { code: 'SITE_HOSTING_NAVIGATION_INVALID' });
    assert.deepEqual(normalizeNavigationItems([{ label: '<About>', href: '/about/' }, { label: 'About', href: '/about/' }]).length, 2);
    assert.throws(() => normalizeNavigationItems([{ label: 'bad\nlabel', href: '/about/' }]), { code: 'SITE_HOSTING_NAVIGATION_INVALID' });
});
