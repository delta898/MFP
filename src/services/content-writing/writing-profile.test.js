const test = require('node:test');
const assert = require('node:assert/strict');

const {
    CONTENT_WRITING_PROFILE_SCHEMA_VERSION,
    DEFAULT_CONTENT_WRITING_PROFILE,
    DEFAULT_CONTENT_WRITING_PROFILE_METADATA,
    getDefaultContentWritingProfile,
    normalizeWritingProfile,
    validateWritingProfile,
    assertValidWritingProfile
} = require('./writing-profile');

test('product default content writing profile is versioned, valid and immutable', () => {
    assert.equal(DEFAULT_CONTENT_WRITING_PROFILE_METADATA.schema_version, CONTENT_WRITING_PROFILE_SCHEMA_VERSION);
    assert.equal(DEFAULT_CONTENT_WRITING_PROFILE_METADATA.id, 'product-default');
    assert.equal(validateWritingProfile(DEFAULT_CONTENT_WRITING_PROFILE).valid, true);
    assert.equal(Object.isFrozen(DEFAULT_CONTENT_WRITING_PROFILE), true);
    assert.equal(Object.isFrozen(DEFAULT_CONTENT_WRITING_PROFILE.common.voice), true);

    const clone = getDefaultContentWritingProfile();
    clone.common.voice.tone = 'vivid';
    assert.equal(DEFAULT_CONTENT_WRITING_PROFILE.common.voice.tone, 'balanced');
});

test('profile normalizer applies safe field defaults independently', () => {
    const normalized = normalizeWritingProfile({
        common: {
            writing_strategy: 'DISCOVERY',
            voice: {
                writing_mode: 'WRITTEN',
                speech_level: 'invalid',
                tone: 'vivid',
                information_density: 'dense'
            },
            style_instruction: '  짧은 문장으로 작성  '
        },
        channels: {
            blog: {
                narrator_presence: 'minimal',
                length: { preset: 'long' },
                structure: { opening: 'direct' },
                image_plan: { count_mode: 'fixed', fixed_count: 5 }
            },
            shopping: {
                mode: 'unknown',
                additional_instruction: '  배송 조건 우선  '
            }
        }
    });

    assert.deepEqual(normalized.common.voice, {
        writing_mode: 'written',
        speech_level: 'polite',
        tone: 'vivid',
        information_density: 'dense'
    });
    assert.equal(normalized.common.writing_strategy, 'discovery');
    assert.equal(normalized.common.style_instruction, '짧은 문장으로 작성');
    assert.equal(normalized.channels.blog.length.preset, 'long');
    assert.deepEqual(normalized.channels.blog.image_plan, { count_mode: 'fixed', fixed_count: 5 });
    assert.equal(normalized.channels.shopping.mode, 'product_default');
    assert.equal(normalized.channels.shopping.additional_instruction, '배송 조건 우선');
});

test('strict profile validation rejects invalid enums, lengths and fixed image counts', () => {
    const result = validateWritingProfile({
        common: {
            writing_strategy: 'viral',
            voice: { tone: 'loud' },
            style_instruction: '가'.repeat(501)
        },
        channels: {
            blog: {
                image_plan: { count_mode: 'fixed', fixed_count: 7 },
                author_context: '나'.repeat(301),
                style_references: { blog_urls: ['1', '2', '3', '4'] }
            },
            shopping: {
                mode: 'custom_layout',
                additional_instruction: '다'.repeat(1001)
            }
        }
    });

    assert.equal(result.valid, false);
    assert.deepEqual(new Set(result.errors.map((item) => item.path)), new Set([
        'common.voice.tone',
        'common.writing_strategy',
        'common.style_instruction',
        'channels.blog.image_plan.fixed_count',
        'channels.blog.author_context',
        'channels.blog.style_references.blog_urls',
        'channels.shopping.mode',
        'channels.shopping.additional_instruction'
    ]));
    assert.throws(() => assertValidWritingProfile({
        channels: { blog: { image_plan: { count_mode: 'fixed' } } }
    }), (error) => error.code === 'INVALID_WRITING_PROFILE');
});

test('style reference normalization keeps bounded allowlisted data', () => {
    const normalized = normalizeWritingProfile({
        channels: {
            blog: {
                style_references: {
                    sample_text: { value: '  참고 문장  ', status: 'ANALYZED' },
                    blog_urls: [
                        { url: 'https://example.com/a', status: 'analyzed', title: 'A' },
                        'https://example.com/a',
                        'https://example.com/b',
                        'https://example.com/c',
                        'https://example.com/d'
                    ],
                    fingerprint: {
                        surface: { writing_mode: 'written', speech_level: 'plain', tone: 'calm', information_density: 'dense' },
                        settings: { length_preset: 'long', opening: 'direct', development: 'comparison', ending: 'summary', heading_density: 'sparse' },
                        structure: { opening_pattern: 'short_context_then_topic', section_flow: ['information', 'tip'] },
                        voice: { warmth: 'warm', rhetorical_devices: ['light_question'] },
                        avoid: ['long_preface'],
                        summary: '짧고 따뜻한 설명'
                    },
                    analyzer_model: {
                        provider: 'GOOGLE', code: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash'
                    }
                }
            }
        }
    });

    const references = normalized.channels.blog.style_references;
    assert.equal(references.sample_text.value, '참고 문장');
    assert.equal(references.sample_text.status, 'analyzed');
    assert.equal(references.blog_urls.length, 1);
    assert.equal(references.fingerprint.summary, '짧고 따뜻한 설명');
    assert.equal(references.fingerprint.surface.writing_mode, 'written');
    assert.equal(references.fingerprint.settings.length_preset, 'long');
    assert.deepEqual(references.fingerprint.structure.section_flow, ['information', 'tip']);
    assert.deepEqual(references.analyzer_model, {
        provider: 'google', code: 'gemini-3.6-flash', name: 'Gemini 3.6 Flash'
    });
});
