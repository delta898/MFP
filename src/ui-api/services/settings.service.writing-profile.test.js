const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createSettingsService } = require('./settings.service');
const {
    DEFAULT_CONTENT_WRITING_PROFILE_METADATA,
    getDefaultContentWritingProfile
} = require('../../content/writing-profile');

function createHarness(options = {}) {
    const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-profile-'));
    const CONFIG = {
        CONFIG_DIR: configDir,
        WRITING_PROFILE_PATH: path.join(configDir, 'writing_profile.json'),
        content: {
            writing_style: { writing_mode: 'conversational', speech_level: 'polite' }
        }
    };
    const service = createSettingsService({ fs, path, CONFIG, styleReferenceAnalyzer: options.styleReferenceAnalyzer });
    return { CONFIG, service };
}

function createCustomProfile() {
    const profile = getDefaultContentWritingProfile();
    profile.common.voice.writing_mode = 'written';
    profile.common.voice.speech_level = 'plain';
    profile.channels.blog.additional_instruction = '체크리스트를 포함';
    profile.channels.shopping.additional_instruction = '배송 조건부터 설명';
    return {
        based_on_default_version: DEFAULT_CONTENT_WRITING_PROFILE_METADATA.profile_version,
        ...profile
    };
}

test('settings service returns default metadata and updates runtime compatibility aliases', async () => {
    const { CONFIG, service } = createHarness();
    const initial = await service.getWritingProfile();
    assert.equal(initial.active_profile, 'default');
    assert.equal(initial.default_profile_metadata.id, 'product-default');

    const saved = await service.saveWritingProfile({
        active_profile: 'custom',
        custom_profile: createCustomProfile()
    });
    assert.equal(saved.active_profile, 'custom');
    assert.equal(saved.effective_profile.channels.shopping.additional_instruction, '배송 조건부터 설명');
    assert.equal(CONFIG.BLOG_WRITING_MODE, 'written');
    assert.equal(CONFIG.CONTENT_WRITING_MODE, 'written');
    assert.equal(CONFIG.BLOG_SPEECH_LEVEL, 'plain');
    assert.equal(CONFIG.CONTENT_SPEECH_LEVEL, 'plain');

    const defaulted = await service.useDefaultWritingProfile();
    assert.equal(defaulted.active_profile, 'default');
    assert.equal(defaulted.custom_profile.channels.blog.additional_instruction, '체크리스트를 포함');
    assert.equal(CONFIG.BLOG_WRITING_MODE, 'conversational');
    assert.equal(CONFIG.CONTENT_WRITING_MODE, 'conversational');
});

test('settings service analyzes reference drafts without persisting and deletion clears stored sources', async () => {
    const { service } = createHarness({
        styleReferenceAnalyzer: async () => ({
            sample_text: { value: '참고', status: 'analyzed' }, blog_urls: [],
            fingerprint: { summary: '분석 요약' }, fingerprint_input_hash: 'hash',
            analyzed_at: '2026-08-26T00:00:00.000Z', analyzer_version: 'v1'
        })
    });
    const analyzed = await service.analyzeWritingProfileReferences({ sample_text: '참고', blog_urls: [] });
    assert.equal(analyzed.fingerprint.summary, '분석 요약');
    assert.equal((await service.getWritingProfile()).custom_profile, null);

    const custom = createCustomProfile();
    custom.channels.blog.style_references.sample_text = { value: '참고', status: 'analyzed' };
    custom.channels.blog.style_references.fingerprint = {
        structure: { opening_pattern: '', section_flow: [], paragraph_length: '', ending_pattern: '' },
        voice: { sentence_rhythm: '', warmth: '', vocabulary: '', rhetorical_devices: [] },
        avoid: [], summary: '분석 요약'
    };
    await service.saveWritingProfile({ active_profile: 'custom', custom_profile: custom });
    const deleted = await service.deleteWritingProfileReferences();
    assert.equal(deleted.custom_profile.channels.blog.style_references.sample_text.value, '');
    assert.equal(deleted.custom_profile.channels.blog.style_references.fingerprint, null);
});

test('settings service maps strict validation failures to a stable API error', async () => {
    const { service } = createHarness();
    await assert.rejects(
        () => service.saveWritingProfile({ active_profile: 'custom', custom_profile: { based_on_default_version: 1 } }),
        (error) => error.status === 400 && error.apiCode === 'WRITING_PROFILE_INVALID'
    );
});
