const fs = require('fs');
const os = require('os');
const path = require('path');

const {
    isMarkdownFilePath,
    normalizeSelectedFiles,
    resolveMarkdownEntryFromSelectedFiles
} = require('./local-markdown-preview');

function normalizeRelativePath(value = '') {
    return String(value || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
}

function decodeBase64Data(base64Data = '') {
    let normalized = String(base64Data || '').trim();
    if (!normalized) {
        throw new Error('파일 데이터가 비어 있습니다.');
    }

    const dataUrlMatch = normalized.match(/^data:([^;,]+);base64,(.+)$/i);
    if (dataUrlMatch) {
        normalized = dataUrlMatch[2] || '';
    }

    try {
        return Buffer.from(normalized, 'base64');
    } catch (_error) {
        throw new Error('파일 base64 디코딩에 실패했습니다.');
    }
}

function materializeSelectedFilesToWorkspace(input = {}, deps = {}) {
    const fsImpl = deps.fs || fs;
    const pathImpl = deps.path || path;
    const osImpl = deps.os || os;
    const usingPastedMarkdown = Object.prototype.hasOwnProperty.call(input, 'markdownText');
    const markdownText = String(input.markdownText || '');
    const selectedFiles = Array.isArray(input.selectedFiles) ? input.selectedFiles : [];
    if (!usingPastedMarkdown && selectedFiles.length === 0) {
        throw new Error('선택된 원고 파일이 없습니다.');
    }
    if (usingPastedMarkdown && !markdownText.trim()) {
        throw new Error('붙여넣은 markdown 원고가 비어 있습니다.');
    }

    const normalizedEntries = usingPastedMarkdown ? [] : normalizeSelectedFiles(selectedFiles);
    const preferredEntry = usingPastedMarkdown
        ? null
        : resolveMarkdownEntryFromSelectedFiles(selectedFiles).preferredEntry;
    const sourceByRelativePath = new Map(
        selectedFiles.map((item) => [normalizeRelativePath(item?.relativePath || item?.webkitRelativePath || item?.path || item?.name), item])
    );

    const tempRoot = osImpl.tmpdir();
    const tempDir = fsImpl.mkdtempSync(pathImpl.join(tempRoot, 'bloggenius-manuscript-'));

    try {
        if (usingPastedMarkdown) {
            const canonicalMarkdownPath = pathImpl.join(tempDir, 'contents.md');
            fsImpl.writeFileSync(canonicalMarkdownPath, markdownText, 'utf-8');
            return {
                tempDir,
                markdownPath: canonicalMarkdownPath,
                markdownFileName: '붙여넣은 원고'
            };
        }

        normalizedEntries.forEach((entry) => {
            const source = sourceByRelativePath.get(entry.relativePath) || {};
            const outputRelativePath = entry.rootRelativePath || entry.fileName;
            const outputPath = pathImpl.join(tempDir, outputRelativePath);
            fsImpl.mkdirSync(pathImpl.dirname(outputPath), { recursive: true });

            if (isMarkdownFilePath(entry.fileName)) {
                fsImpl.writeFileSync(outputPath, String(source?.textContent || entry.textContent || ''), 'utf-8');
                return;
            }

            if (typeof source?.base64Data === 'string' && source.base64Data.trim()) {
                fsImpl.writeFileSync(outputPath, decodeBase64Data(source.base64Data));
                return;
            }

            if (typeof source?.textContent === 'string' && source.textContent) {
                fsImpl.writeFileSync(outputPath, source.textContent, 'utf-8');
            }
        });

        const preferredSource = sourceByRelativePath.get(preferredEntry.relativePath) || {};
        const canonicalMarkdownPath = pathImpl.join(tempDir, 'contents.md');
        if ((preferredEntry.rootRelativePath || preferredEntry.fileName) !== 'contents.md') {
            fsImpl.writeFileSync(canonicalMarkdownPath, String(preferredSource?.textContent || preferredEntry.textContent || ''), 'utf-8');
        }

        return {
            tempDir,
            markdownPath: canonicalMarkdownPath,
            markdownFileName: preferredEntry.fileName
        };
    } catch (error) {
        try {
            fsImpl.rmSync(tempDir, { recursive: true, force: true });
        } catch (_cleanupError) { }
        throw error;
    }
}

module.exports = {
    materializeSelectedFilesToWorkspace
};
