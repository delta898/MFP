'use strict';

const crypto = require('node:crypto');

const MARKDOWN_EXTENSION = /\.(?:md|markdown)$/iu;
const IMAGE_EXTENSION = /\.(?:avif|gif|jpe?g|png|svg|webp)$/iu;

function splitFrontmatter(source) {
    const text = String(source || '').replace(/^\uFEFF/u, '');
    const match = text.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/u);
    if (!match) return { body: text, fields: {} };
    return { body: text.slice(match[0].length), fields: parseFlatYaml(match[1]) };
}

function stripYamlComment(value) {
    let quote = '';
    for (let index = 0; index < value.length; index += 1) {
        const char = value[index];
        if (quote === '"' && char === '\\') { index += 1; continue; }
        if ((char === '"' || char === "'") && (!quote || quote === char)) { quote = quote ? '' : char; continue; }
        if (char === '#' && !quote && (index === 0 || /\s/u.test(value[index - 1]))) return value.slice(0, index).trimEnd();
    }
    return value.trimEnd();
}

function splitFlowValues(value) {
    const values = [];
    let quote = '';
    let start = 0;
    for (let index = 0; index < value.length; index += 1) {
        const char = value[index];
        if (quote === '"' && char === '\\') { index += 1; continue; }
        if ((char === '"' || char === "'") && (!quote || quote === char)) quote = quote ? '' : char;
        else if (char === ',' && !quote) { values.push(value.slice(start, index)); start = index + 1; }
    }
    values.push(value.slice(start));
    return values.map(parseYamlScalar);
}

function parseYamlScalar(raw) {
    const value = stripYamlComment(String(raw || '').trim());
    if (!value) return '';
    if (value.startsWith('[') && value.endsWith(']')) return splitFlowValues(value.slice(1, -1));
    if (value.startsWith('"') && value.endsWith('"')) {
        try { return JSON.parse(value); } catch (_error) { return value.slice(1, -1); }
    }
    if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replace(/''/g, "'");
    if (/^(?:null|~)$/iu.test(value)) return '';
    if (/^(?:true|false)$/iu.test(value)) return value.toLocaleLowerCase('en-US');
    return value;
}

