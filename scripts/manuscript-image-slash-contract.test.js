const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.resolve(__dirname, '..');
const editorSource = fs.readFileSync(
    path.join(projectRoot, 'ui/scripts/features/blog/manuscript-editor-entry.js'),
    'utf8'
);
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));

test('manuscript editor registers an image-only slash suggestion at top-level paragraph starts', () => {
    assert.equal(packageJson.devDependencies['@tiptap/suggestion'], '^3.31.3');
    assert.match(editorSource, /name:\s*'manuscriptImageSlash'/);
    assert.match(editorSource, /priority:\s*1000/);
    assert.match(editorSource, /Enter:\s*\(\) => \{[\s\S]*?manuscriptImageSlashPluginKey\.getState\(this\.editor\.state\)[\s\S]*?insertManuscriptImage\(this\.editor, state\.range\)/);
    assert.match(editorSource, /ArrowDown:\s*\(\) => Boolean\(manuscriptImageSlashPluginKey\.getState\(this\.editor\.state\)\?\.active\)/);
    assert.match(editorSource, /char:\s*'\/'/);
    assert.match(editorSource, /startOfLine:\s*true/);
    assert.match(editorSource, /transaction\.docChanged && match\.text === '\/'/);
    assert.match(editorSource, /\$from\.depth === 1[\s\S]*?\$from\.parent\.type\.name === 'paragraph'[\s\S]*?range\.from === \$from\.start\(\)[\s\S]*?range\.to - range\.from === \$from\.parent\.content\.size/);
    assert.deepEqual(
        [...editorSource.matchAll(/id:\s*'([^']+)'[\s\S]*?label:\s*'([^']+)'/g)]
            .filter((match) => match[1] === 'image')
            .map((match) => ({ id: match[1], label: match[2] })),
        [{ id: 'image', label: '이미지 블록' }]
    );
});

test('toolbar and slash selection share the canonical manuscript image insertion path', () => {
    assert.match(editorSource, /command:\s*\(\{ editor: current, range \}\) => insertManuscriptImage\(current, range\)/);
    assert.match(editorSource, /if \(name === 'image'\) \{\s*return insertManuscriptImage\(editor\);\s*\}/);
    assert.match(editorSource, /attrs:\s*\{ sourceKey: nextImageSourceKey\(editor\), blockId: newBlockId\(\), title: '', prompt: '' \}/);
    assert.match(editorSource, /insertContentAt\(\{ from: \$from\.before\(\), to: \$from\.after\(\) \}, image\)/);
    assert.match(editorSource, /return editor\.chain\(\)\.focus\(\)\.insertContent\(image\)\.run\(\)/);
});

test('slash menu exposes accessible listbox options and keyboard selection', () => {
    assert.match(editorSource, /setAttribute\('role', 'listbox'\)/);
    assert.match(editorSource, /setAttribute\('role', 'option'\)/);
    assert.match(editorSource, /event\.key === 'ArrowDown'/);
    assert.match(editorSource, /event\.key === 'ArrowUp'/);
    assert.match(editorSource, /event\.key === 'Enter'/);
    assert.match(editorSource, /option\.addEventListener\('pointerdown'/);
});
