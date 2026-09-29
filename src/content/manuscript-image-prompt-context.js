'use strict';

function cleanManuscriptContext(text = '') {
    return String(text)
        .replace(/\[\[IMAGE(?:_\d+)?\s*\n[\s\S]*?\n\]\]/g, ' ')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/[`*_>#]/g, '')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
}

function adjacentParagraphs(text = '', direction = 'before') {
    const prose = String(text)
        .replace(/\[\[IMAGE(?:_\d+)?\s*\n[\s\S]*?\n\]\]/g, '')
        .replace(/^\s*#{1,6}\s+.+$/gm, '');
    const paragraphs = prose.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
    return direction === 'after' ? paragraphs.slice(0, 2).join(' ') : paragraphs.slice(-2).join(' ');
}

function selectManuscriptImagePromptContext(markdown = '', image = {}) {
    const source = String(markdown || '');
    const blocks = [...source.matchAll(/\[\[IMAGE(?:_(\d+))?\s*\n([\s\S]*?)\n\]\]/g)];
    const stableBlockId = String(image.blockId || '').trim();
    let blockIndex = stableBlockId
        ? blocks.findIndex((match) => match[2].split(/\r?\n/)
            .some((line) => line.trim() === `id: ${stableBlockId}`))
        : -1;
    let matchedBy = 'block_id';

    if (blockIndex < 0) {
        const imageIndex = Number(image.index);
        if (Number.isInteger(imageIndex) && imageIndex >= 0) {
            blockIndex = blocks.findIndex((match) => Number(match[1]) === imageIndex);
            matchedBy = stableBlockId ? 'index_fallback' : 'image_index';
        }
    }

    if (blockIndex < 0) {
        const error = new Error('이미지 블록 위치를 원고에서 찾지 못했습니다.');
        error.status = 409;
        error.statusCode = 409;
        error.apiCode = 'MANUSCRIPT_IMAGE_CONTEXT_NOT_FOUND';
        error.code = error.apiCode;
        throw error;
    }

    const target = blocks[blockIndex];
    const beforeMarkdown = source.slice(0, target.index);
    const afterMarkdown = source.slice(target.index + target[0].length);
    const afterSectionMarkdown = afterMarkdown.split(/\n(?=#{1,6}\s)/, 1)[0];
    const heading = [...beforeMarkdown.matchAll(/^#{1,6}\s+(.+)$/gm)].at(-1)?.[1] || '';

    return {
        context: {
            section: cleanManuscriptContext(heading).slice(0, 180),
            before: cleanManuscriptContext(adjacentParagraphs(beforeMarkdown)).slice(0, 900),
            after: cleanManuscriptContext(adjacentParagraphs(afterSectionMarkdown, 'after')).slice(0, 900)
        },
        matchedBy,
        imageBlockIndex: blockIndex + 1,
        imageBlockCount: blocks.length,
        sourceImageIndex: Number(target[1])
    };
}

module.exports = { selectManuscriptImagePromptContext };
