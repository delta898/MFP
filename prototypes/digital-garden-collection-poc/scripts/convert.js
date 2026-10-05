import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createHeadingResolver } from '../src/lib/obsidian-markdown.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const vaultDir = path.resolve(process.env.GARDEN_VAULT_ROOT || path.join(root, 'fixtures/vault'));
const bundleDir = path.resolve(process.env.GARDEN_BUNDLE_DIR || path.join(root, 'bundle'));

function slugify(value) {
  return value.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'note';
}

function idFor(relativePath) {
  const normalized = relativePath.split(path.sep).join('/');
  const base = slugify(normalized.replace(/\.md$/i, '').split('/').at(-1));
  const hash = createHash('sha256').update(normalized).digest('hex').slice(0, 12);
  return `${base}-${hash}`;
}

function parseTitleAndBody(markdown, fallback) {
  const match = markdown.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/);
  const title = match?.[1].match(/^title:\s*(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, '')
    || markdown.match(/^#\s+(.+)$/m)?.[1]?.trim()
    || fallback;
  return { title, body: match ? markdown.slice(match[0].length) : markdown };
}

async function walk(directory, relative = '') {
  const result = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const rel = path.join(relative, item.name);
    const absolute = path.join(directory, item.name);
    if (item.isDirectory()) result.push(...await walk(absolute, rel));
    else if (item.isFile()) result.push({ absolute, relative: rel, size: (await stat(absolute)).size });
  }
  return result;
}

