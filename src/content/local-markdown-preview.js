const fs = require('fs');
const path = require('path');

function normalizeString(value) {
    return String(value || '').trim();
}

function normalizeTargets(value) {
    const list = Array.isArray(value) ? value : [value];
    return Array.from(new Set(
        list
            .map((item) => normalizeString(item).toLowerCase())
            .filter(Boolean)
            .map((item) => (item.includes('wordpress') ? 'wordpress' : 'naver'))
    ));
}

function isMarkdownFilePath(filePath = '') {
    return /\.(md|markdown)$/i.test(normalizeString(filePath));
}

function isImageFilePath(filePath = '') {
    return /\.(png|jpg|jpeg|webp|avif)$/i.test(normalizeString(filePath));
}

function compareByNameAsc(left = '', right = '') {
    return String(left || '').localeCompare(String(right || ''), 'en', { sensitivity: 'base' });
}

function normalizeRelativePath(value = '') {
    return normalizeString(value).replace(/\\/g, '/').replace(/^\/+/, '');
}

function splitRootRelativePath(relativePath = '') {
    const normalized = normalizeRelativePath(relativePath);
    if (!normalized) {
        return {
            rootFolderName: '',
            childPath: ''
        };
    }

    const parts = normalized.split('/').filter(Boolean);
    if (parts.length <= 1) {
        return {
            rootFolderName: '',
            childPath: parts[0] || ''
        };
    }

    return {
        rootFolderName: parts[0],
        childPath: parts.slice(1).join('/')
    };
}

function normalizeSelectedFiles(selectedFiles = []) {
    const list = Array.isArray(selectedFiles) ? selectedFiles : [];
    return list
        .map((item) => {
            const relativePath = normalizeRelativePath(item?.relativePath || item?.webkitRelativePath || item?.path || item?.name);
            const { rootFolderName, childPath } = splitRootRelativePath(relativePath);
            const fileName = normalizeString(item?.name) || normalizeString(childPath ? path.basename(childPath) : relativePath);
            const rootRelativePath = childPath || relativePath;
            return {
                relativePath,
                rootFolderName,
                rootRelativePath,
                fileName,
                contentType: normalizeString(item?.contentType || item?.type),
                textContent: typeof item?.textContent === 'string' ? item.textContent : '',
                size: Number.isFinite(Number(item?.size)) ? Number(item.size) : 0
            };
        })
        .filter((item) => item.relativePath && item.fileName);
}

function resolveMarkdownPathFromDirectory(directoryPath = '', deps = {}) {
    const fsImpl = deps.fs || fs;
    const pathImpl = deps.path || path;
    const normalizedDirectoryPath = normalizeString(directoryPath);
    if (!normalizedDirectoryPath) {
        throw new Error('directoryPath가 필요합니다.');
    }
    if (!fsImpl.existsSync(normalizedDirectoryPath)) {
        throw new Error(`원고 폴더를 찾을 수 없습니다: ${normalizedDirectoryPath}`);
    }

    const stat = fsImpl.statSync(normalizedDirectoryPath);
    if (!stat.isDirectory || !stat.isDirectory()) {
        throw new Error('선택한 경로가 폴더가 아닙니다.');
    }

    const fileNames = fsImpl.readdirSync(normalizedDirectoryPath);
    const markdownFiles = fileNames
        .filter((fileName) => isMarkdownFilePath(fileName))
        .sort(compareByNameAsc);

    if (markdownFiles.length === 0) {
        throw new Error('선택한 폴더 안에 markdown 파일(.md, .markdown)이 없습니다.');
    }

    const preferredFileName = markdownFiles.find((fileName) => String(fileName).toLowerCase() === 'contents.md')
        || markdownFiles[0];

    return pathImpl.join(normalizedDirectoryPath, preferredFileName);
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

    return {
        preferredEntry,
        normalizedEntries
    };
}

function formatContentItem(item = {}) {
    if (item.type === 'header-h2') return `## ${item.text || ''}`.trim();
    if (item.type === 'quote') return `> ${item.text || ''}`.trim();
    if (item.type === 'list-item') {
        return item.listType === 'ordered'
            ? `1. ${item.text || ''}`.trim()
            : `- ${item.text || ''}`.trim();
    }
    if (item.type === 'separator') return '---';
    if (item.type === 'image') return `[[IMAGE_${item.index || 0}]] ${item.text || ''}`.trim();
    if (item.type === 'newline') return '';
    return normalizeString(item.text);
}

