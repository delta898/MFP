'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    ENVIRONMENT_SCHEMA_VERSION,
    ENVIRONMENT_NAMES
} = require('../src/environment/contract');

const REPO_ROOT = path.resolve(__dirname, '..');

function readJson(relativePath) {
    return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8'));
}

function collectFiles(relativeDirectory, predicate) {
    const root = path.join(REPO_ROOT, relativeDirectory);
    const results = [];

    function visit(directory) {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const target = path.join(directory, entry.name);
            if (entry.isDirectory()) visit(target);
            if (entry.isFile() && predicate(target)) {
                results.push(path.relative(REPO_ROOT, target).split(path.sep).join('/'));
            }
        }
    }

    visit(root);
    return results.sort();
}

test('environment manifest has all canonical profiles and contains no secret values', () => {
    const manifest = readJson('supabase/environment-manifest.json');
    assert.equal(manifest.schema_version, ENVIRONMENT_SCHEMA_VERSION);
    assert.equal(manifest.environment_variable, 'BLOGGENIUS_ENV');
    assert.deepEqual(Object.keys(manifest.profiles).sort(), [...ENVIRONMENT_NAMES].sort());

    for (const environment of ENVIRONMENT_NAMES) {
        const profile = manifest.profiles[environment];
        assert.equal(typeof profile.supabase_url_source, 'string');
        assert.equal(typeof profile.supabase_publishable_key_source, 'string');
        assert.equal('supabase_url' in profile, false);
        assert.equal('supabase_publishable_key' in profile, false);
        assert.equal('service_role_key' in profile, false);
        assert.equal('secret_key' in profile, false);
    }

    assert.equal(manifest.profiles.local.allows_destructive_database_operations, true);
    assert.equal(manifest.profiles.development.allows_live_publish, false);
    assert.equal(manifest.profiles.production.allows_destructive_database_operations, false);
});

test('Supabase SQL inventory covers every committed SQL asset exactly once', () => {
    const inventory = readJson('supabase/inventory.json');
    const actual = [
        ...collectFiles('sql', (file) => file.endsWith('.sql')),
        ...collectFiles('apps/trends/trends-api/sql', (file) => file.endsWith('.sql'))
    ].sort();
    const inventoried = inventory.database_assets.map((asset) => asset.path).sort();

    assert.deepEqual(inventoried, actual);
    assert.equal(new Set(inventoried).size, inventoried.length);
    assert.ok(inventory.database_assets.every((asset) => asset.classification));
});

test('Edge Function inventory covers every function entrypoint and shared module', () => {
    const inventory = readJson('supabase/inventory.json');
    const functionFiles = collectFiles(
        'supabase/functions',
        (file) => file.endsWith('.ts')
    );
    const inventoried = [
        ...inventory.edge_functions,
        ...inventory.shared_edge_modules
    ].sort();

    assert.deepEqual(inventoried, functionFiles);
    assert.equal(new Set(inventoried).size, inventoried.length);
});

test('Supabase JavaScript client inventory covers every non-test client owner', () => {
    const inventory = readJson('supabase/inventory.json');
    const clientOwners = [
        ...collectFiles('src', (file) => file.endsWith('.js') && !file.endsWith('.test.js')),
        ...collectFiles('apps', (file) => file.endsWith('.js') && !file.endsWith('.test.js'))
    ].filter((relativePath) => {
        const source = fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
        return source.includes("require('@supabase/supabase-js')")
            || source.includes('require("@supabase/supabase-js")');
    }).sort();
    const inventoried = [
        ...inventory.desktop_consumers,
        ...inventory.operator_service_consumers
    ].sort();

    assert.deepEqual(inventoried, clientOwners);
});

test('inventory never stores linked project metadata or credential values', () => {
    const inventory = readJson('supabase/inventory.json');
    const serialized = JSON.stringify(inventory);

    assert.equal(serialized.includes('supabase.co'), false);
    assert.equal(serialized.includes('service_role_key'), false);
    assert.equal(serialized.includes('publishable_key_value'), false);
    assert.equal(inventory.linked_project_classification, 'production');
});