function normalizeNoteTarget(value) {
  return value.trim().replace(/\\/g, '/').replace(/\.md$/i, '').replace(/^\.\//, '').toLocaleLowerCase();
}

function splitWikilinkTarget(value) {
  const hashIndex = value.indexOf('#');
  return hashIndex < 0
    ? { noteTarget: value.trim(), fragment: '' }
    : { noteTarget: value.slice(0, hashIndex).trim(), fragment: value.slice(hashIndex + 1).trim() };
}

function escapeHtml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function transformOutsideCode(markdown, transform) {
  const protectedBlocks = [];
  const protect = (value) => {
    const marker = `\uE000OBSIDIAN_CODE_${protectedBlocks.length}\uE001`;
    protectedBlocks.push(value);
    return marker;
  };
  let masked = markdown.replace(/^ {0,3}(`{3,}|~{3,})[^\r\n]*\r?\n[\s\S]*?^ {0,3}\1[ \t]*$/gm, protect);
  masked = masked.replace(/(`+)(?!`)([^\r\n]*?)(?<!`)\1(?!`)/g, protect);
  const transformed = masked.split(/(\uE000OBSIDIAN_CODE_\d+\uE001)/g).map((part) =>
    part.startsWith('\uE000OBSIDIAN_CODE_') ? part : transform(part),
  ).join('');
  return transformed.replace(/\uE000OBSIDIAN_CODE_(\d+)\uE001/g, (_match, index) => protectedBlocks[Number(index)]);
}

await rm(bundleDir, { recursive: true, force: true });
const notesDir = path.join(bundleDir, 'knowledge/notes');
const assetsDir = path.join(bundleDir, 'public/knowledge-assets');
const blogDir = path.join(bundleDir, 'blog');
await Promise.all([mkdir(notesDir, { recursive: true }), mkdir(assetsDir, { recursive: true }), mkdir(blogDir, { recursive: true })]);

const sourceFiles = await walk(vaultDir);
const markdownFiles = sourceFiles.filter((file) => path.extname(file.relative).toLowerCase() === '.md');
const idByPath = new Map();
const idByName = new Map();
const sourceById = new Map();
const headingResolverById = new Map();
for (const file of markdownFiles) {
  const relative = file.relative.split(path.sep).join('/');
  const id = idFor(relative);
  sourceById.set(id, await readFile(file.absolute, 'utf8'));
  const sourceBody = parseTitleAndBody(sourceById.get(id), path.basename(relative, path.extname(relative))).body;
  headingResolverById.set(id, createHeadingResolver(sourceBody));
  idByPath.set(normalizeNoteTarget(relative), id);
  const nameKey = normalizeNoteTarget(path.basename(relative));
  if (!idByName.has(nameKey)) idByName.set(nameKey, id);
  else idByName.set(nameKey, null);
}

const records = [];
for (const file of markdownFiles) {
  const relative = file.relative.split(path.sep).join('/');
  const id = idByPath.get(normalizeNoteTarget(relative));
  const source = sourceById.get(id);
  const { title, body } = parseTitleAndBody(source, path.basename(relative, path.extname(relative)));
  const links = [];
  const noteDir = path.posix.dirname(relative);
  const normalizedBody = transformOutsideCode(body, (markdown) => markdown.replace(/(?<!\\)(!?)\[\[([^\]]+)\]\]/g, (_all, embed, inner) => {
    const separator = inner.indexOf('|');
    const rawTarget = (separator < 0 ? inner : inner.slice(0, separator)).trim();
    const rawLabel = separator < 0 ? '' : inner.slice(separator + 1).trim();
    const parsedTarget = rawTarget.startsWith('^') ? { noteTarget: '', fragment: rawTarget } : splitWikilinkTarget(rawTarget);
    const { noteTarget, fragment } = parsedTarget;
    if (embed) {
      const candidate = path.posix.normalize(path.posix.join(noteDir, noteTarget));
      const encoded = candidate.split('/').map(encodeURIComponent).join('/');
      const alt = (rawLabel || path.posix.basename(noteTarget)).trim();
      return `![${alt}](/knowledge-assets/${encoded})`;
    }
    const isCurrentNote = !noteTarget;
    const relativeCandidate = normalizeNoteTarget(path.posix.normalize(path.posix.join(noteDir, noteTarget)));
    const directCandidate = normalizeNoteTarget(noteTarget);
    const targetId = isCurrentNote
      ? id
      : idByPath.get(relativeCandidate) || idByPath.get(directCandidate) || idByName.get(normalizeNoteTarget(path.posix.basename(noteTarget)));
    if (!targetId) return escapeHtml(rawLabel || noteTarget || fragment);
    links.push(targetId);
    const anchor = fragment ? headingResolverById.get(targetId)(fragment) : '';
    const href = `knowledge-note:${targetId}${anchor ? `#${encodeURIComponent(anchor)}` : ''}`;
    const label = rawLabel || (fragment.startsWith('^') ? fragment.slice(1) : fragment) || path.posix.basename(noteTarget) || title;
    return `<a href="${href}">${escapeHtml(label)}</a>`;
  }).replace(/([.!?\w\u3131-\uD79D][^\n]*?)[ \t]+\^([A-Za-z0-9_-]+)[ \t]*$/gm, (_all, text, blockId) => `${text}<span id="${blockId}"></span>`)
    .replace(/(^|\n)\^([A-Za-z0-9_-]+)[ \t]*$/gm, (_all, prefix, blockId) => `${prefix}<span id="${blockId}"></span>`)
    .replace(/(\]\()((?:\.\.?\/)?[^):#?]+)(#[^)]*)?(\))/g, (_all, before, target, fragment = '', after) => {
    const absoluteAsset = path.posix.normalize(path.posix.join(noteDir, target));
    const publicPath = `/knowledge-assets/${absoluteAsset.split('/').map(encodeURIComponent).join('/')}`;
    return `${before}${publicPath}${fragment}${after}`;
  }));
  const record = { id, title, route_slug: id, links: [...new Set(links)], source_path: relative };
  records.push(record);
  const output = `---\ntitle: ${JSON.stringify(title)}\nid: ${JSON.stringify(id)}\nroute_slug: ${JSON.stringify(id)}\nlinks: ${JSON.stringify(record.links)}\n---\n\n${normalizedBody}`;
  await writeFile(path.join(notesDir, `${id}.md`), output);
}

let copiedBytes = 0;
for (const file of sourceFiles.filter((item) => path.extname(item.relative).toLowerCase() !== '.md')) {
  const destination = path.join(assetsDir, file.relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(file.absolute, destination);
  copiedBytes += file.size;
}

const fileInventory = sourceFiles.map((file) => {
  const relative = file.relative.split(path.sep).join('/');
  const isMarkdown = path.extname(relative).toLowerCase() === '.md';
  return {
    path: relative,
    kind: isMarkdown ? 'note' : 'resource',
    ...(isMarkdown ? { entry_id: idByPath.get(normalizeNoteTarget(relative)) } : {}),
  };
});
const directoryInventory = (await walkDirectories(vaultDir)).map((directory) => path.relative(vaultDir, directory).split(path.sep).join('/'));
const graph = {
  collection_id: 'knowledge',
  source_root: vaultDir,
  entries: records,
  source_directories: directoryInventory,
  source_files: fileInventory,
};
await writeFile(path.join(bundleDir, 'knowledge/graph.json'), `${JSON.stringify(graph, null, 2)}\n`);
for (const file of await walk(path.join(root, 'fixtures/blog'))) {
  await mkdir(path.dirname(path.join(blogDir, file.relative)), { recursive: true });
  await copyFile(file.absolute, path.join(blogDir, file.relative));
}
const extensionCounts = {};
for (const file of sourceFiles) {
  const extension = path.extname(file.relative).toLowerCase() || '[no extension]';
  extensionCounts[extension] ||= { count: 0, bytes: 0 };
  extensionCounts[extension].count += 1;
  extensionCounts[extension].bytes += file.size;
}
const summary = {
  sourceRoot: vaultDir,
  directories: (await walkDirectories(vaultDir)).length,
  files: sourceFiles.length,
  totalBytes: sourceFiles.reduce((sum, file) => sum + file.size, 0),
  copiedNonMarkdownBytes: copiedBytes,
  markdownNotes: records.length,
  resolvedWikilinks: records.reduce((sum, record) => sum + record.links.length, 0),
  extensions: extensionCounts,
};
await writeFile(path.join(bundleDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));

async function walkDirectories(directory) {
  const dirs = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    if (item.isDirectory()) {
      const child = path.join(directory, item.name);
      dirs.push(child, ...await walkDirectories(child));
    }
  }
  return dirs;
}
