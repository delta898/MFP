const test = require('node:test');
const assert = require('node:assert/strict');
const { createStoredZip, validateEntryName } = require('./zip-bundle');

test('creates a standards-shaped stored ZIP with ordered UTF-8 entries', () => {
    const archive = createStoredZip([
        { name: '01.png', data: Buffer.from('first') },
        { name: 'card-news.json', data: Buffer.from('{"title":"제주"}') }
    ], { date: new Date('2026-09-05T00:00:00.000Z') });
    assert.equal(archive.readUInt32LE(0), 0x04034b50);
    assert.equal(archive.readUInt32LE(archive.length - 22), 0x06054b50);
    assert.equal(archive.readUInt16LE(archive.length - 14), 2);
    assert.match(archive.toString('utf8'), /01\.png/);
    assert.match(archive.toString('utf8'), /card-news\.json/);
    assert.match(archive.toString('utf8'), /제주/);
});

test('rejects empty and traversing ZIP entry names', () => {
    assert.throws(() => validateEntryName('../secret.png'), /올바르지/);
    assert.throws(() => validateEntryName(''), /올바르지/);
    assert.equal(validateEntryName('images/01.png'), 'images/01.png');
});
