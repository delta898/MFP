'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { getDefaultContentWritingProfile } = require('./writing-profile');
const { applyWritingProfileRuntimeAliases } = require('./runtime-profile');

test('runtime aliases expose selected profile voice and strategy to product runtimes', () => {
    const config = {};
    const profile = getDefaultContentWritingProfile();
    profile.common.voice.writing_mode = 'written';
    profile.common.voice.speech_level = 'plain';
    profile.common.writing_strategy = 'discovery';
    applyWritingProfileRuntimeAliases(config, profile);

    assert.equal(config.BLOG_WRITING_MODE, 'written');
    assert.equal(config.CONTENT_WRITING_MODE, 'written');
    assert.equal(config.BLOG_SPEECH_LEVEL, 'plain');
    assert.equal(config.CONTENT_SPEECH_LEVEL, 'plain');
    assert.equal(config.BLOG_WRITING_STRATEGY, 'discovery');
    assert.equal(config.CONTENT_WRITING_STRATEGY, 'discovery');
});
