const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHtmlCompositionRuntime } = require('../src/ui-runtime/html-composition-runtime');
const { createJsCompositionRuntime } = require('../src/ui-runtime/js-composition-runtime');

const repoRoot = path.resolve(__dirname, '..');
const uiRoot = path.join(repoRoot, 'ui');
const indexPath = path.join(uiRoot, 'index.html');
const appPath = path.join(uiRoot, 'app.js');

function readUiFile(filePath) {
    return fs.readFileSync(filePath, 'utf8');
}

function readComposedUiShell() {
    return createHtmlCompositionRuntime({ fs, path }).composeHtmlFile({ uiRoot }).html;
}

function readComposedUiScript() {
    return createJsCompositionRuntime({ fs, path }).composeJsFile({ uiRoot }).js;
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

function collectHtmlFiles(rootDir) {
    return fs.readdirSync(rootDir, { withFileTypes: true }).flatMap((entry) => {
        const entryPath = path.join(rootDir, entry.name);
        if (entry.isDirectory()) return collectHtmlFiles(entryPath);
        return entry.isFile() && entry.name.endsWith('.html') ? [entryPath] : [];
    });
}

test('UI shell has unique DOM ids', () => {
    const html = readComposedUiShell();
    const ids = collectAttributeValues(html, 'id');
    const counts = new Map();
    ids.forEach((id) => counts.set(id, (counts.get(id) || 0) + 1));
    const duplicates = Array.from(counts.entries()).filter(([, count]) => count > 1);

    assert.equal(ids.length > 0, true);
    assert.deepEqual(duplicates, []);
});

test('primary navigation buttons map one-to-one to UI views', () => {
    const html = readComposedUiShell();
    const navViews = Array.from(html.matchAll(/class=["'][^"']*\bnav-btn\b[^"']*["'][^>]*data-view=["']([^"']+)["']/g), (match) => match[1]);
    const sectionViews = Array.from(html.matchAll(/<section\b[^>]*class=["'][^"']*\bview\b[^"']*["'][^>]*id=["']view-([^"']+)["']/g), (match) => match[1]);

    assert.deepEqual(new Set(navViews), new Set(sectionViews));
    assert.equal(navViews.length, new Set(navViews).size);
    assert.equal(sectionViews.length, new Set(sectionViews).size);
});

test('productized Dashboard and Blog navigation expose compact accessible new badges', () => {
    const html = readComposedUiShell();
    const navigationCss = readUiFile(path.join(uiRoot, 'styles', 'layout', 'shell-navigation.css'));

    assert.match(
        html,
        /data-view="blog-next"[\s\S]*?<span class="nav-label">블로그<\/span>/
    );
    assert.match(
        html,
        /data-view="dashboard-beta"[\s\S]*?<span class="nav-label">대시보드<sup class="nav-new-badge" aria-label="새 메뉴">new<\/sup><\/span>/
    );
    assert.match(html, /data-view="blog" hidden aria-hidden="true" tabindex="-1"/);
    assert.match(navigationCss, /\.nav-new-badge\s*\{[^}]*background:\s*var\(--ui-action-primary-soft\);/s);
    assert.match(navigationCss, /\.nav-new-badge\s*\{[^}]*color:\s*var\(--ui-action-primary-hover\);/s);
    assert.match(navigationCss, /\.nav-new-badge\s*\{[^}]*transform:\s*translateY\(-0\.55em\);/s);
    assert.match(html, /id="blog-next-global-nav-status"[^>]*hidden[^>]*aria-hidden="true"/);
    assert.doesNotMatch(html, /id="recommendation-nav-badge"/);
});

test('local script, stylesheet, image, and icon assets referenced by the UI shell exist', () => {
    const html = readComposedUiShell();
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
    assert.doesNotThrow(() => new vm.Script(readComposedUiScript(), { filename: appPath }));
});

test('UI index remains a bounded shell composed from one partial per feature view', () => {
    const shell = readUiFile(indexPath);
    const includePaths = Array.from(
        shell.matchAll(/<!--\s*@include\s+([^\s]+)\s*-->/g),
        (match) => match[1]
    );

    assert.equal(shell.split('\n').length - 1 <= 250, true);
    assert.deepEqual(includePaths, [
        'partials/views/dashboard.html',
        'partials/views/dashboard-beta.html',
        'partials/views/blog.html',
        'partials/views/blog-next.html',
        'partials/views/card-news.html',
        'partials/views/shopping.html',
        'partials/views/social.html',
        'partials/views/account.html',
        'partials/views/settings.html',
        'partials/views/logs.html',
        'partials/views/help.html',
        'partials/overlays.html'
    ]);
    assert.equal(new Set(includePaths).size, includePaths.length);
    includePaths.forEach((includePath) => {
        assert.equal(fs.existsSync(path.join(uiRoot, includePath)), true);
    });
});

test('every HTML partial is reachable and remains below the feature file boundary', () => {
    const partialRoot = path.join(uiRoot, 'partials');
    const partialFiles = collectHtmlFiles(partialRoot);
    const result = createHtmlCompositionRuntime({ fs, path }).composeHtmlFile({ uiRoot });
    const reachable = new Set(result.includedFiles);

    assert.equal(reachable.size, result.includedFiles.length);
    assert.deepEqual(
        new Set(partialFiles.map((filePath) => path.relative(uiRoot, filePath))),
        reachable
    );
    partialFiles.forEach((filePath) => {
        const lineCount = readUiFile(filePath).split('\n').length - 1;
        assert.equal(lineCount <= 500, true, `${path.relative(uiRoot, filePath)} has ${lineCount} lines`);
    });
});
