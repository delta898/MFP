const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { materializeSelectedFilesToWorkspace } = require('./local-markdown-workspace');

test('materializeSelectedFilesToWorkspace writes markdown and image files into temp workspace', () => {
    const imageBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7ZQfQAAAAASUVORK5CYII=', 'base64');
    const workspace = materializeSelectedFilesToWorkspace({
        selectedFiles: [
            {
                relativePath: 'manuscript/contents.md',
                name: 'contents.md',
                textContent: '# 테스트 제목\n\n본문'
            },
            {
                relativePath: 'manuscript/00_image.png',
                name: '00_image.png',
                base64Data: `data:image/png;base64,${imageBuffer.toString('base64')}`
            }
        ]
    });

    try {
        assert.equal(fs.existsSync(path.join(workspace.tempDir, 'contents.md')), true);
        assert.equal(fs.readFileSync(path.join(workspace.tempDir, 'contents.md'), 'utf-8'), '# 테스트 제목\n\n본문');
        assert.equal(fs.existsSync(path.join(workspace.tempDir, '00_image.png')), true);
        assert.deepEqual(fs.readFileSync(path.join(workspace.tempDir, '00_image.png')), imageBuffer);
        assert.equal(workspace.markdownFileName, 'contents.md');
    } finally {
        fs.rmSync(workspace.tempDir, { recursive: true, force: true });
    }
});

test('materializeSelectedFilesToWorkspace throws when no markdown file exists', () => {
    assert.throws(
        () => materializeSelectedFilesToWorkspace({
            selectedFiles: [
                {
                    relativePath: 'manuscript/00_image.png',
                    name: '00_image.png',
                    base64Data: 'data:image/png;base64,AAAA'
                }
            ]
        }, { fs, os, path }),
        /markdown 파일/
    );
});

test('materializeSelectedFilesToWorkspace writes preferred markdown as contents.md for legacy publish flow', () => {
    const workspace = materializeSelectedFilesToWorkspace({
        selectedFiles: [
            {
                relativePath: 'manuscript/a-post.md',
                name: 'a-post.md',
                textContent: '# 다른 이름 제목\n\n본문'
            }
        ]
    });

    try {
        assert.equal(fs.readFileSync(path.join(workspace.tempDir, 'contents.md'), 'utf-8'), '# 다른 이름 제목\n\n본문');
        assert.equal(path.basename(workspace.markdownPath), 'contents.md');
    } finally {
        fs.rmSync(workspace.tempDir, { recursive: true, force: true });
    }
});