function buildBodyPreview(contents = []) {
    return (Array.isArray(contents) ? contents : [])
        .map((item) => formatContentItem(item))
        .filter((item) => item !== '')
        .slice(0, 24)
        .join('\n')
        .trim();
}

function buildValidation({ title, rawMarkdown, targets, postStatus, scheduleDate, imageGeneration, imageEntries }) {
    const errors = [];
    const warnings = [];

    if (!normalizeString(rawMarkdown)) {
        errors.push('markdown 본문이 비어 있습니다.');
    }
    if (!normalizeString(title)) {
        errors.push('첫 번째 H1(`# 제목`)이 필요합니다.');
    }
    if (!Array.isArray(targets) || targets.length === 0) {
        errors.push('포스팅 대상을 하나 이상 선택해야 합니다.');
    }
    if (postStatus === 'schedule' && !normalizeString(scheduleDate)) {
        errors.push('예약 발행을 위해서는 예약 일시가 필요합니다.');
    }

    (Array.isArray(imageEntries) ? imageEntries : []).forEach((entry) => {
        if (entry.exists) return;
        const message = `${String(entry.index).padStart(2, '0')}_image 규칙의 이미지 파일을 찾지 못했습니다.`;
        if (imageGeneration) {
            warnings.push(`${message} 이미지 생성 fallback이 필요합니다.`);
        } else {
            warnings.push(`${message} 이미지 블록을 유지한 채 임시 저장될 수 있습니다.`);
        }
    });

    return {
        ok: errors.length === 0,
        errors,
        warnings
    };
}

function findImageEntryByPrefix(entries = [], index) {
    const prefix = String(index).padStart(2, '0');
    const priority = ['.avif', '.webp', '.png', '.jpg', '.jpeg'];
    const candidates = (Array.isArray(entries) ? entries : [])
        .filter((entry) => entry.rootRelativePath && !entry.rootRelativePath.includes('/'))
        .filter((entry) => entry.fileName.startsWith(`${prefix}_`))
        .filter((entry) => isImageFilePath(entry.fileName));

    if (candidates.length === 0) return null;

    candidates.sort((left, right) => {
        const extLeft = path.extname(left.fileName).toLowerCase();
        const extRight = path.extname(right.fileName).toLowerCase();
        const indexLeft = priority.indexOf(extLeft);
        const indexRight = priority.indexOf(extRight);
        return (indexLeft < 0 ? 99 : indexLeft) - (indexRight < 0 ? 99 : indexRight);
    });

    return candidates[0];
}

