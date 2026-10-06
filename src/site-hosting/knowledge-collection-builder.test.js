'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createKnowledgeCollectionBuilder, matchesFrontmatter, parseFlatYaml } = require('./knowledge-collection-builder');

test('frontmatter matching compares plain, quoted, boolean and list scalar values', () => {
    const fields = parseFlatYaml('publication: public\nis_public: true\ntags:\n  - obsidian\n  - garden\nquoted: "two words"');
    assert.equal(matchesFrontmatter(fields, { field: 'publication', value: 'public' }), true);
    assert.equal(matchesFrontmatter(fields, { field: 'is_public', value: 'true' }), true);
    assert.equal(matchesFrontmatter(fields, { field: 'tags', value: 'garden' }), true);
    assert.equal(matchesFrontmatter(fields, { field: 'quoted', value: 'two words' }), true);
});

test('builder filters notes, rewrites Obsidian links, copies only referenced resources, and reports results', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'knowledge-collection-build-'));
    const vault = path.join(root, 'vault');
    const site = path.join(root, 'site');
    const write = (relative, value) => {
        const target = path.join(vault, relative);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, value);
    };
    try {
        write('Start Here.md', [
            '---', 'title: Start Here', 'publication: public', 'ignored_private_field: do-not-export', '---',
            '', 'Read [[folder/Target#Second heading|the target]].',
            '', '![[assets/mark.svg|A green mark]]',
            '', '[[assets/guide.pdf|Read the PDF]]',
            '', '[Download](assets/guide.pdf)',
            '', '[[Private note]]'
        ].join('\n'));
        write('folder/Target.md', '---\npublication: public\n---\n\n## Second heading\nTarget text.\n');
        write('Private note.md', '---\npublication: private\n---\n\nSecret text.\n');
        write('assets/mark.svg', '<svg />');
        write('assets/guide.pdf', '%PDF-test');
        write('unused.txt', 'not referenced');

        const summary = createKnowledgeCollectionBuilder().build({
            vaultRoot: vault,
            siteRoot: site,
            publicationFilter: { field: 'publication', value: 'public' }
        });
        assert.deepEqual(summary, {
            source_markdown_count: 3,
            published_note_count: 2,
            excluded_note_count: 1,
            copied_resource_count: 2,
            copied_resource_bytes: Buffer.byteLength('<svg />') + Buffer.byteLength('%PDF-test'),
            unresolved_link_count: 1,
            missing_resource_count: 0,
            selection_configured: true
        });

        const notesDir = path.join(site, 'site-data/data/knowledge/notes');
        const output = fs.readdirSync(notesDir).map((file) => fs.readFileSync(path.join(notesDir, file), 'utf8'));
        const start = output.find((text) => text.includes('title: "Start Here"'));
        const target = output.find((text) => text.includes('Second heading'));
        assert.ok(start);
        assert.ok(target);
        assert.doesNotMatch(output.join('\n'), /Secret text|do-not-export/);
        assert.match(start, /\]\(\/notes\/target-[a-f0-9]{12}\/\#second-heading\)/);
        assert.match(start, /!\[A green mark\]\(\/knowledge-assets\/assets\/mark\.svg\)/);
        assert.match(start, /\[Read the PDF\]\(\/knowledge-assets\/assets\/guide\.pdf\)/);
        assert.match(start, /\[Download\]\(\/knowledge-assets\/assets\/guide\.pdf\)/);
        assert.equal(fs.existsSync(path.join(site, 'site-data/public/knowledge-assets/assets/unused.txt')), false);

        const noFilter = createKnowledgeCollectionBuilder().build({ vaultRoot: vault, siteRoot: site });
        assert.equal(noFilter.published_note_count, 0);
        assert.equal(noFilter.excluded_note_count, 3);
        assert.equal(noFilter.selection_configured, false);
        assert.deepEqual(fs.readdirSync(notesDir), []);
        assert.deepEqual(fs.readdirSync(path.join(site, 'site-data/public/knowledge-assets')), []);

        const allNotes = createKnowledgeCollectionBuilder().build({
            vaultRoot: vault, siteRoot: site, publicationFilter: { mode: 'all' }
        });
        assert.equal(allNotes.source_markdown_count, 3);
        assert.equal(allNotes.published_note_count, 3);
        assert.equal(allNotes.excluded_note_count, 0);
        assert.equal(allNotes.selection_configured, true);
        const allOutput = fs.readdirSync(notesDir)
            .map((file) => fs.readFileSync(path.join(notesDir, file), 'utf8')).join('\n');
        assert.match(allOutput, /Secret text/);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
