const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
    createWritingProfileRepository,
    validateCustomProfileSnapshot,
    applyWritingProfileRuntimeAliases
} = require('./writing-profile-repository');
const {
    DEFAULT_CONTENT_WRITING_PROFILE_METADATA,
    getDefaultContentWritingProfile
} = require('./writing-profile');

function createTempRepository(options = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'writing-profile-'));
    const filePath = path.join(dir, 'writing_profile.json');
    const repository = createWritingProfileRepository({
        fs,
        path,
        filePath,
        legacyContentConfig: options.legacyContentConfig || {},
        now: () => '2026-08-26T00:00:00.000Z'
    });
    return { dir, filePath, repository };
}

function customSnapshot(overrides = {}) {
    const profile = getDefaultContentWritingProfile();
    profile.common.voice.tone = overrides.tone || 'vivid';
    profile.channels.blog.style_references.sample_text.value = overrides.sampleText || '짧은 참고 문장';
    profile.channels.shopping.additional_instruction = overrides.shoppingInstruction || '배송 조건을 먼저 설명';
    return {
        based_on_default_version: DEFAULT_CONTENT_WRITING_PROFILE_METADATA.profile_version,
        ...profile
    };
}

test('missing repository migrates a non-default legacy common voice without writing on read', () => {
    const { filePath, repository } = createTempRepository({
        legacyContentConfig: {
            writing_style: { writing_mode: 'written', speech_level: 'plain' }
        }
    });

    const result = repository.read();
    assert.equal(result.source, 'legacy_migration');
    assert.equal(result.document.active_profile, 'custom');
    assert.equal(result.effective_profile.common.voice.writing_mode, 'written');
    assert.equal(result.effective_profile.common.voice.speech_level, 'plain');
    assert.equal(result.effective_profile.channels.shopping.mode, 'product_default');
    assert.equal(fs.existsSync(filePath), false);
});

test('missing repository selects product default when legacy common voice matches', () => {
    const { repository } = createTempRepository();
    const result = repository.read();
    assert.equal(result.document.active_profile, 'default');
    assert.equal(result.document.custom_profile, null);
    assert.equal(result.effective_profile.common.voice.writing_mode, 'conversational');
    assert.equal(result.effective_profile.common.voice.speech_level, 'polite');
});

test('save uses an atomic rename and preserves custom references when switching to default', () => {
    const { dir, filePath, repository } = createTempRepository();
    const saved = repository.save({
        active_profile: 'custom',
        custom_profile: customSnapshot({ sampleText: '보존할 참고 문장' })
    });
    assert.equal(saved.document.active_profile, 'custom');
    assert.equal(saved.effective_profile.common.voice.tone, 'vivid');
    assert.equal(fs.existsSync(filePath), true);
    assert.deepEqual(fs.readdirSync(dir).filter((name) => name.endsWith('.tmp')), []);

    const defaulted = repository.useDefault();
    assert.equal(defaulted.document.active_profile, 'default');
    assert.equal(defaulted.effective_profile.common.voice.tone, 'balanced');
    assert.equal(
        defaulted.document.custom_profile.channels.blog.style_references.sample_text.value,
        '보존할 참고 문장'
    );

    const defaultWithNullPayload = repository.save({ active_profile: 'default', custom_profile: null });
    assert.equal(defaultWithNullPayload.document.custom_profile.common.voice.tone, 'vivid');

    const restored = repository.save({ active_profile: 'custom' });
    assert.equal(restored.effective_profile.common.voice.tone, 'vivid');
    assert.equal(
        restored.effective_profile.channels.blog.style_references.sample_text.value,
        '보존할 참고 문장'
    );
});

test('corrupt and unsupported files fall back to product default without overwrite', () => {
    const { filePath, repository } = createTempRepository({
        legacyContentConfig: { writing_style: { writing_mode: 'written', speech_level: 'plain' } }
    });
    fs.writeFileSync(filePath, '{broken', 'utf8');
    const before = fs.readFileSync(filePath, 'utf8');
    const corrupt = repository.read();
    assert.equal(corrupt.source, 'product_default');
    assert.equal(corrupt.document.active_profile, 'default');
    assert.equal(corrupt.effective_profile.common.voice.writing_mode, 'conversational');
    assert.equal(corrupt.warnings[0].code, 'PROFILE_FILE_CORRUPT');
    assert.equal(fs.readFileSync(filePath, 'utf8'), before);

    fs.writeFileSync(filePath, JSON.stringify({ schema_version: 99 }), 'utf8');
    const unsupported = repository.read();
    assert.equal(unsupported.source, 'product_default');
    assert.equal(unsupported.warnings[0].code, 'PROFILE_SCHEMA_UNSUPPORTED');
});

test('structurally incomplete selected custom profile falls back to product default', () => {
    const { filePath, repository } = createTempRepository();
    fs.writeFileSync(filePath, JSON.stringify({
        schema_version: 1,
        active_profile: 'custom',
        custom_profile: { based_on_default_version: 1, common: {} }
    }), 'utf8');

    const result = repository.read();
    assert.equal(result.document.active_profile, 'default');
    assert.equal(result.source, 'product_default');
    assert.ok(result.warnings.some((item) => item.code === 'CUSTOM_PROFILE_INVALID'));
});

test('strict save validation rejects incomplete, unknown and cross-channel fields', () => {
    const valid = customSnapshot();
    assert.equal(validateCustomProfileSnapshot(valid).valid, true);

    const incomplete = customSnapshot();
    delete incomplete.channels.shopping.additional_instruction;
    assert.equal(validateCustomProfileSnapshot(incomplete).valid, false);

    const crossKind = customSnapshot();
    crossKind.channels.shopping.blog_length = 'long';
    const result = validateCustomProfileSnapshot(crossKind);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((item) => item.code === 'UNKNOWN_FIELD'));

    const oversizedFingerprint = customSnapshot();
    oversizedFingerprint.channels.blog.style_references.fingerprint = {
        structure: {
            opening_pattern: '가'.repeat(81),
            section_flow: [],
            paragraph_length: '',
            ending_pattern: ''
        },
        voice: { sentence_rhythm: '', warmth: '', vocabulary: '', rhetorical_devices: [] },
        avoid: [],
        summary: ''
    };
    assert.equal(validateCustomProfileSnapshot(oversizedFingerprint).valid, false);

    const { repository } = createTempRepository();
    assert.throws(
        () => repository.save({ active_profile: 'custom', custom_profile: incomplete }),
        (error) => error.code === 'INVALID_WRITING_PROFILE'
    );
});

test('runtime aliases expose the same selected common voice to blog and shopping', () => {
    const CONFIG = {};
    const profile = getDefaultContentWritingProfile();
    profile.common.voice.writing_mode = 'written';
    profile.common.voice.speech_level = 'plain';
    applyWritingProfileRuntimeAliases(CONFIG, profile);

    assert.equal(CONFIG.BLOG_WRITING_MODE, 'written');
    assert.equal(CONFIG.CONTENT_WRITING_MODE, 'written');
    assert.equal(CONFIG.BLOG_SPEECH_LEVEL, 'plain');
    assert.equal(CONFIG.CONTENT_SPEECH_LEVEL, 'plain');
});