function buildLocalMarkdownPreview(input = {}, deps = {}) {
    const fsImpl = deps.fs || fs;
    const pathImpl = deps.path || path;
    const utils = deps.Utils;
    if (!utils || typeof utils.parseMarkdown !== 'function' || typeof utils.findImageByPrefix !== 'function') {
        throw new Error('Utils.parseMarkdown and Utils.findImageByPrefix are required.');
    }

    const selectedFiles = Array.isArray(input.selectedFiles) ? input.selectedFiles : [];
    const usingSelectedFiles = selectedFiles.length > 0;
    const usingPastedMarkdown = Object.prototype.hasOwnProperty.call(input, 'markdownText');
    const directoryPathInput = normalizeString(input.directoryPath);
    const markdownPathInput = normalizeString(input.markdownPath);
    let rawMarkdown = '';
    let markdownPath = '';
    let directoryPath = '';
    let fileName = '';
    let folderName = normalizeString(input.folderName);
    let availableFileEntries = [];

    if (usingPastedMarkdown) {
        rawMarkdown = String(input.markdownText || '');
        markdownPath = 'contents.md';
        fileName = '붙여넣은 원고';
        folderName = normalizeString(input.folderName) || '붙여넣기';
    } else if (usingSelectedFiles) {
        const { preferredEntry, normalizedEntries } = resolveMarkdownEntryFromSelectedFiles(selectedFiles);
        rawMarkdown = preferredEntry.textContent;
        markdownPath = preferredEntry.relativePath;
        directoryPath = preferredEntry.rootFolderName || folderName;
        fileName = preferredEntry.fileName;
        folderName = preferredEntry.rootFolderName || folderName;
        availableFileEntries = normalizedEntries;

        if (!rawMarkdown) {
            throw new Error(`markdown 파일을 읽지 못했습니다: ${fileName || markdownPath}`);
        }
    } else {
        markdownPath = markdownPathInput
            ? markdownPathInput
            : resolveMarkdownPathFromDirectory(directoryPathInput, { fs: fsImpl, path: pathImpl });

        if (!isMarkdownFilePath(markdownPath)) {
            throw new Error('markdown 파일(.md, .markdown)만 지원합니다.');
        }
        if (!fsImpl.existsSync(markdownPath)) {
            throw new Error(`markdown 파일을 찾을 수 없습니다: ${markdownPath}`);
        }

        const stat = fsImpl.statSync(markdownPath);
        if (!stat.isFile || !stat.isFile()) {
            throw new Error('선택한 경로가 파일이 아닙니다.');
        }

        rawMarkdown = fsImpl.readFileSync(markdownPath, 'utf-8');
        directoryPath = pathImpl.dirname(markdownPath);
        fileName = pathImpl.basename(markdownPath);
        folderName = pathImpl.basename(directoryPath);
    }

    const parsed = utils.parseMarkdown(rawMarkdown);
    const contents = Array.isArray(parsed?.contents) ? parsed.contents : [];
    const targets = normalizeTargets(input.targets);
    const postStatus = normalizeString(input.postStatus || 'publish') || 'publish';
    const scheduleDate = normalizeString(input.scheduleDate);
    const imageGeneration = input.imageGeneration === true;
    const title = normalizeString(parsed?.title);

    const imageEntries = contents
        .filter((item) => item?.type === 'image')
        .map((item) => {
            const selectedImageEntry = usingSelectedFiles
                ? findImageEntryByPrefix(availableFileEntries, item.index)
                : null;
            const imagePath = usingSelectedFiles
                ? normalizeString(selectedImageEntry?.relativePath)
                : utils.findImageByPrefix(directoryPath, item.index);
            const exists = usingSelectedFiles
                ? Boolean(selectedImageEntry)
                : !!(imagePath && fsImpl.existsSync(imagePath));
            return {
                index: Number(item.index || 0),
                title: normalizeString(item.text),
                prompt: normalizeString(item.prompt),
                exists,
                imagePath: exists ? imagePath : '',
                fileName: exists
                    ? (usingSelectedFiles ? normalizeString(selectedImageEntry?.fileName) : pathImpl.basename(imagePath))
                    : ''
            };
        });

    const validation = buildValidation({
        title,
        rawMarkdown,
        targets,
        postStatus,
        scheduleDate,
        imageGeneration,
        imageEntries
    });

    return {
        source: {
            type: usingPastedMarkdown ? 'pasted_markdown' : 'local_markdown',
            markdownPath,
            directoryPath,
            folderName,
            fileName: fileName || pathImpl.basename(markdownPath)
        },
        title,
        rawMarkdown,
        bodyPreview: buildBodyPreview(contents),
        contentItems: contents.map((item) => ({
            type: item.type || 'paragraph',
            text: normalizeString(item.text),
            prompt: normalizeString(item.prompt),
            index: Number.isInteger(Number(item.index)) ? Number(item.index) : null,
            listType: normalizeString(item.listType),
            boldRanges: Array.isArray(item.boldRanges)
                ? item.boldRanges
                    .map((range) => ({
                        start: Number(range?.start),
                        end: Number(range?.end)
                    }))
                    .filter((range) => Number.isInteger(range.start) && Number.isInteger(range.end) && range.end > range.start)
                : []
        })),
        images: imageEntries,
        stats: {
            contentCount: contents.length,
            imageBlockCount: imageEntries.length,
            imageResolvedCount: imageEntries.filter((item) => item.exists).length,
            imageMissingCount: imageEntries.filter((item) => !item.exists).length
        },
        validation
    };
}

module.exports = {
    isMarkdownFilePath,
    normalizeSelectedFiles,
    resolveMarkdownPathFromDirectory,
    resolveMarkdownEntryFromSelectedFiles,
    buildLocalMarkdownPreview
};
