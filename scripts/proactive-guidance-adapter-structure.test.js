const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

test('generic Agent suggestion results no longer materialize SuggestionNode', () => {
    const source = fs.readFileSync(path.join(ROOT, 'src/memory/event-store.js'), 'utf8');
    assert.doesNotMatch(source, /action\.domain[^\n]+agent\.suggestions[\s\S]{0,1200}_upsertSuggestionNode/);
    assert.match(source, /agent\.confirmation\.requested[\s\S]{0,900}_upsertSuggestionNode/);
});

test('legacy suggestions provider remains a thin compatibility facade', () => {
    const source = fs.readFileSync(path.join(ROOT, 'src/suggestions/providers/memory-based.js'), 'utf8');
    assert.equal(source.trim().split(/\r?\n/).length <= 3, true);
    assert.doesNotMatch(source, /Date\.now|dedupe_key|policy_id/);
});

test('Telegram keeps historic feedback callbacks beside canonical callbacks', () => {
    const source = fs.readFileSync(path.join(ROOT, 'src/telegram-bot.service.js'), 'utf8');
    assert.match(source, /verb === 'rec_fb'/);
    assert.match(source, /verb === 'suggest_feedback'/);
});
