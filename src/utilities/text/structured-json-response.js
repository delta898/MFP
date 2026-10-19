'use strict';

function stripCodeFence(rawText) {
    return String(rawText || '')
        .replace(/^\s*```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim();
}

function extractBalancedJsonCandidate(rawText) {
    const text = stripCodeFence(rawText);
    if (!text) return '';

    for (let start = 0; start < text.length; start += 1) {
        const opening = text[start];
        if (opening !== '{' && opening !== '[') continue;
        const closing = opening === '{' ? '}' : ']';
        let depth = 0;
        let inString = false;
        let escaped = false;

        for (let index = start; index < text.length; index += 1) {
            const character = text[index];
            if (inString) {
                if (escaped) escaped = false;
                else if (character === '\\') escaped = true;
                else if (character === '"') inString = false;
                continue;
            }
            if (character === '"') inString = true;
            else if (character === opening) depth += 1;
            else if (character === closing) {
                depth -= 1;
                if (depth === 0) return text.slice(start, index + 1).trim();
            }
        }
    }
    return text;
}

function parseStructuredJsonResponse(rawText) {
    const direct = stripCodeFence(rawText);
    if (!direct) throw new Error('AI 응답이 비어 있습니다.');
    try {
        return JSON.parse(direct);
    } catch (_error) {
        const extracted = extractBalancedJsonCandidate(direct);
        if (!extracted) throw new Error('AI 응답에서 JSON 블록을 찾지 못했습니다.');
        return JSON.parse(extracted);
    }
}

module.exports = { parseStructuredJsonResponse };
