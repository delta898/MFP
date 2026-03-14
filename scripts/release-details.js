#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const version = String(process.argv[2] || process.env.VERSION || '').trim().replace(/^v/, '');
const changelogPath = path.join(process.cwd(), 'CHANGELOG.md');

const fallback = {
    summary: version ? `BlogGenius v${version} 업데이트` : 'BlogGenius 업데이트',
    highlights: []
};

function escapeText(text) {
    return String(text || '')
        .replace(/\*\*/g, '')
        .replace(/`/g, '')
        .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
}

function extractSection(content, candidates) {
    const lines = String(content || '').split('\n');
    for (const candidate of candidates) {
        const headings = [`## [${candidate}]`, `## [v${candidate}]`];
        let start = -1;
        for (let index = 0; index < lines.length; index += 1) {
            const line = lines[index].trim();
            if (headings.some((heading) => line.startsWith(heading))) {
                start = index + 1;
                break;
            }
        }
        if (start === -1) continue;

        const collected = [];
        for (let index = start; index < lines.length; index += 1) {
            const line = lines[index];
            if (line.startsWith('## [')) break;
            collected.push(line);
        }
        return collected.join('\n');
    }
    return '';
}

function buildDetails(sectionText) {
    const lines = String(sectionText || '').split('\n');
    const highlights = [];
    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith('- ')) continue;
        const cleaned = escapeText(line.slice(2));
        if (!cleaned) continue;
        highlights.push(cleaned);
        if (highlights.length >= 5) break;
    }

    return {
        summary: highlights[0] || fallback.summary,
        highlights
    };
}

function main() {
    try {
        const changelog = fs.readFileSync(changelogPath, 'utf8');
        const section = extractSection(changelog, [version, 'Unreleased']);
        const details = buildDetails(section);
        process.stdout.write(JSON.stringify(details));
    } catch (_error) {
        process.stdout.write(JSON.stringify(fallback));
    }
}

main();
