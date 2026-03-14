const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildLocalMarkdownPreview,
    isMarkdownFilePath,
    normalizeSelectedFiles,
    resolveMarkdownEntryFromSelectedFiles,
    resolveMarkdownPathFromDirectory
} = require('./local-markdown-preview');

function createFsStub(files = {}, directories = []) {
    const directorySet = new Set(directories);
    return {
        existsSync(targetPath) {
            return directorySet.has(targetPath) || Object.prototype.hasOwnProperty.call(files, targetPath);
        },
        statSync(targetPath) {
            if (directorySet.has(targetPath)) {
                return {
                    isFile() {
                        return false;
                    },
                    isDirectory() {
                        return true;
                    }
                };
            }
            if (Object.prototype.hasOwnProperty.call(files, targetPath)) {
                return {
                    isFile() {
                        return true;
                    },
                    isDirectory() {
                        return false;
                    }
                };
            }
            throw new Error(`missing path: ${targetPath}`);
        },
        readFileSync(targetPath) {
            return files[targetPath];
        },
        readdirSync(targetPath) {
            if (!directorySet.has(targetPath)) {
                throw new Error(`missing dir: ${targetPath}`);
            }
            return Object.keys(files)
                .filter((filePath) => filePath.startsWith(`${targetPath}/`))
                .map((filePath) => filePath.slice(targetPath.length + 1))
                .filter((fileName) => !fileName.includes('/'));
        }
    };
}

