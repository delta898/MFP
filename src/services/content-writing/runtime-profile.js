'use strict';

const { normalizeWritingProfile } = require('./writing-profile');

function applyWritingProfileRuntimeAliases(config, profile) {
    if (!config || !profile) return;
    const effectiveProfile = normalizeWritingProfile(profile);
    const voice = effectiveProfile.common.voice;
    config.BLOG_WRITING_MODE = voice.writing_mode;
    config.BLOG_SPEECH_LEVEL = voice.speech_level;
    config.CONTENT_WRITING_MODE = voice.writing_mode;
    config.CONTENT_SPEECH_LEVEL = voice.speech_level;
    config.BLOG_WRITING_STRATEGY = effectiveProfile.common.writing_strategy;
    config.CONTENT_WRITING_STRATEGY = effectiveProfile.common.writing_strategy;
    config.CONTENT_WRITING_PROFILE = effectiveProfile;
}

module.exports = { applyWritingProfileRuntimeAliases };
