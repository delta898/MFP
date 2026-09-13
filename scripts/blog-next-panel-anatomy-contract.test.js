const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHtmlCompositionRuntime } = require('../src/ui-runtime/html-composition-runtime');

const ROOT = path.join(__dirname, '..');

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function readBlogNextView() {
    return createHtmlCompositionRuntime({ fs, path }).composeHtmlFile({
        uiRoot: path.join(ROOT, 'ui'),
        entryFile: 'partials/views/blog-next.html'
    }).html;
}

test('Blog Beta top-level tabs and panels expose a complete accessibility relationship', () => {
    const view = readBlogNextView();
    const tabNames = ['quick', 'trend-posting', 'queue', 'smart-comment'];

    for (const name of tabNames) {
        assert.match(
            view,
            new RegExp(`id="blog-next-tab-${name}"[\\s\\S]{0,180}aria-controls="blog-next-panel-${name}"`)
        );
        assert.match(
            view,
            new RegExp(`id="blog-next-panel-${name}"[\\s\\S]{0,120}aria-labelledby="blog-next-tab-${name}"`)
        );
    }

    assert.match(view, /id="blog-next-tab-quick"[^>]*tabindex="0"/);
    assert.equal((view.match(/class="blog-next-tab-btn[^>]*tabindex="-1"/g) || []).length, 3);
    assert.doesNotMatch(view, /data-blog-next-tab="automation"/);
});

test('Blog Beta panels share one intro slot and keep distinct local roles', () => {
    const view = readBlogNextView();
    const styles = read('ui/styles/features/blog-next-panel-anatomy.css');
    const tabs = read('ui/styles/patterns/tab-navigation.css');

    assert.equal((view.match(/blog-next-panel-lead blog-next-panel-intro/g) || []).length, 4);
    assert.match(view, /원하는 방식으로 글 준비/);
    assert.match(view, /준비한 글을 한곳에서 관리/);
    assert.match(view, /blog-next-mode-switch blog-next-segmented-nav blog-next-panel-local-nav/);
    assert.match(view, /blog-next-management-tab-list blog-next-segmented-nav/);
    assert.match(view, /blog-next-trend-head blog-next-panel-lead blog-next-panel-intro/);
    assert.match(view, /blog-next-smart-comment-intro blog-next-panel-lead blog-next-panel-intro/);
    assert.match(view, /data-blog-next-management-tab="automation">연속 발행 설정/);
    assert.match(view, /data-blog-next-management-panel="automation"[\s\S]{0,120}aria-labelledby="blog-next-management-tab-automation"/);
    assert.match(styles, /\.blog-next-panel-lead\s*\{[^}]*min-height:\s*64px;/s);
    assert.match(tabs, /\.ui-segmented-tabs\s*\{/);
    assert.match(tabs, /\.ui-segmented-tab\.active\s*\{[^}]*box-shadow:\s*var\(--ui-segmented-active-shadow\)/s);
    assert.match(tabs, /:hover:not\(\.active\)\s*\{/);
    assert.match(styles, /\.blog-next-management-tab\.active strong\s*\{[^}]*background:\s*var\(--ui-surface\)/s);
});

test('Blog Beta typography hierarchy uses shared semantic roles', () => {
    const shellStyles = read('ui/styles/features/continuous-publishing.css');
    const anatomyStyles = read('ui/styles/features/blog-next-panel-anatomy.css');
    const usabilityStyles = read('ui/styles/features/continuous-publishing-usability.css');
    const tabStyles = read('ui/styles/patterns/tab-navigation.css');
    const styleEntry = read('ui/styles.css');

    assert.match(
        tabStyles,
        /\.ui-top-tab\s*\{[^}]*font-size:\s*var\(--ui-type-body-size\);/s
    );
    assert.match(tabStyles, /\.ui-top-tab,\s*\.ui-segmented-tab\s*\{[^}]*font-family:\s*inherit;[^}]*font-weight:\s*var\(--ui-weight-semibold\);/s);
    assert.match(
        tabStyles,
        /\.ui-segmented-tab\s*\{[^}]*font-size:\s*var\(--ui-type-label-size\);/s
    );
    assert.match(
        anatomyStyles,
        /\.blog-next-panel-intro h2\s*\{[^}]*font-size:\s*var\(--ui-type-heading-size\);[^}]*font-weight:\s*var\(--ui-weight-bold\);/s
    );
    assert.match(
        anatomyStyles,
        /\.blog-next-panel-intro p\s*\{[^}]*font-size:\s*var\(--ui-type-body-size\);[^}]*font-weight:\s*var\(--ui-weight-regular\);[^}]*line-height:\s*var\(--ui-line-height-body\);/s
    );
    assert.match(
        usabilityStyles,
        /\.blog-next-management-tab strong\s*\{[^}]*font-size:\s*var\(--ui-type-caption-size\);[^}]*font-weight:\s*inherit;/s
    );
    assert.match(styleEntry, /Noto\+Sans\+KR:wght@400;500;600;700/);
});

test('Blog Beta quick modes share the same content start inset', () => {
    const styles = read('ui/styles/features/continuous-publishing.css');

    assert.doesNotMatch(styles, /\.blog-next-topic-form\s*\{[^}]*margin-top:/s);
    assert.match(styles, /\.blog-next-mode-panel\s*\{[^}]*padding:\s*var\(--ui-density-section-padding\)/s);
});

test('Blog Beta tab interaction separates selection and keyboard focus', () => {
    const shell = read('ui/scripts/features/blog-next/shell.js');
    const styles = read('ui/styles/features/blog-next-panel-anatomy.css');
    const tabs = read('ui/styles/patterns/tab-navigation.css');
    const tabNavigation = read('ui/scripts/foundation/tab-navigation.js');
    const chrome = read('ui/styles/components/app-chrome.css');

    assert.match(shell, /button\.tabIndex = active \? 0 : -1/);
    assert.match(shell, /handleUiTabNavigationKeydown/);
    assert.match(tabNavigation, /ArrowLeft.*ArrowRight.*Home.*End/s);
    assert.match(tabNavigation, /targetButton\.focus\(\)/);
    assert.match(tabs, /\.ui-top-tab:focus-visible[\s\S]{0,260}box-shadow:/);
    assert.match(tabs, /\.ui-top-tab:focus,[\s\S]{0,180}outline:\s*none/);
    assert.match(styles, /\.blog-next-view \.category-option-btn:focus-visible,[\s\S]{0,180}box-shadow:\s*var\(--ui-focus-ring\)/);
    assert.match(styles, /\.blog-next-view input\[type="checkbox"\]:focus-visible/);
    assert.doesNotMatch(styles, /:focus-visible::\-webkit-calendar-picker-indicator/);
    assert.doesNotMatch(styles, /::\-webkit-calendar-picker-indicator:focus\s*\{[^}]*outline:/s);
    assert.match(styles, /input:is\(\[type="time"\], \[type="datetime-local"\]\):focus-visible\s*\{[^}]*box-shadow:\s*var\(--ui-focus-ring\)/s);
    assert.match(chrome, /\.app-footer-link:focus-visible\s*\{[^}]*border-color:\s*var\(--ui-border-focus\);[^}]*box-shadow:\s*var\(--ui-focus-ring\)/s);
});