function createUtilsStub(imageMap = {}) {
    return {
        parseMarkdown(raw) {
            const titleMatch = String(raw).match(/^#\s+(.+)$/m);
            return {
                title: titleMatch ? titleMatch[1].trim() : '',
                contents: [
                    { type: 'paragraph', text: '첫 문단' },
                    { type: 'image', index: 0, text: '대표 이미지', prompt: 'golf swing' },
                    { type: 'header-h2', text: '소제목' }
                ]
            };
        },
        findImageByPrefix(dirPath, index) {
            return imageMap[`${dirPath}:${index}`] || null;
        }
    };
}

test('isMarkdownFilePath accepts supported extensions', () => {
    assert.equal(isMarkdownFilePath('/tmp/post.md'), true);
    assert.equal(isMarkdownFilePath('/tmp/post.markdown'), true);
    assert.equal(isMarkdownFilePath('/tmp/post.txt'), false);
});

test('resolveMarkdownPathFromDirectory prefers contents.md, then alphabetical fallback', () => {
    const directoryPath = '/workspace/posts/golf';
    const resolved = resolveMarkdownPathFromDirectory(directoryPath, {
        fs: createFsStub({
            '/workspace/posts/golf/b-post.md': '# B',
            '/workspace/posts/golf/contents.md': '# Contents',
            '/workspace/posts/golf/a-post.markdown': '# A'
        }, [directoryPath]),
        path: require('path')
    });

    assert.equal(resolved, '/workspace/posts/golf/contents.md');

    const fallback = resolveMarkdownPathFromDirectory(directoryPath, {
        fs: createFsStub({
            '/workspace/posts/golf/b-post.md': '# B',
            '/workspace/posts/golf/a-post.markdown': '# A'
        }, [directoryPath]),
        path: require('path')
    });

    assert.equal(fallback, '/workspace/posts/golf/a-post.markdown');
});

test('normalizeSelectedFiles keeps root folder and relative path metadata', () => {
    const files = normalizeSelectedFiles([
        {
            relativePath: 'golf-post/contents.md',
            name: 'contents.md',
            textContent: '# 골프존'
        },
        {
            relativePath: 'golf-post/00_image.png',
            name: '00_image.png'
        }
    ]);

    assert.equal(files.length, 2);
    assert.equal(files[0].rootFolderName, 'golf-post');
    assert.equal(files[0].rootRelativePath, 'contents.md');
});

test('resolveMarkdownEntryFromSelectedFiles prefers contents.md, then alphabetical fallback', () => {
    const { preferredEntry } = resolveMarkdownEntryFromSelectedFiles([
        {
            relativePath: 'golf-post/b-post.md',
            name: 'b-post.md',
            textContent: '# B'
        },
        {
            relativePath: 'golf-post/contents.md',
            name: 'contents.md',
            textContent: '# Contents'
        },
        {
            relativePath: 'golf-post/a-post.markdown',
            name: 'a-post.markdown',
            textContent: '# A'
        }
    ]);

    assert.equal(preferredEntry.fileName, 'contents.md');

    const fallback = resolveMarkdownEntryFromSelectedFiles([
        {
            relativePath: 'golf-post/b-post.md',
            name: 'b-post.md',
            textContent: '# B'
        },
        {
            relativePath: 'golf-post/a-post.markdown',
            name: 'a-post.markdown',
            textContent: '# A'
        }
    ]);

    assert.equal(fallback.preferredEntry.fileName, 'a-post.markdown');
});

test('buildLocalMarkdownPreview returns resolved image info and warnings when fallback is allowed', () => {
    const directoryPath = '/workspace/posts/golf';
    const preview = buildLocalMarkdownPreview({
        directoryPath,
        targets: ['naver'],
        imageGeneration: true
    }, {
        fs: createFsStub({
            '/workspace/posts/golf/contents.md': '# 골프존\n\n본문',
            '/workspace/posts/golf/00_image.png': 'binary'
        }, [directoryPath]),
        path: require('path'),
        Utils: createUtilsStub({
            '/workspace/posts/golf:0': '/workspace/posts/golf/00_image.png'
        })
    });

    assert.equal(preview.title, '골프존');
    assert.equal(preview.images.length, 1);
    assert.equal(preview.images[0].exists, true);
    assert.equal(preview.validation.ok, true);
});

test('buildLocalMarkdownPreview returns errors when title or required image is missing', () => {
    const directoryPath = '/workspace/posts/golf';
    const preview = buildLocalMarkdownPreview({
        directoryPath,
        targets: ['naver'],
        imageGeneration: false
    }, {
        fs: createFsStub({
            '/workspace/posts/golf/contents.md': '본문만 있음'
        }, [directoryPath]),
        path: require('path'),
        Utils: {
            parseMarkdown() {
                return {
                    title: '',
                    contents: [
                        { type: 'image', index: 0, text: '대표 이미지', prompt: 'golf swing' }
                    ]
                };
            },
            findImageByPrefix() {
                return null;
            }
        }
    });

    assert.equal(preview.validation.ok, false);
    assert.equal(preview.validation.errors.some((item) => item.includes('첫 번째 H1')), true);
    assert.equal(preview.validation.errors.some((item) => item.includes('이미지 파일을 찾지 못했습니다')), true);
});

test('buildLocalMarkdownPreview validates targets and schedule date', () => {
    const directoryPath = '/workspace/posts/golf';
    const preview = buildLocalMarkdownPreview({
        directoryPath,
        targets: [],
        postStatus: 'schedule',
        scheduleDate: ''
    }, {
        fs: createFsStub({
            '/workspace/posts/golf/contents.md': '# 골프존\n\n본문'
        }, [directoryPath]),
        path: require('path'),
        Utils: createUtilsStub()
    });

    assert.equal(preview.validation.ok, false);
    assert.equal(preview.validation.errors.some((item) => item.includes('포스팅 대상')), true);
    assert.equal(preview.validation.errors.some((item) => item.includes('예약 일시')), true);
});

test('buildLocalMarkdownPreview throws when directory has no markdown files', () => {
    assert.throws(
        () => buildLocalMarkdownPreview({
            directoryPath: '/workspace/posts/empty',
            targets: ['naver']
        }, {
            fs: createFsStub({
                '/workspace/posts/empty/readme.txt': 'hello'
            }, ['/workspace/posts/empty']),
            path: require('path'),
            Utils: createUtilsStub()
        }),
        /markdown 파일/
    );
});

test('buildLocalMarkdownPreview supports selected folder files from browser input', () => {
    const preview = buildLocalMarkdownPreview({
        selectedFiles: [
            {
                relativePath: 'golf-post/contents.md',
                name: 'contents.md',
                textContent: '# 골프존\n\n본문'
            },
            {
                relativePath: 'golf-post/00_image.png',
                name: '00_image.png',
                contentType: 'image/png'
            }
        ],
        targets: ['naver'],
        imageGeneration: false
    }, {
        fs: createFsStub({}, []),
        path: require('path'),
        Utils: createUtilsStub()
    });

    assert.equal(preview.source.folderName, 'golf-post');
    assert.equal(preview.source.fileName, 'contents.md');
    assert.equal(preview.images[0].exists, true);
    assert.equal(preview.images[0].imagePath, 'golf-post/00_image.png');
    assert.equal(preview.validation.ok, true);
});
