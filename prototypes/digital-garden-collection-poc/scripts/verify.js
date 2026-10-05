import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checks = [
  ['subpath homepage', 'dist/subpath/index.html'],
  ['subpath collection index', 'dist/subpath/garden/index.html'],
  ['subpath note detail', 'dist/subpath/garden/start-here/index.html'],
  ['subpath linked note detail', 'dist/subpath/garden/garden-note/index.html'],
  ['subpath blog index', 'dist/subpath/blog/index.html'],
  ['subpath blog detail', 'dist/subpath/blog/first-post/index.html'],
  ['root collection index', 'dist/root/index.html'],
  ['root note detail', 'dist/root/start-here/index.html'],
  ['root linked note detail', 'dist/root/garden-note/index.html'],
  ['image asset', 'dist/subpath/knowledge-assets/mark.svg'],
  ['PDF asset', 'dist/subpath/knowledge-assets/field-guide.pdf'],
];

for (const [label, relative] of checks) await access(path.join(root, relative)).then(() => console.log(`PASS ${label}`));
await assert.rejects(access(path.join(root, 'dist/root/blog/index.html')));
await assert.rejects(access(path.join(root, 'dist/root/garden/index.html')));
console.log('PASS standalone root mount has no extra Blog or Garden routes');

const startHere = await readFile(path.join(root, 'dist/subpath/garden/start-here/index.html'), 'utf8');
assert.match(startHere, /href="\/garden\/garden-note\/"/);
assert.match(startHere, /src="\/knowledge-assets\/mark\.svg"/);
assert.match(startHere, /href="\/knowledge-assets\/field-guide\.pdf"/);

const gardenNote = await readFile(path.join(root, 'dist/subpath/garden/garden-note/index.html'), 'utf8');
assert.match(gardenNote, /Backlinks/);
assert.match(gardenNote, /href="\/garden\/start-here\/"/);

const rootStartHere = await readFile(path.join(root, 'dist/root/start-here/index.html'), 'utf8');
assert.match(rootStartHere, /href="\/garden-note\/"/);
assert.match(rootStartHere, /Backlinks/);

console.log('PASS link targets, backlinks, resource URLs, root mount, and subpath mount');
