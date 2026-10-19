const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHtmlCompositionRuntime } = require('../src/adapters/ui/assets/composition/html-composition');
const { createJsCompositionRuntime } = require('../src/adapters/ui/assets/composition/js-composition');
const { evaluateUiSize } = require('./ui-size-policy');

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

test('UI shell has unique DOM ids and remains within its size policy', (t) => {
    const html = readComposedUiShell();
    const shellSource = readUiFile(indexPath);
    const shellLines = shellSource.split('\n').length - 1;
    const shellSize = evaluateUiSize('htmlShell', shellLines);
    assert.notEqual(shellSize.status, 'error', `ui/index.html has ${shellLines} lines (maximum ${shellSize.maximum})`);
    if (shellSize.status === 'warning') t.diagnostic(`Size recommendation: ui/index.html has ${shellLines} lines (recommended ${shellSize.recommended}; maximum ${shellSize.maximum}).`);
    const htmlIncludes = Array.from(shellSource.matchAll(/<!--\s*@include\s+([^\s]+)\s*-->/g));
    const manifestSize = evaluateUiSize('htmlManifest', htmlIncludes.length);
    assert.notEqual(manifestSize.status, 'error', `ui/index.html has ${htmlIncludes.length} includes (maximum ${manifestSize.maximum})`);
    if (manifestSize.status === 'warning') t.diagnostic(`Size recommendation: ui/index.html has ${htmlIncludes.length} includes (recommended ${manifestSize.recommended}; maximum ${manifestSize.maximum}).`);
    const ids = collectAttributeValues(html, 'id');
    const counts = new Map();
    ids.forEach((id) => counts.set(id, (counts.get(id) || 0) + 1));
    const duplicates = Array.from(counts.entries()).filter(([, count]) => count > 1);

    assert.equal(ids.length > 0, true);
    assert.deepEqual(duplicates, []);
});

test('UI server composition root remains within its size policy', (t) => {
    const serverPath = path.join(repoRoot, 'src/composition/ui-server.js');
    const lineCount = fs.readFileSync(serverPath, 'utf8').split('\n').length - 1;
    const size = evaluateUiSize('serverCompositionRoot', lineCount);
    assert.notEqual(size.status, 'error', `src/composition/ui-server.js has ${lineCount} lines (maximum ${size.maximum})`);
    if (size.status === 'warning') t.diagnostic(`Size recommendation: src/composition/ui-server.js has ${lineCount} lines (recommended ${size.recommended}; maximum ${size.maximum}).`);
});

test('primary navigation buttons map one-to-one to UI views', () => {
    const html = readComposedUiShell();
    const navViews = Array.from(html.matchAll(/class=["'][^"']*\bnav-btn\b[^"']*["'][^>]*data-view=["']([^"']+)["']/g), (match) => match[1]);
    const sectionViews = Array.from(html.matchAll(/<section\b[^>]*class=["'][^"']*\bview\b[^"']*["'][^>]*id=["']view-([^"']+)["']/g), (match) => match[1]);

    assert.deepEqual(new Set(navViews), new Set(sectionViews));
    assert.equal(navViews.length, new Set(navViews).size);
    assert.equal(sectionViews.length, new Set(sectionViews).size);
});

test('retired Blog surface is absent from the shell and browser script bundle', () => {
    const html = readComposedUiShell();
    const script = readComposedUiScript();

    assert.doesNotMatch(html, /data-view="blog"|id="view-blog"/);
    assert.doesNotMatch(script, /function activateBlogTab\(|function runBlogTrendsCollect\(|function runNaverCommentDraft\(/);
});

test('retired Settings surface is absent while legacy deep links still route to Settings Beta', () => {
    const html = readComposedUiShell();
    const script = readComposedUiScript();
    const navigation = readUiFile(path.join(uiRoot, 'scripts', 'foundation', 'navigation.js'));

    assert.doesNotMatch(html, /data-view="settings"|id="view-settings"|partials\/views\/settings\.html/);
    assert.doesNotMatch(script, /function loadSettingsMajor\(|function activateSettingsTab\(/);
    assert.match(navigation, /if \(requestedView === 'settings'\)[\s\S]*navigateToSettingsNextTarget/);
});

test('new site hosting navigation exposes a compact accessible new badge', () => {
    const html = readComposedUiShell();
    const navigationCss = readUiFile(path.join(uiRoot, 'styles', 'layout', 'shell-navigation.css'));

    assert.match(
        html,
        /data-view="blog-next"[\s\S]*?<span class="nav-label">블로그<\/span>/
    );
    assert.match(
        html,
        /data-view="dashboard"[\s\S]*?<span class="nav-label">대시보드<\/span>/
    );
    assert.match(html, /data-view="site-hosting"[\s\S]*?<span class="nav-label">사이트<\/span>\s*<span class="nav-new-badge" aria-label="새 기능">NEW<\/span>/);
    assert.match(navigationCss, /\.nav-new-badge\s*\{/);
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
    const activeIncludePaths = [
        'partials/views/dashboard.html',
        'partials/views/blog-next.html',
        'partials/views/card-news.html',
        'partials/views/shopping.html',
        'partials/views/social.html',
        'partials/views/account.html',
        'partials/views/settings-next.html',
        'partials/views/help.html',
        'partials/overlays.html'
    ];
    assert.equal(activeIncludePaths.every((includePath) => includePaths.includes(includePath)), true);
    assert.equal(new Set(includePaths).size, includePaths.length);
    activeIncludePaths.forEach((includePath) => {
        assert.equal(fs.existsSync(path.join(uiRoot, includePath)), true);
    });
});

test('every HTML partial is reachable and within its size policy', (t) => {
    const partialRoot = path.join(uiRoot, 'partials');
    const partialFiles = collectHtmlFiles(partialRoot);
    const result = createHtmlCompositionRuntime({ fs, path }).composeHtmlFile({ uiRoot });
    const reachable = new Set(result.includedFiles);
    const duplicateIncludes = result.includedFiles.filter((includePath, index, items) => items.indexOf(includePath) !== index);

    assert.deepEqual(new Set(duplicateIncludes), new Set(['partials/views/shared/page-widget-area.html']));
    assert.deepEqual(
        new Set(partialFiles.map((filePath) => path.relative(uiRoot, filePath))),
        reachable
    );
    partialFiles.forEach((filePath) => {
        const lineCount = readUiFile(filePath).split('\n').length - 1;
        const relativePath = path.relative(uiRoot, filePath);
        const size = evaluateUiSize('htmlPartial', lineCount);
        assert.notEqual(size.status, 'error', `${relativePath} has ${lineCount} lines (maximum ${size.maximum})`);
        if (size.status === 'warning') t.diagnostic(`Size recommendation: ${relativePath} has ${lineCount} lines (recommended ${size.recommended}; maximum ${size.maximum}).`);
    });
});
