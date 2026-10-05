'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'ui/partials/views/site-hosting.html'), 'utf8');
const creation = fs.readFileSync(path.join(root, 'ui/scripts/features/site-hosting/site-creation-navigation.js'), 'utf8');
const profile = fs.readFileSync(path.join(root, 'ui/scripts/features/site-hosting/site-profile-fields.js'), 'utf8');

test('site creation exposes optional site SEO fields with indexing enabled by default', () => {
    assert.match(html, /id="site-name"[^>]*required/);
    assert.match(html, /id="site-description"[^>]*maxlength="300"/);
    assert.match(html, /id="site-share-image"/);
    assert.match(html, /id="site-favicon"/);
    assert.match(html, /id="site-search-indexing" type="checkbox" checked/);
    assert.match(html, /가로형 권장 \(예: 600×200px\)/);
    assert.match(html, /권장 1200×630px/);
    assert.match(html, /정사각형 512×512px 권장/);
    assert.doesNotMatch(html, /글에는 적용되지 않음|검색 제외 신호를 보냅니다/);
    assert.match(creation, /search_engine_indexing: document\.getElementById\('site-search-indexing'\)\?\.checked !== false/);
    assert.doesNotMatch(creation, /search_indexing:/);
});

test('site creation footer places guarded cancel on the left and preview/create on the right', () => {
    const cancel = html.indexOf('data-site-create-cancel');
    const preview = html.indexOf('data-site-create-preview');
    const create = html.indexOf('사이트 만들기</button>', preview);
    assert.ok(cancel >= 0 && cancel < preview && preview < create);
    assert.match(html, /id="site-create-cancel-dialog"/);
    assert.match(html, /value="stay">계속 작성/);
    assert.match(html, /value="confirm">취소하고 닫기/);
    assert.match(creation, /siteHostingRequestCreateCancel/);
    assert.match(creation, /siteHostingCreateFormSnapshot\(\) !== siteHostingCreateInitialSnapshot/);
    assert.match(creation, /confirmation\.returnValue === 'confirm'/);
});

test('site profile image helpers are isolated for reuse by future site settings', () => {
    assert.match(profile, /function siteHostingReadProfileImage/);
    assert.match(profile, /function siteHostingSetProfileImagePreview/);
    assert.match(creation, /siteHostingReadProfileImage\(input\.files\[0\], field\.label\)/);
});
