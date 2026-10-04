'use strict';

const IMAGE_BLOCK_PATTERN = /\[\[IMAGE_(\d+)\r?\n(?:[ \t]*id:([^\r\n]*)\r?\n)?[ \t]*title:[ \t]*([^\r\n]*)\r?\n[ \t]*prompt:[ \t]*([\s\S]*?)\r?\n\]\]/g;

function parseImageBlocks(markdown = '') {
    const blocks = [];
    const matcher = new RegExp(IMAGE_BLOCK_PATTERN.source, 'g');
    let match;
    while ((match = matcher.exec(String(markdown || ''))) !== null) {
        blocks.push({
            fullTag: match[0],
            index: Number.parseInt(match[1], 10),
            blockId: String(match[2] || '').trim(),
            title: String(match[3] || '').trim(),
            prompt: String(match[4] || '').trim(),
            start: match.index,
            end: matcher.lastIndex
        });
    }
    return blocks;
}

function replaceImageBlocks(markdown = '', replace) {
    if (typeof replace !== 'function') throw new TypeError('이미지 블록 치환 함수가 필요합니다.');
    const source = String(markdown || '');
    const matcher = new RegExp(IMAGE_BLOCK_PATTERN.source, 'g');
    return source.replace(matcher, (fullTag, rawIndex, blockId, title, prompt, start) => replace({
        fullTag,
        index: Number.parseInt(rawIndex, 10),
        blockId: String(blockId || '').trim(),
        title: String(title || '').trim(),
        prompt: String(prompt || '').trim(),
        start
    }));
}

module.exports = { parseImageBlocks, replaceImageBlocks };
