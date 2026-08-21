const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');
const uiRoot = path.join(repoRoot, 'ui');
const indexPath = path.join(uiRoot, 'index.html');
const appPath = path.join(uiRoot, 'app.js');

function readUiFile(filePath) {
    return fs.readFileSync(filePath, 'utf8');
}

function collectAttributeValues(source, attributeName) {
    const pattern = new RegExp(`\\b${attributeName}=["']([^"']+)["']`, 'g');
    return Array.from(source.matchAll(pattern), (match) => match[1]);
}

function resolveLocalAsset(assetValue) {
    const raw = String(assetValue || '').trim();
    if (!raw || raw.startsWith('#') || raw.startsWith('data:') || /^[a-z]+:/i.test(raw)) return null;
    const pathname = raw.split(/[?#]/, 1)[0].replace(/^\.\//, '');
    return pathname ? path.join(uiRoot, pathname) : null;
}

test('UI shell has unique DOM ids', () => {
    const html = readUiFile(indexPath);
    const ids = collectAttributeValues(html, 'id');
    const counts = new Map();
    ids.forEach((id) => counts.set(id, (counts.get(id) || 0) + 1));
    const duplicates = Array.from(counts.entries()).filter(([, count]) => count > 1);

    assert.equal(ids.length > 0, true);
    assert.deepEqual(duplicates, []);
});

test('primary navigation buttons map one-to-one to UI views', () => {
    const html = readUiFile(indexPath);
    const navViews = Array.from(html.matchAll(/class=["'][^"']*\bnav-btn\b[^"']*["'][^>]*data-view=["']([^"']+)["']/g), (match) => match[1]);
    const sectionViews = Array.from(html.matchAll(/<section\b[^>]*class=["'][^"']*\bview\b[^"']*["'][^>]*id=["']view-([^"']+)["']/g), (match) => match[1]);

    assert.deepEqual(new Set(navViews), new Set(sectionViews));
    assert.equal(navViews.length, new Set(navViews).size);
    assert.equal(sectionViews.length, new Set(sectionViews).size);
});

test('local script, stylesheet, image, and icon assets referenced by the UI shell exist', () => {
    const html = readUiFile(indexPath);
    const assetValues = [
        ...collectAttributeValues(html, 'src'),
        ...collectAttributeValues(html, 'href')
    ];
    const missing = assetValues
        .map(resolveLocalAsset)
        .filter(Boolean)
        .filter((filePath) => !fs.existsSync(filePath))
        .map((filePath) => path.relative(repoRoot, filePath));

    assert.deepEqual(missing, []);
});

test('browser entry script parses as a classic script', () => {
    assert.doesNotThrow(() => new vm.Script(readUiFile(appPath), { filename: appPath }));
});
