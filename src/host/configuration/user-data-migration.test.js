'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { migrateLegacyUserData } = require('./user-data-migration');

test('legacy user data moves into the unified root and preserves destination conflicts in an archive', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bloggenius-user-data-migration-'));
    const appRoot = path.join(root, 'portable');
    const userDataRoot = path.join(root, 'user-data');
    fs.mkdirSync(path.join(appRoot, 'config'), { recursive: true });
    fs.mkdirSync(path.join(appRoot, 'workspace'), { recursive: true });
    fs.mkdirSync(path.join(userDataRoot, 'config'), { recursive: true });
    fs.writeFileSync(path.join(appRoot, 'config', 'config.json'), '{"source":true}\n');
    fs.writeFileSync(path.join(userDataRoot, 'config', 'config.json'), '{"destination":true}\n');
    fs.writeFileSync(path.join(appRoot, 'workspace', 'draft.md'), 'legacy draft');

    const result = migrateLegacyUserData({ appRoot, userDataRoot, logger: { info() {}, warn() {} } });

    assert.equal(result.moved, 2);
    assert.equal(result.archived, 1);
    assert.equal(result.skipped, 0);
    assert.equal(fs.readFileSync(path.join(userDataRoot, 'config', 'config.json'), 'utf8'), '{"source":true}\n');
    assert.equal(fs.readFileSync(path.join(userDataRoot, 'workspace', 'draft.md'), 'utf8'), 'legacy draft');
    assert.equal(fs.readFileSync(path.join(result.archiveRoot, 'config', 'config.json'), 'utf8'), '{"destination":true}\n');
    assert.equal(fs.existsSync(path.join(appRoot, 'config')), false);
    assert.equal(fs.existsSync(path.join(appRoot, 'workspace')), false);
});

test('a second migration pass is a no-op after legacy directories have moved', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bloggenius-user-data-migration-repeat-'));
    const appRoot = path.join(root, 'portable');
    const userDataRoot = path.join(root, 'user-data');
    fs.mkdirSync(path.join(appRoot, 'data'), { recursive: true });
    fs.writeFileSync(path.join(appRoot, 'data', 'cache.json'), '{}');

    const first = migrateLegacyUserData({ appRoot, userDataRoot, logger: { info() {}, warn() {} } });
    const second = migrateLegacyUserData({ appRoot, userDataRoot, logger: { info() {}, warn() {} } });

    assert.equal(first.moved, 1);
    assert.equal(second.moved, 0);
    assert.equal(second.archived, 0);
    assert.equal(second.skipped, 0);
    assert.equal(fs.readFileSync(path.join(userDataRoot, 'data', 'cache.json'), 'utf8'), '{}');
});
