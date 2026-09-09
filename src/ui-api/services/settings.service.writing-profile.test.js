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
const Constants = require('../../constants');
const { buildBlogGenerationPrompt } = require('../../content/blog-generation-prompt');

function createHarness(options = {}) {
    const configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-profile-'));
    const CONFIG = {
        CONFIG_DIR: configDir,
        WRITING_PROFILE_PATH: path.join(configDir, 'writing_profile.json'),
        content: {
            writing_style: { writing_mode: 'conversational', speech_level: 'polite' }
        }
    };
    const service = createSettingsService({
        fs, path, CONFIG,
        Utils: options.Utils,
        styleReferenceAnalyzer: options.styleReferenceAnalyzer,
        writingProfilePreviewService: options.writingProfilePreviewService
    });
    return { CONFIG, service };
}

test('settings reference analyzer records the actual configured Writing Model', async () => {
    const { CONFIG, service } = createHarness({
        Utils: {
            callWritingText: async () => JSON.stringify({
                surface: { writing_mode: 'written', speech_level: 'polite', tone: 'calm', information_density: 'balanced' },
                settings: { length_preset: 'standard', opening: 'contextual', development: 'explanatory', ending: 'summary', heading_density: 'balanced' },
                structure: { opening_pattern: 'short_context_then_topic', section_flow: ['information'], paragraph_length: 'medium', ending_pattern: 'short_summary' },
                voice: { sentence_rhythm: 'medium', warmth: 'neutral', vocabulary: 'balanced', rhetorical_devices: [] },
                avoid: []
            })
        }
    });
    CONFIG.TEXT_MODEL_CONFIG = {
        provider: 'google', code: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash'
    };

    const result = await service.analyzeWritingProfileReferences({ sample_text: '분석할 참고 문장', blog_urls: [] });

    assert.deepEqual(result.analyzer_model, CONFIG.TEXT_MODEL_CONFIG);
    assert.match(result.fingerprint.summary, /설명형으로 전개/);
});

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
    assert.deepEqual(initial.default_profile_overrides, {
        writing_strategy: 'search', writing_mode: 'conversational', speech_level: 'polite'
    });

    const overridden = await service.saveWritingProfile({
        active_profile: 'default',
        default_profile_overrides: {
            writing_strategy: 'discovery', writing_mode: 'written', speech_level: 'plain'
        }
    });
    assert.equal(overridden.effective_profile.common.writing_strategy, 'discovery');
    assert.equal(overridden.effective_profile.common.voice.writing_mode, 'written');
    assert.equal(overridden.effective_profile.common.voice.tone, 'balanced');
    assert.equal(CONFIG.CONTENT_WRITING_STRATEGY, 'discovery');

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
    assert.equal(CONFIG.BLOG_WRITING_MODE, 'written');
    assert.equal(CONFIG.CONTENT_WRITING_MODE, 'written');
});

test('saved writing defaults become the profile used by blog generation', async () => {
    const { service } = createHarness();
    const custom = createCustomProfile();
    custom.channels.blog.length.preset = 'long';
    custom.channels.blog.structure.opening = 'direct';
    const saved = await service.saveWritingProfile({ active_profile: 'custom', custom_profile: custom });

    const generated = buildBlogGenerationPrompt({
        profile: saved.effective_profile,
        strategy: 'search',
        config: {
            BLOG_PROMPT_CONTRACT_PATH: Constants.BLOG_PROMPT_CONTRACT_FILE,
            BLOG_PROMPT_SEARCH_PATH: Constants.BLOG_PROMPT_SEARCH_FILE,
            BLOG_PROMPT_DISCOVERY_PATH: Constants.BLOG_PROMPT_DISCOVERY_FILE
        },
        constants: Constants,
        post: { subject: '설정 기본값 반영 확인' }
    });

    assert.match(generated.profile_prompt, /문어체/);
    assert.match(generated.profile_prompt, /평어/);
    assert.match(generated.profile_prompt, /약 2,200~2,800자/);
    assert.match(generated.profile_prompt, /핵심 답변이나 결론부터/);
    assert.match(generated.profile_prompt, /체크리스트를 포함/);
});

test('settings preview delegates a draft without persisting or changing runtime profile', async () => {
    const calls = [];
    const { CONFIG, service } = createHarness({
        writingProfilePreviewService: async (body) => {
            calls.push(body);
            return { kind: body.kind, sample: '미리보기' };
        }
    });
    const draft = getDefaultContentWritingProfile();
    draft.common.voice.writing_mode = 'written';
    const before = JSON.stringify(await service.getWritingProfile());
    const result = await service.previewWritingProfile({ kind: 'blog', profile: draft });
    assert.equal(result.sample, '미리보기');
    assert.equal(calls[0].profile.common.voice.writing_mode, 'written');
    assert.equal(JSON.stringify(await service.getWritingProfile()), before);
    assert.equal(CONFIG.CONTENT_WRITING_PROFILE.common.voice.writing_mode, 'conversational');
});

test('settings service analyzes reference drafts without persisting and deletion clears stored sources', async () => {
    const { service } = createHarness({
        styleReferenceAnalyzer: async () => ({
            sample_text: { value: '참고', status: 'analyzed' }, blog_urls: [],
            fingerprint: {
                surface: { writing_mode: 'written', speech_level: 'polite', tone: 'calm', information_density: 'balanced' },
                settings: { length_preset: 'standard', opening: 'contextual', development: 'explanatory', ending: 'judgment', heading_density: 'balanced' },
                summary: '분석 요약'
            },
            fingerprint_input_hash: 'hash',
            analyzed_at: '2026-08-26T00:00:00.000Z', analyzer_version: 'v1',
            analyzer_model: { provider: 'google', code: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash' }
        })
    });
    const analyzed = await service.analyzeWritingProfileReferences({ sample_text: '참고', blog_urls: [] });
    assert.equal(analyzed.fingerprint.summary, '분석 요약');
    assert.equal(analyzed.analyzer_model.code, 'gemini-3.6-flash');
    assert.equal((await service.getWritingProfile()).custom_profile, null);

    const custom = createCustomProfile();
    custom.channels.blog.style_references.sample_text = { value: '참고', status: 'analyzed' };
    custom.channels.blog.style_references.fingerprint = {
        surface: { writing_mode: 'written', speech_level: 'polite', tone: 'calm', information_density: 'balanced' },
        settings: { length_preset: 'standard', opening: 'contextual', development: 'explanatory', ending: 'judgment', heading_density: 'balanced' },
        structure: { opening_pattern: 'answer_first', section_flow: ['information'], paragraph_length: 'short', ending_pattern: 'short_summary' },
        voice: { sentence_rhythm: 'short', warmth: 'neutral', vocabulary: 'balanced', rhetorical_devices: [] },
        avoid: [], summary: '분석 요약'
    };
    custom.channels.blog.style_references.analyzer_model = {
        provider: 'google', code: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash'
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
