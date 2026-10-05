import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const graph = JSON.parse(await readFile(path.join(root, 'bundle/knowledge/graph.json'), 'utf8'));
const start = graph.entries.find((entry) => entry.source_path === 'Start Here.md');
const target = graph.entries.find((entry) => entry.source_path === 'garden-note.md');
assert.ok(start && target, 'fixture notes should be present in the converted collection');
assert.equal(graph.source_files.length, 4, 'all fixture files should appear in the explorer inventory');
assert.ok(graph.source_directories.includes('assets'), 'directories should be retained independently of their files');

const startHtml = await readFile(path.join(root, `dist/fixture/garden/${start.route_slug}/index.html`), 'utf8');
const targetHtml = await readFile(path.join(root, `dist/fixture/garden/${target.route_slug}/index.html`), 'utf8');
const graphHtml = await readFile(path.join(root, 'dist/fixture/garden/graph/index.html'), 'utf8');

assert.match(startHtml, new RegExp(`href="/garden/${target.route_slug}/#a-linked-section"`));
assert.match(startHtml, new RegExp(`href="/garden/${start.route_slug}/#my-heading"`));
assert.match(startHtml, new RegExp(`href="/garden/${start.route_slug}/#start-block"`));
assert.match(startHtml, new RegExp(`href="/garden/${target.route_slug}/#linked-block"`));
assert.match(startHtml, /id="my-heading"/);
assert.match(startHtml, /id="start-block"/);
assert.match(startHtml, /<code>\[\[garden-note\]\]<\/code>/);
assert.match(startHtml, /&gt; \[!danger\] Literal callout syntax/);
assert.match(startHtml, /\[\[garden-note#A linked section\]\]/);
assert.doesNotMatch(startHtml, /callout-danger/);
assert.doesNotMatch(startHtml, /id="not-an-anchor"/);
assert.match(targetHtml, /id="a-linked-section"/);
assert.match(targetHtml, /id="linked-block"/);
assert.match(startHtml, /href="\/knowledge-assets\/assets\/field-guide\.pdf"/);
assert.match(startHtml, /class="explorer-layout"/);
assert.match(startHtml, /class="tree-folder"[\s\S]*assets/);
assert.match(startHtml, /class="tree-file active"[^>]*href="\/garden\/[^"]+\/"/);
assert.match(startHtml, /target="_blank" rel="noreferrer"/);
assert.match(startHtml, /<sup class="footnote-ref" id="fnref-fixture-note"><a href="#fn-fixture-note">1<\/a><\/sup>/);
assert.match(startHtml, /<sup class="footnote-ref" id="fnref-fixture-note-2"><a href="#fn-fixture-note">1<\/a><\/sup>/);
assert.match(startHtml, /<li id="fn-fixture-note">[\s\S]*This footnote should render at the end[\s\S]*href="#fnref-fixture-note-2"/);
assert.match(startHtml, /<code>\[\^fixture-note\]<\/code>/);
assert.doesNotMatch(startHtml, /\[\^fixture-note\]:/);

assert.match(targetHtml, /<aside class="callout callout-important" data-callout="important">/);
assert.match(targetHtml, /<details class="callout callout-faq" data-callout="faq">/);
assert.doesNotMatch(targetHtml, /<details class="callout callout-faq" data-callout="faq" open>/);
assert.match(targetHtml, /<aside class="callout callout-question" data-callout="question">[\s\S]*<aside class="callout callout-tip" data-callout="tip">/);
assert.doesNotMatch(targetHtml, /\[!important\]|\[!faq\]|\[!question\]|\[!tip\]/);
assert.match(graphHtml, /class="graph-view"/);
assert.match(graphHtml, /<a href="\/garden\/[^"]+\/" class="graph-node"/);
assert.match(graphHtml, /<line x1=/);

console.log('PASS Obsidian Markdown transforms, directory explorer, and clickable knowledge graph');
