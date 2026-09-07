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
    const tabNames = ['quick', 'trend-posting', 'queue', 'smart-comment', 'automation'];

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
    assert.equal((view.match(/class="blog-next-tab-btn[^>]*tabindex="-1"/g) || []).length, 4);
});

test('Blog Beta panels share one intro slot and keep distinct local roles', () => {
    const view = readBlogNextView();
    const styles = read('ui/styles/features/blog-next-panel-anatomy.css');

    assert.equal((view.match(/blog-next-panel-lead blog-next-panel-intro/g) || []).length, 5);
    assert.match(view, /원하는 방식으로 글 준비/);
    assert.match(view, /준비한 글을 한곳에서 관리/);
    assert.match(view, /blog-next-mode-switch blog-next-segmented-nav blog-next-panel-local-nav/);
    assert.match(view, /blog-next-management-tab-list blog-next-segmented-nav/);
    assert.match(view, /blog-next-trend-head blog-next-panel-lead blog-next-panel-intro/);
    assert.match(view, /blog-next-smart-comment-intro blog-next-panel-lead blog-next-panel-intro/);
    assert.match(view, /blog-next-panel-lead blog-next-panel-intro[^>]*>[\s\S]{0,180}준비된 글을 원하는 시간에 이어서 발행/);
    assert.match(styles, /\.blog-next-panel-lead\s*\{[^}]*min-height:\s*64px;/s);
    assert.match(styles, /\.blog-next-segmented-nav\s*\{/);
    assert.match(styles, /\.blog-next-segmented-nav \.blog-next-mode-btn\.active,[\s\S]{0,100}\.blog-next-segmented-nav \.blog-next-management-tab\.active/);
    assert.match(styles, /\.active\s*\{[^}]*background:\s*var\(--ui-action-primary-soft\);[^}]*box-shadow:\s*inset/s);
    assert.match(styles, /:hover:not\(\.active\)\s*\{/);
    assert.match(styles, /\.blog-next-management-tab\.active strong\s*\{[^}]*background:\s*var\(--ui-surface\)/s);
});

test('Blog Beta typography hierarchy uses shared semantic roles', () => {
    const shellStyles = read('ui/styles/features/continuous-publishing.css');
    const anatomyStyles = read('ui/styles/features/blog-next-panel-anatomy.css');
    const usabilityStyles = read('ui/styles/features/continuous-publishing-usability.css');
    const styleEntry = read('ui/styles.css');

    assert.match(
        shellStyles,
        /\.blog-next-tab-btn\s*\{[^}]*font-size:\s*var\(--ui-type-body-size\);[^}]*font-weight:\s*var\(--ui-weight-semibold\);[^}]*line-height:\s*var\(--ui-line-height-tight\);/s
    );
    assert.match(shellStyles, /\.blog-next-tab-btn,\s*\.blog-next-mode-btn\s*\{[^}]*font-family:\s*inherit;/s);
    assert.match(
        anatomyStyles,
        /\.blog-next-segmented-nav :where\([^)]*\)\s*\{[^}]*font-family:\s*inherit;[^}]*font-size:\s*var\(--ui-type-label-size\);[^}]*font-weight:\s*var\(--ui-weight-semibold\);/s
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
    assert.match(styles, /\.blog-next-mode-panel\s*\{[^}]*padding:\s*22px/s);
});

test('Blog Beta tab interaction separates selection and keyboard focus', () => {
    const shell = read('ui/scripts/features/blog-next/shell.js');
    const styles = read('ui/styles/features/blog-next-panel-anatomy.css');
    const chrome = read('ui/styles/components/app-chrome.css');

    assert.match(shell, /button\.tabIndex = active \? 0 : -1/);
    assert.match(shell, /\['ArrowLeft', 'ArrowRight', 'Home', 'End'\]/);
    assert.match(shell, /targetButton\.focus\(\)/);
    assert.match(styles, /\.blog-next-tab-btn:focus-visible[\s\S]{0,260}outline:/);
    assert.match(styles, /\.blog-next-tab-btn:focus,[\s\S]{0,180}outline:\s*none/);
    assert.match(styles, /\.blog-next-view \.category-option-btn:focus-visible,[\s\S]{0,180}box-shadow:\s*var\(--ui-focus-ring\)/);
    assert.match(styles, /\.blog-next-view input\[type="checkbox"\]:focus-visible/);
    assert.doesNotMatch(styles, /:focus-visible::\-webkit-calendar-picker-indicator/);
    assert.doesNotMatch(styles, /::\-webkit-calendar-picker-indicator:focus\s*\{[^}]*outline:/s);
    assert.match(styles, /input:is\(\[type="time"\], \[type="datetime-local"\]\):focus-visible\s*\{[^}]*box-shadow:\s*var\(--ui-focus-ring\)/s);
    assert.match(chrome, /\.app-footer-link:focus-visible\s*\{[^}]*border-color:\s*var\(--ui-border-focus\);[^}]*box-shadow:\s*var\(--ui-focus-ring\)/s);
});
