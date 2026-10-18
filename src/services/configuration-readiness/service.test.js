'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSetupReadiness } = require('./service');

test('configuration readiness requires spreadsheet authorization for configured spreadsheet', () => {
    const readiness = buildSetupReadiness({
        CONFIG: {
            GOOGLE_SHEET_URL: 'https://docs.google.com/spreadsheets/d/sheet-1/edit',
            GOOGLE_SHEET_AUTHORIZED_FILE_ID: 'another-sheet'
        },
        googleOauth: { connected: true }
    });

    assert.equal(readiness.google.spreadsheet_configured, false);
    assert.equal(readiness.google.transition_required, true);
    assert.equal(readiness.ready, false);
});

test('configuration readiness accepts complete direct AI and publishing configuration', () => {
    const readiness = buildSetupReadiness({
        CONFIG: {
            TEXT_MODEL_PROVIDER: 'direct',
            TEXT_MODEL: 'model-x',
            TEXT_MODEL_BASE_URL: 'https://ai.example.test/v1',
            IMAGE_MODEL_PROVIDER: 'direct',
            IMAGE_MODEL: 'image-x',
            IMAGE_MODEL_BASE_URL: 'https://image.example.test/v1',
            GOOGLE_SHEET_ID: 'sheet-1',
            GOOGLE_SHEET_AUTHORIZED_FILE_ID: 'sheet-1',
            WORDPRESS_URL: 'https://blog.example.test',
            WORDPRESS_USER_ID: 'author',
            WORDPRESS_APP_PASSWORD: 'configured'
        },
        googleOauth: { state: 'connected_cached' },
        naverConnected: false
    });

    assert.equal(readiness.ai.configured, true);
    assert.equal(readiness.ai.image_configured, true);
    assert.equal(readiness.google.configured, true);
    assert.equal(readiness.publishing_channel.wordpress_configured, true);
    assert.equal(readiness.ready, true);
});
