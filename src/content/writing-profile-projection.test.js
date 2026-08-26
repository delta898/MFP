const test = require('node:test');
const assert = require('node:assert/strict');

const { projectWritingProfile } = require('./writing-profile-projection');

const profile = {
    common: {
        voice: {
            writing_mode: 'written',
            speech_level: 'polite',
            tone: 'calm',
            information_density: 'dense'
        },
        style_instruction: '짧은 문장을 사용하세요.'
    },
    channels: {
        blog: {
            narrator_presence: 'present',
            length: { preset: 'long' },
            structure: {
                opening: 'scene',
                development: 'experience_review',
                ending: 'summary',
                heading_density: 'dense'
            },
            image_plan: { count_mode: 'fixed', fixed_count: 6 },
            author_context: '여행 작가',
            additional_instruction: '체크리스트 포함',
            style_references: {
                sample_text: { value: '참고 문장', status: 'analyzed' },
                blog_urls: [],
                fingerprint: {
                    surface: {
                        writing_mode: 'conversational',
                        speech_level: 'plain',
                        tone: 'vivid',
                        information_density: 'light'
                    },
                    settings: {
                        length_preset: 'long', opening: 'scene', development: 'experience_review', ending: 'summary', heading_density: 'dense'
                    },
                    summary: '짧고 선명한 문체'
                }
            }
        },
        shopping: {
            mode: 'product_default',
            additional_instruction: '배송 조건을 먼저 설명'
        }
    }
};

test('blog projection exposes common and blog capabilities only', () => {
    const projected = projectWritingProfile(profile, { kind: 'blog' });

    assert.equal(projected.kind, 'blog');
    assert.equal(projected.common.voice.tone, 'calm');
    assert.equal(projected.common.voice.speech_level, 'polite');
    assert.equal(projected.channel.length.preset, 'long');
    assert.equal(projected.channel.author_context, '여행 작가');
    assert.equal(projected.channel.style_references.fingerprint.summary, '짧고 선명한 문체');
    assert.equal(Object.prototype.hasOwnProperty.call(projected.channel, 'mode'), false);
});

test('non-current reference analysis is excluded from generation', () => {
    const staleProfile = structuredClone(profile);
    staleProfile.channels.blog.style_references.sample_text.status = 'stale';

    const projected = projectWritingProfile(staleProfile, { kind: 'blog' });

    assert.equal(projected.common.voice.tone, 'calm');
    assert.equal(projected.channel.style_references.fingerprint, null);
});

test('shopping projection cannot access blog-only capabilities', () => {
    const projected = projectWritingProfile(profile, { kind: 'shopping' });

    assert.equal(projected.kind, 'shopping');
    assert.equal(projected.common.style_instruction, '짧은 문장을 사용하세요.');
    assert.equal(projected.common.voice.tone, 'calm');
    assert.deepEqual(projected.channel, {
        mode: 'product_default',
        additional_instruction: '배송 조건을 먼저 설명'
    });
    for (const forbidden of ['length', 'structure', 'image_plan', 'narrator_presence', 'author_context', 'style_references']) {
        assert.equal(Object.prototype.hasOwnProperty.call(projected.channel, forbidden), false);
    }
});

test('projection rejects unsupported content kinds', () => {
    assert.throws(
        () => projectWritingProfile(profile, { kind: 'social' }),
        (error) => error.code === 'INVALID_WRITING_PROFILE_KIND'
    );
});
