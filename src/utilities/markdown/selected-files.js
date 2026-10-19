'use strict';

const path = require('node:path');

function normalizeString(value) {
    return String(value || '').trim();
}

function isMarkdownFilePath(filePath = '') {
    return /\.(md|markdown)$/i.test(normalizeString(filePath));
}

function compareByNameAsc(left = '', right = '') {
    return String(left || '').localeCompare(String(right || ''), 'en', { sensitivity: 'base' });
}

function normalizeRelativePath(value = '') {
    return normalizeString(value).replace(/\\/g, '/').replace(/^\/+/, '');
}

function splitRootRelativePath(relativePath = '') {
    const normalized = normalizeRelativePath(relativePath);
    if (!normalized) return { rootFolderName: '', childPath: '' };
    const parts = normalized.split('/').filter(Boolean);
    if (parts.length <= 1) return { rootFolderName: '', childPath: parts[0] || '' };
    return { rootFolderName: parts[0], childPath: parts.slice(1).join('/') };
}

function normalizeSelectedFiles(selectedFiles = []) {
    const list = Array.isArray(selectedFiles) ? selectedFiles : [];
    return list.map((item) => {
        const relativePath = normalizeRelativePath(item?.relativePath || item?.webkitRelativePath || item?.path || item?.name);
        const { rootFolderName, childPath } = splitRootRelativePath(relativePath);
        const fileName = normalizeString(item?.name) || normalizeString(childPath ? path.basename(childPath) : relativePath);
        return {
            relativePath,
            rootFolderName,
            rootRelativePath: childPath || relativePath,
            fileName,
            contentType: normalizeString(item?.contentType || item?.type),
            textContent: typeof item?.textContent === 'string' ? item.textContent : '',
            size: Number.isFinite(Number(item?.size)) ? Number(item.size) : 0
        };
    }).filter((item) => item.relativePath && item.fileName);
}

function resolveMarkdownEntryFromSelectedFiles(selectedFiles = []) {
    const normalizedEntries = normalizeSelectedFiles(selectedFiles);
    const rootLevelMarkdownEntries = normalizedEntries
        .filter((entry) => entry.rootRelativePath && !entry.rootRelativePath.includes('/'))
        .filter((entry) => isMarkdownFilePath(entry.fileName))
        .sort((left, right) => compareByNameAsc(left.fileName, right.fileName));
    if (rootLevelMarkdownEntries.length === 0) {
        throw new Error('선택한 폴더 안에 markdown 파일(.md, .markdown)이 없습니다.');
    }
    const preferredEntry = rootLevelMarkdownEntries.find((entry) => entry.fileName.toLowerCase() === 'contents.md')
        || rootLevelMarkdownEntries[0];
    return { preferredEntry, normalizedEntries };
}

module.exports = {
    compareByNameAsc,
    isMarkdownFilePath,
    normalizeRelativePath,
    normalizeSelectedFiles,
    normalizeString,
    resolveMarkdownEntryFromSelectedFiles,
    splitRootRelativePath
};