function parseFlatYaml(yaml) {
    const lines = String(yaml || '').split(/\r?\n/u);
    const fields = {};
    for (let index = 0; index < lines.length; index += 1) {
        const match = lines[index].match(/^([^\s:#][^:]*):(?:[ \t]*(.*))?$/u);
        if (!match) continue;
        const key = match[1].trim().replace(/^(?:"([^"]+)"|'([^']+)')$/u, (_all, doubleQuoted, singleQuoted) => doubleQuoted || singleQuoted);
        const raw = stripYamlComment(match[2] || '').trim();
        if (raw === '|' || raw === '>') {
            const block = [];
            while (index + 1 < lines.length && /^(?:[ \t]+.*|[ \t]*)$/u.test(lines[index + 1]) && /^[ \t]+/u.test(lines[index + 1])) {
                block.push(lines[++index].trim());
            }
            fields[key] = block.join(raw === '>' ? ' ' : '\n');
        } else if (!raw) {
            const items = [];
            let next = index + 1;
            while (next < lines.length && /^[ \t]+-[ \t]+/u.test(lines[next])) items.push(parseYamlScalar(lines[next++].replace(/^[ \t]+-[ \t]+/u, '')));
            if (items.length) { fields[key] = items; index = next - 1; }
            else fields[key] = '';
        } else {
            fields[key] = parseYamlScalar(raw);
        }
    }
    return fields;
}

function scalarText(value) {
    if (Array.isArray(value)) return value.map(scalarText);
    if (value === null || value === undefined || typeof value === 'object') return null;
    return String(value);
}

function matchesFrontmatter(fields, filter) {
    if (!filter || typeof filter.field !== 'string' || typeof filter.value !== 'string'
        || !filter.field.trim() || !filter.value.trim()) return false;
    const actual = scalarText(fields[filter.field]);
    return Array.isArray(actual) ? actual.includes(filter.value) : actual === filter.value;
}

function normalizeRelative(value) {
    return String(value || '').replace(/\\/g, '/').replace(/^\.\//u, '').replace(/^\/+/, '');
}

function noteId(relativePath) {
    const basename = relativePath.split('/').at(-1).replace(MARKDOWN_EXTENSION, '');
    const slug = basename.normalize('NFKD').toLocaleLowerCase('en-US')
        .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/gu, '').slice(0, 48) || 'note';
    const hash = crypto.createHash('sha256').update(relativePath).digest('hex').slice(0, 12);
    return `${slug}-${hash}`;
}

function protectCode(markdown, transform) {
    const protectedParts = [];
    const protect = (part) => {
        const marker = `\uE000BG_CODE_${protectedParts.length}\uE001`;
        protectedParts.push(part);
        return marker;
    };
    let masked = markdown.replace(/^ {0,3}(`{3,}|~{3,})[^\r\n]*\r?\n[\s\S]*?^ {0,3}\1[ \t]*$/gmu, protect);
    masked = masked.replace(/(`+)(?!`)([^\r\n]*?)(?<!`)\1(?!`)/gu, protect);
    const output = masked.split(/(\uE000BG_CODE_\d+\uE001)/u).map((part) =>
        part.startsWith('\uE000BG_CODE_') ? part : transform(part)
    ).join('');
    return output.replace(/\uE000BG_CODE_(\d+)\uE001/gu, (_all, index) => protectedParts[Number(index)]);
}

function headingSlug(value) {
    return String(value || '').replace(/[`*_~]/gu, '').trim().toLocaleLowerCase()
        .replace(/\s+/gu, '-').replace(/[^\p{L}\p{N}_-]/gu, '').replace(/-+/gu, '-').replace(/^-|-$/gu, '');
}

function headingAnchor(markdown, fragment) {
    const requested = String(fragment || '').replace(/^#/u, '').trim();
    if (!requested) return '';
    if (requested.startsWith('^')) return requested.slice(1);
    const counts = new Map();
    for (const match of String(markdown || '').matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gmu)) {
        const slug = headingSlug(match[1]);
        if (!slug) continue;
        const count = counts.get(slug) || 0;
        counts.set(slug, count + 1);
        if (match[1].trim().toLocaleLowerCase() === requested.toLocaleLowerCase()) return count ? `${slug}-${count}` : slug;
    }
    return headingSlug(requested);
}

function escapeHtml(value) {
    return String(value || '').replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;');
}

function createKnowledgeCollectionBuilder(options = {}) {
    const fs = options.fs || require('node:fs');
    const path = options.path || require('node:path');

    function walk(root, directory = root, result = []) {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
            const absolute = path.join(directory, entry.name);
            if (entry.isSymbolicLink()) continue;
            if (entry.isDirectory()) walk(root, absolute, result);
            else if (entry.isFile()) {
                const relative = normalizeRelative(path.relative(root, absolute));
                result.push({ absolute, relative, size: fs.statSync(absolute).size });
            }
        }
        return result;
    }

    function build({ vaultRoot, siteRoot, publicationFilter } = {}) {
        const notesOutput = path.join(siteRoot, 'site-data', 'data', 'knowledge', 'notes');
        const assetsOutput = path.join(siteRoot, 'site-data', 'public', 'knowledge-assets');
        fs.rmSync(notesOutput, { recursive: true, force: true });
        fs.rmSync(assetsOutput, { recursive: true, force: true });
        fs.mkdirSync(notesOutput, { recursive: true, mode: 0o700 });
        fs.mkdirSync(assetsOutput, { recursive: true, mode: 0o700 });

        if (!vaultRoot) {
            return {
                source_markdown_count: 0, published_note_count: 0, excluded_note_count: 0,
                copied_resource_count: 0, unresolved_link_count: 0, missing_resource_count: 0,
                selection_configured: false
            };
        }
        const realRoot = fs.realpathSync(vaultRoot);
        if (!fs.statSync(realRoot).isDirectory()) throw new Error('선택한 Vault 경로가 폴더가 아닙니다.');
        const sourceFiles = walk(realRoot);
        const markdownFiles = sourceFiles.filter((file) => MARKDOWN_EXTENSION.test(file.relative));
        const parsed = markdownFiles.map((file) => {
            const source = fs.readFileSync(file.absolute, 'utf8');
            const split = splitFrontmatter(source);
            return { ...file, ...split, id: noteId(file.relative), title: scalarText(split.fields.title) || file.relative.split('/').at(-1).replace(MARKDOWN_EXTENSION, '') };
        });
        const publishAll = publicationFilter?.mode === 'all';
        const selectionConfigured = publishAll || Boolean(publicationFilter?.field && publicationFilter?.value);
        const included = parsed.filter((note) => publishAll || (selectionConfigured && matchesFrontmatter(note.fields, publicationFilter)));
        const byPath = new Map(parsed.map((note) => [note.relative.replace(MARKDOWN_EXTENSION, '').toLocaleLowerCase(), note]));
        const byName = new Map();
        const aliases = new Map();
        for (const note of parsed) {
            const basename = note.relative.split('/').at(-1).replace(MARKDOWN_EXTENSION, '').toLocaleLowerCase();
            if (!byName.has(basename)) byName.set(basename, note);
            else byName.set(basename, null);
            const values = scalarText(note.fields.aliases);
            for (const alias of Array.isArray(values) ? values : values ? [values] : []) {
                const key = alias.toLocaleLowerCase();
                if (!aliases.has(key)) aliases.set(key, note);
                else aliases.set(key, null);
            }
        }
        const includedIds = new Set(included.map((note) => note.id));
        const resourcePaths = new Set();
        let unresolvedLinks = 0;
        let missingResources = 0;
        const assetExists = (relative) => {
            const normalized = normalizeRelative(relative);
            if (!normalized || normalized === '..' || normalized.startsWith('../')) return false;
            const absolute = path.resolve(realRoot, normalized);
            const rel = path.relative(realRoot, absolute);
            return !rel.startsWith(`..${path.sep}`) && rel !== '..' && fs.existsSync(absolute)
                && fs.lstatSync(absolute).isFile() && !fs.lstatSync(absolute).isSymbolicLink();
        };
        const resolveNote = (from, raw) => {
            const target = String(raw || '').trim().replace(/\\/g, '/').replace(MARKDOWN_EXTENSION, '');
            if (!target) return from;
            const candidate = path.posix.normalize(path.posix.join(path.posix.dirname(from.relative), target));
            if (candidate === '..' || candidate.startsWith('../')) return null;
            return byPath.get(candidate.toLocaleLowerCase()) || byPath.get(normalizeRelative(target).replace(MARKDOWN_EXTENSION, '').toLocaleLowerCase())
                || (target.includes('/') ? null : byName.get(path.posix.basename(target).toLocaleLowerCase()) || aliases.get(target.toLocaleLowerCase()) || null);
        };
        const publicAssetUrl = (relative) => `/knowledge-assets/${normalizeRelative(relative).split('/').map(encodeURIComponent).join('/')}`;
        const noteUrl = (note, fragment = '') => `/notes/${encodeURIComponent(note.id)}/${fragment ? `#${encodeURIComponent(fragment)}` : ''}`;
        const rememberResource = (note, rawPath) => {
            const target = String(rawPath || '').trim().replace(/^<|>$/gu, '').replace(/\\/g, '/').split(/[?#]/u, 1)[0];
            if (!target || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/iu.test(target)) return '';
            const candidate = target.startsWith('/')
                ? normalizeRelative(target)
                : normalizeRelative(path.posix.normalize(path.posix.join(path.posix.dirname(note.relative), target)));
            if (!assetExists(candidate)) { missingResources += 1; return ''; }
            resourcePaths.add(candidate);
            return publicAssetUrl(candidate);
        };
        const transformedNotes = included.map((note) => {
            const outgoing = new Set();
            let body = protectCode(note.body, (plain) => {
                plain = plain.replace(/(?<!\\)(!?)\[\[([^\]]+)\]\]/gu, (_all, embed, inner) => {
                    const separator = inner.indexOf('|');
                    const rawTarget = (separator < 0 ? inner : inner.slice(0, separator)).trim();
                    const label = (separator < 0 ? '' : inner.slice(separator + 1)).trim();
                    const hashAt = rawTarget.indexOf('#');
                    const targetPath = hashAt < 0 ? rawTarget : rawTarget.slice(0, hashAt);
                    const fragment = hashAt < 0 ? '' : rawTarget.slice(hashAt + 1);
                    const targetIsResource = Boolean(path.posix.extname(targetPath) && !MARKDOWN_EXTENSION.test(targetPath));
                    if (targetIsResource) {
                        const url = rememberResource(note, targetPath);
                        if (!url) return escapeHtml(label || path.posix.basename(targetPath));
                        const alt = label || path.posix.basename(targetPath);
                        return embed && IMAGE_EXTENSION.test(targetPath)
                            ? `![${alt.replace(/\]/gu, '\\]')}](${url})`
                            : `[${alt.replace(/\]/gu, '\\]')}](${url})`;
                    }
                    const target = resolveNote(note, targetPath);
                    if (!target || !includedIds.has(target.id)) {
                        unresolvedLinks += 1;
                        return escapeHtml(label || fragment || path.posix.basename(targetPath) || note.title);
                    }
                    outgoing.add(target.id);
                    const anchor = fragment ? headingAnchor(target.body, fragment) : '';
                    const href = noteUrl(target, anchor);
                    const text = label || fragment.replace(/^\^/u, '') || target.title;
                    if (embed) return `<aside class="note-embed"><a href="${href}">${escapeHtml(text)}</a></aside>`;
                    return `[${text.replace(/\]/gu, '\\]')}](${href})`;
                });
                plain = plain.replace(/(^|\n)([^\n]*?)\s+\^([A-Za-z0-9_-]+)\s*$/gmu, (_all, start, text, blockId) => `${start}${text}<span id="${blockId}"></span>`);
                plain = plain.replace(/(!?)\[([^\]]*)\]\((<[^>]+>|[^)\s]+)(?:\s+["'][^"']*["'])?\)/gu, (whole, image, label, rawUrl) => {
                    const url = rawUrl.replace(/^<|>$/gu, '');
                    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\/)/iu.test(url)) return whole;
                    const hashIndex = url.indexOf('#');
                    const targetPath = hashIndex < 0 ? url : url.slice(0, hashIndex);
                    const fragment = hashIndex < 0 ? '' : url.slice(hashIndex + 1);
                    if (MARKDOWN_EXTENSION.test(targetPath)) {
                        const target = resolveNote(note, targetPath);
                        if (!target || !includedIds.has(target.id)) { unresolvedLinks += 1; return escapeHtml(label || targetPath); }
                        outgoing.add(target.id);
                        return `[${label}](${noteUrl(target, fragment ? headingAnchor(target.body, fragment) : '')})`;
                    }
                    const assetUrl = rememberResource(note, targetPath);
                    if (!assetUrl) return escapeHtml(label || targetPath);
                    return `${image}[${label}](${assetUrl}${fragment ? `#${fragment}` : ''})`;
                });
                return plain;
            });
            return { note, body, links: [...outgoing] };
        });

        for (const { note, body, links } of transformedNotes) {
            const title = JSON.stringify(note.title).replace(/\u2028|\u2029/gu, ' ');
            const sourcePath = JSON.stringify(note.relative).replace(/\u2028|\u2029/gu, ' ');
            const routeLinks = JSON.stringify(links);
            const output = `---\ntitle: ${title}\nsource_path: ${sourcePath}\nlinks: ${routeLinks}\n---\n\n${body}`;
            fs.writeFileSync(path.join(notesOutput, `${note.id}.md`), output, { encoding: 'utf8', mode: 0o600 });
        }
        let copiedBytes = 0;
        for (const relative of resourcePaths) {
            const destination = path.join(assetsOutput, ...relative.split('/'));
            fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
            fs.copyFileSync(path.resolve(realRoot, relative), destination, fs.constants?.COPYFILE_EXCL || 0);
            copiedBytes += fs.statSync(path.resolve(realRoot, relative)).size;
        }
        const summary = {
            source_markdown_count: markdownFiles.length,
            published_note_count: included.length,
            excluded_note_count: markdownFiles.length - included.length,
            copied_resource_count: resourcePaths.size,
            copied_resource_bytes: copiedBytes,
            unresolved_link_count: unresolvedLinks,
            missing_resource_count: missingResources,
            selection_configured: selectionConfigured
        };
        return summary;
    }

    return { build };
}

module.exports = { createKnowledgeCollectionBuilder, matchesFrontmatter, parseFlatYaml, splitFrontmatter };
