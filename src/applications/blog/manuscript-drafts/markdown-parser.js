'use strict';

function extractInfo(txt, key) {
        let val = '';
        const regex = new RegExp(`^${key}\\s*:`, 'i');
        txt.split('\n').forEach(l => {
            const trimmed = l.trim();
            if (regex.test(trimmed)) { val = trimmed.replace(regex, '').trim(); }
        });
        return val;
}

function parseBlogManuscriptMarkdown(raw, logger = console) {
        const lines = raw.split('\n');
        let title = '';
        const contents = [];
        let skipImageBlock = false;
        let currentImageIndex = null;
        let currentImageIndexProvided = false;
        let currentImageLines = [];
        const usedImageIndexes = new Set(
            Array.from(String(raw || '').matchAll(/^\s*\[\[IMAGE_(\d+)/gm), (match) => Number(match[1]))
        );
        const nextAvailableImageIndex = () => {
            let index = 0;
            while (usedImageIndexes.has(index)) index += 1;
            usedImageIndexes.add(index);
            return index;
        };

        const createTextContent = (type, source, extra = {}) => {
            const rawText = String(source || '');
            const boldRanges = [];
            let text = '';
            let cursor = 0;
            const boldPattern = /\*\*([^*\n]+)\*\*/g;
            let match;

            while ((match = boldPattern.exec(rawText)) !== null) {
                text += rawText.slice(cursor, match.index);
                const start = text.length;
                text += match[1];
                boldRanges.push({ start, end: text.length });
                cursor = match.index + match[0].length;
            }
            text += rawText.slice(cursor);

            return {
                type,
                ...extra,
                text,
                ...(boldRanges.length > 0 ? { boldRanges } : {})
            };
        };

        for (const line of lines) {
            const trimmedLine = line.trim();
            if (!title && trimmedLine.startsWith('# ')) {
                title = trimmedLine.replace(/^#\s+/, '').trim();
                continue;
            }
            const imageStart = trimmedLine.match(/^\[\[IMAGE(?:_(\d+))?(?:\s|\]\]|$)/);
            if (imageStart) {
                // 🔧 [Fixed] 중첩된 이미지 블록 감지 및 처리
                if (skipImageBlock) {
                    logger.warn?.(`⚠️ 중첩된 이미지 블록 감지: ${trimmedLine}`);
                    // 이전 블록 강제 종료
                    contents.push({
                        type: 'image',
                        index: currentImageIndex,
                        raw: currentImageLines.join('\n'),
                        text: 'Error: Nested block detected',
                        prompt: 'Invalid nested block'
                    });
                }

                skipImageBlock = true;
                currentImageIndexProvided = imageStart[1] !== undefined;
                currentImageIndex = currentImageIndexProvided ? Number(imageStart[1]) : nextAvailableImageIndex();
                currentImageLines = [line];
                if (trimmedLine.endsWith(']]')) {
                    const blockText = currentImageLines.join('\n');
                    contents.push({
                        type: 'image', index: currentImageIndex, indexProvided: currentImageIndexProvided, raw: blockText,
                        ...(extractInfo(blockText, 'id') ? { blockId: extractInfo(blockText, 'id') } : {}),
                        text: extractInfo(blockText, 'title'), prompt: extractInfo(blockText, 'prompt')
                    });
                    skipImageBlock = false;
                }
                continue;
            }
            if (skipImageBlock) {
                currentImageLines.push(line);
                if (trimmedLine.includes(']]')) {
                    const blockText = currentImageLines.join('\n');
                    contents.push({
                        type: 'image', index: currentImageIndex, indexProvided: currentImageIndexProvided, raw: blockText,
                        ...(extractInfo(blockText, 'id') ? { blockId: extractInfo(blockText, 'id') } : {}),
                        text: extractInfo(blockText, 'title'), prompt: extractInfo(blockText, 'prompt')
                    });
                    skipImageBlock = false;
                }
                continue;
            }
            if (trimmedLine === '') { contents.push({ type: 'newline' }); continue; }
            if (/^-{3,}$/.test(trimmedLine)) {
                contents.push({ type: 'separator' });
                continue;
            }
            if (/^###\s+/.test(trimmedLine)) {
                contents.push(createTextContent('header-h3', trimmedLine.replace(/^###\s+/, '').trim()));
                continue;
            }
            if (/^##\s+/.test(trimmedLine)) {
                contents.push(createTextContent('header-h2', trimmedLine.replace(/^##\s+/, '').trim()));
                continue;
            }
            if (/^>\s*/.test(trimmedLine)) {
                contents.push(createTextContent('quote', trimmedLine.replace(/^>\s*/, '').trim()));
                continue;
            }
            if (/^[-*]\s+/.test(trimmedLine)) {
                contents.push(createTextContent(
                    'list-item',
                    trimmedLine.replace(/^[-*]\s+/, '').trim(),
                    { listType: 'unordered' }
                ));
                continue;
            }
            if (/^\d+[.)]\s+/.test(trimmedLine)) {
                contents.push(createTextContent(
                    'list-item',
                    trimmedLine.replace(/^\d+[.)]\s+/, '').trim(),
                    { listType: 'ordered' }
                ));
                continue;
            }
            contents.push(createTextContent('paragraph', line));
        }
        return { title, contents };
}

module.exports = { parseBlogManuscriptMarkdown };
