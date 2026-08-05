const assert = require('node:assert/strict');
const test = require('node:test');

const CONFIG = require('./config-loader');
const { __testing } = require('./ui-server');

test('major settings include the blog auto posting option', () => {
    const previous = CONFIG.PUBLISH_AUTO_POST_STATUS;
    CONFIG.PUBLISH_AUTO_POST_STATUS = 'draft';

    try {
        const settings = __testing.buildMajorSettings(null, {
            path: '/tmp/config.json',
            sourceType: 'json'
        });

        assert.equal(settings.fields.PUBLISH_AUTO_POST_STATUS, 'draft');
    } finally {
        CONFIG.PUBLISH_AUTO_POST_STATUS = previous;
    }
});
