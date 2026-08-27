'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseEnvironmentFile } = require('./project-environment');

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
