const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createCssCompositionRuntime } = require('./css-composition-runtime');

function withFixture(files, callback) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bloggenius-ui-css-'));
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

test('CSS composition preserves nested module order without browser imports', () => {
    withFixture({
        'styles.css': '/* @include styles/base.css */\n/* @include styles/feature.css */',
        'styles/base.css': ':root { --brand: blue; }',
        'styles/feature.css': '/* @include shared/card.css */\n.card { color: var(--brand); }',
        'styles/shared/card.css': '.card { display: block; }'
    }, (uiRoot) => {
        const runtime = createCssCompositionRuntime({ fs, path });
        const result = runtime.composeCssFile({ uiRoot });

        assert.equal(result.css, ':root { --brand: blue; }.card { display: block; }.card { color: var(--brand); }');
        assert.deepEqual(result.includedFiles, [
            'styles/base.css',
            'styles/feature.css',
            'styles/shared/card.css'
        ]);
    });
});

test('CSS composition rejects escaping, non-CSS, missing, and cyclic includes', () => {
    const runtime = createCssCompositionRuntime({ fs, path });
    const cases = [
        { files: { 'styles.css': '/* @include ../outside.css */' }, pattern: /허용되지 않은/ },
        { files: { 'styles.css': '/* @include missing.css */' }, pattern: /찾을 수 없습니다/ },
        { files: { 'styles.css': '/* @include app.js */', 'app.js': '' }, pattern: /\.css 파일만/ },
        {
            files: { 'styles.css': '/* @include a.css */', 'a.css': '/* @include styles.css */' },
            pattern: /순환 UI CSS include/
        }
    ];

    cases.forEach(({ files, pattern }) => {
        withFixture(files, (uiRoot) => {
            assert.throws(() => runtime.composeCssFile({ uiRoot }), pattern);
        });
    });
});
