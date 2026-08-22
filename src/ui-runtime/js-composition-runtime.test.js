const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createJsCompositionRuntime } = require('./js-composition-runtime');

function createFixture(files) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-js-composition-'));
    Object.entries(files).forEach(([relativePath, content]) => {
        const filePath = path.join(root, relativePath);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content);
    });
    return root;
}

test('composes classic-script modules in manifest order', (t) => {
    const uiRoot = createFixture({
        'app.js': '// @include scripts/first.js\n// @include scripts/second.js\n',
        'scripts/first.js': 'const first = 1;\n',
        'scripts/second.js': 'function second() { return first + 1; }\n'
    });
    t.after(() => fs.rmSync(uiRoot, { recursive: true, force: true }));

    const result = createJsCompositionRuntime({ fs, path }).composeJsFile({ uiRoot });

    assert.equal(result.js, 'const first = 1;\nfunction second() { return first + 1; }\n');
    assert.deepEqual(result.includedFiles, ['scripts/first.js', 'scripts/second.js']);
});

test('rejects invalid, missing, non-JavaScript, and cyclic includes', (t) => {
    const fixtures = [
        { files: { 'app.js': '// @include ../outside.js\n' }, pattern: /허용되지 않은/ },
        { files: { 'app.js': '// @include missing.js\n' }, pattern: /찾을 수 없습니다/ },
        { files: { 'app.js': '// @include fragment.css\n', 'fragment.css': '' }, pattern: /\.js 파일만/ },
        {
            files: { 'app.js': '// @include a.js\n', 'a.js': '// @include app.js\n' },
            pattern: /순환/
        }
    ];

    fixtures.forEach(({ files, pattern }) => {
        const uiRoot = createFixture(files);
        t.after(() => fs.rmSync(uiRoot, { recursive: true, force: true }));
        const runtime = createJsCompositionRuntime({ fs, path });
        assert.throws(() => runtime.composeJsFile({ uiRoot }), pattern);
    });
});
