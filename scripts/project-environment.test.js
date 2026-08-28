'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    DEFAULT_DEVELOPMENT_ENV_FILE,
    parseEnvironmentFile,
    loadProjectEnvironment,
    loadDevelopmentEnvironment
} = require('./project-environment');

test('project environment parser reads assignments without evaluating shell syntax', () => {
    const parsed = parseEnvironmentFile([
        '# comment',
        'BLOGGENIUS_ENV=development',
        'VALUE="literal ;; $(not-executed)"'
    ].join('\n'));

    assert.deepEqual(parsed, {
        BLOGGENIUS_ENV: 'development',
        VALUE: 'literal ;; $(not-executed)'
    });
});

test('project environment loader reads only the development-specific file by default', () => {
    const requestedPaths = [];
    const fs = {
        existsSync(filePath) {
            requestedPaths.push(filePath);
            return true;
        },
        readFileSync() {
            return 'BLOGGENIUS_DEVELOPMENT_SUPABASE_URL=https://development.example.invalid';
        }
    };

    const loaded = loadProjectEnvironment({
        repoRoot: '/repo',
        fs,
        env: { EXISTING_VALUE: 'kept' }
    });

    assert.equal(requestedPaths[0], `/repo/${DEFAULT_DEVELOPMENT_ENV_FILE}`);
    assert.equal(
        loaded.BLOGGENIUS_DEVELOPMENT_SUPABASE_URL,
        'https://development.example.invalid'
    );
    assert.equal(loaded.EXISTING_VALUE, 'kept');
});

test('development loader selects development regardless of ambient environment', () => {
    const loaded = loadDevelopmentEnvironment({
        repoRoot: '/repo',
        fs: { existsSync: () => false },
        env: { BLOGGENIUS_ENV: 'local' }
    });

    assert.equal(loaded.BLOGGENIUS_ENV, 'development');
});
