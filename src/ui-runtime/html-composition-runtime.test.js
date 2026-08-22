const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createHtmlCompositionRuntime } = require('./html-composition-runtime');

function withFixture(files, callback) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bloggenius-ui-html-'));
    try {
        Object.entries(files).forEach(([relativePath, body]) => {
            const filePath = path.join(root, relativePath);
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, body);
        });
        return callback(root);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
}

test('HTML composition resolves nested partials synchronously in source order', () => {
    withFixture({
        'index.html': '<main><!-- @include partials/content.html --></main>',
        'partials/content.html': '<section>before<!-- @include shared/item.html -->after</section>',
        'partials/shared/item.html': '<strong>item</strong>'
    }, (uiRoot) => {
        const runtime = createHtmlCompositionRuntime({ fs, path });
        const result = runtime.composeHtmlFile({ uiRoot });

        assert.equal(result.html, '<main><section>before<strong>item</strong>after</section></main>');
        assert.deepEqual(result.includedFiles, ['partials/content.html', 'partials/shared/item.html']);
    });
});

test('HTML composition rejects missing, escaping, non-HTML, and cyclic includes', () => {
    const runtime = createHtmlCompositionRuntime({ fs, path });
    const cases = [
        { files: { 'index.html': '<!-- @include missing.html -->' }, pattern: /찾을 수 없습니다/ },
        { files: { 'index.html': '<!-- @include ../outside.html -->' }, pattern: /허용되지 않은/ },
        { files: { 'index.html': '<!-- @include app.js -->', 'app.js': '' }, pattern: /HTML 파일만/ },
        {
            files: { 'index.html': '<!-- @include partial.html -->', 'partial.html': '<!-- @include index.html -->' },
            pattern: /순환 UI include/
        }
    ];

    cases.forEach(({ files, pattern }) => {
        withFixture(files, (uiRoot) => {
            assert.throws(() => runtime.composeHtmlFile({ uiRoot }), pattern);
        });
    });
});
