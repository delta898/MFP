const test = require('node:test');
const assert = require('node:assert/strict');

const {
    DEFAULT_WRITING_STYLE,
    normalizeWritingStyle,
    getWritingStyleDescription,
    buildWritingStylePrompt,
    buildShoppingWritingStylePrompt
} = require('./writing-style');
const { resolveContentWritingPreferences } = require('./writing-preferences');

test('writing style defaults to conversational polite', () => {
    assert.deepEqual(normalizeWritingStyle({}), DEFAULT_WRITING_STYLE);
    assert.equal(getWritingStyleDescription({}), '친근하고 자연스러운 후기형 문체');
});

test('writing style normalizes invalid values independently', () => {
    assert.deepEqual(normalizeWritingStyle({
        writing_mode: 'written',
        speech_level: 'invalid'
    }), {
        writing_mode: 'written',
        speech_level: 'polite'
    });
});

test('writing style exposes descriptions for all supported combinations', () => {
    assert.equal(getWritingStyleDescription({ writing_mode: 'conversational', speech_level: 'plain' }), '편안하고 자유로운 일기·SNS형 문체');
    assert.equal(getWritingStyleDescription({ writing_mode: 'written', speech_level: 'polite' }), '정돈되고 신뢰감 있는 정보·전문형 문체');
    assert.equal(getWritingStyleDescription({ writing_mode: 'written', speech_level: 'plain' }), '간결하고 객관적인 설명문·칼럼형 문체');
});

test('writing style prompt contains concrete mode and speech rules', () => {
    const prompt = buildWritingStylePrompt({
        writing_mode: 'written',
        speech_level: 'plain'
    });

    assert.match(prompt, /표현 방식은 문어체/);
    assert.match(prompt, /높임 방식은 평어/);
    assert.match(prompt, /~다, ~했다 형태를 중심/);
    assert.match(prompt, /~요, ~습니다, ~세요와 구어적 종결/);
    assert.match(prompt, /Instructions.*우선/);
});

test('shopping writing style prompt maps every common preference without fabricated experience', () => {
    const conversationalPolite = buildShoppingWritingStylePrompt({
        writing_mode: 'conversational',
        speech_level: 'polite'
    });
    const writtenPlain = buildShoppingWritingStylePrompt({
        writing_mode: 'written',
        speech_level: 'plain'
    });

    assert.match(conversationalPolite, /구어체 존댓말/);
    assert.match(conversationalPolite, /~요를 중심/);
    assert.match(writtenPlain, /문어체 평어/);
    assert.match(writtenPlain, /~다, ~했다/);
    assert.match(writtenPlain, /직접 사용한 것처럼 경험을 꾸미지 마세요/);
});

test('content writing preferences prefer common keys and support legacy blog settings', () => {
    assert.deepEqual(resolveContentWritingPreferences({
        blog: {
            writing_style: { writing_mode: 'written', speech_level: 'plain' },
            writing_strategy: 'discovery'
        }
    }), {
        style: { writing_mode: 'written', speech_level: 'plain' },
        strategy: 'discovery'
    });

    assert.deepEqual(resolveContentWritingPreferences({
        writing_style: { writing_mode: 'conversational', speech_level: 'polite' },
        writing_strategy: 'search',
        blog: {
            writing_style: { writing_mode: 'written', speech_level: 'plain' },
            writing_strategy: 'discovery'
        }
    }), {
        style: { writing_mode: 'conversational', speech_level: 'polite' },
        strategy: 'search'
    });
});
