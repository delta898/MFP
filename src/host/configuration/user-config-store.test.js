'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadUserConfig, mergeStructuredDefaults } = require('./user-config-store');

test('structured defaults fill missing nested values without replacing user values or arrays', () => {
    assert.deepEqual(
        mergeStructuredDefaults({ nested: { selected: true }, list: ['user'] }, {
            nested: { selected: false, added: 'default' },
            list: ['default'],
            untouched: 1
        }),
        {
            nested: { selected: true, added: 'default' },
            list: ['user'],
            untouched: 1
        }
    );
});

test('user config is created from the first available sample and reports the loaded source', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bloggenius-config-store-'));
    const configPath = path.join(root, 'config', 'config.json');
    const samplePath = path.join(root, 'bundle', 'config.json.sample');
    fs.mkdirSync(path.dirname(samplePath), { recursive: true });
    fs.writeFileSync(samplePath, JSON.stringify({ general: { name: 'sample' } }));
    const logs = { info() {}, warn() {}, error() {} };

    try {
        const loaded = loadUserConfig({
            configPath,
            defaultConfig: { general: { name: 'default', listen_port: 4577 } },
            samplePairs: [{ config: configPath, samples: [samplePath] }],
            logger: logs
        });

        assert.deepEqual(loaded.general, { name: 'sample', listen_port: 4577 });
        assert.equal(loaded.__CONFIG_SOURCE_PATH, configPath);
        assert.equal(loaded.__CONFIG_SOURCE_TYPE, 'json');
        assert.equal(loaded.__CONFIG_READY, true);
        assert.deepEqual(JSON.parse(fs.readFileSync(configPath, 'utf8')), { general: { name: 'sample' } });
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
