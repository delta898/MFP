const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.BLOGGENIUS_ENV = process.env.BLOGGENIUS_ENV || 'local';
const CONFIG = require('./config-loader');
const Core = require('./core');
const Utils = require('./utils');
const { getDefaultContentWritingProfile } = require('./content/writing-profile');

test('Core.generateContent uses the selected blog profile composer for the shared blog runtime', async () => {
    const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'core-writing-profile-'));
    const previousProfile = CONFIG.CONTENT_WRITING_PROFILE;
    const previousStrategy = CONFIG.BLOG_WRITING_STRATEGY;
    let capturedPrompt = '';

    const profile = getDefaultContentWritingProfile();
    profile.common.style_instruction = '핵심 용어는 첫 등장에 쉽게 풀이하세요.';
    profile.channels.blog.length.preset = 'short';
    profile.channels.blog.additional_instruction = '결론에 두 항목 체크리스트를 넣으세요.';
    profile.channels.shopping.additional_instruction = '쇼핑 전용 가격 설명';

    CONFIG.CONTENT_WRITING_PROFILE = profile;
    CONFIG.BLOG_WRITING_STRATEGY = 'search';
    const generateText = async (prompt) => {
        capturedPrompt = prompt;
        return JSON.stringify({
            title: '프로필 연결 테스트',
            keywords: ['프로필'],
            hashtags: ['프로필'],
            content: '생성된 본문\n\n[[IMAGE_0\ntitle: 첫 이미지\nprompt: first image\n]]\n\n[[IMAGE_1\ntitle: 둘째 이미지\nprompt: second image\n]]'
        });
    };

    try {
        const result = await Core.generateContent({
            subject: '프로필 연결',
            keywords: ['글쓰기 프로필'],
            writing_strategy: 'discovery',
            content_guide: {
                additional_instructions: '이번 글에서는 도입을 한 문장으로 작성하세요.',
                reference_urls: [],
                writing_overrides: { length: 'long', opening: 'direct' }
            },
            use_external_ref: false,
            image_options: { generate: false, count: 2 }
        }, targetDir, {
            platform: 'wordpress',
            enableRelatedPostsAutoLink: false,
            generateText
        });

        assert.equal(result.finalSubject, '프로필 연결 테스트');
        assert.equal(fs.existsSync(path.join(targetDir, 'contents.md')), true);
        assert.match(capturedPrompt, /전략: 발견 중심 \(피드\)/);
        assert.match(capturedPrompt, /약 2,200~2,800자/);
        assert.match(capturedPrompt, /도입은 핵심 답변이나 결론부터/);
        assert.match(capturedPrompt, /핵심 용어는 첫 등장에 쉽게 풀이/);
        assert.match(capturedPrompt, /결론에 두 항목 체크리스트/);
        assert.match(capturedPrompt, /이번 글에서는 도입을 한 문장/);
        assert.match(capturedPrompt, /정확히 2개 작성/);
        assert.doesNotMatch(capturedPrompt, /쇼핑 전용 가격 설명/);
        assert.deepEqual(result.imagePlan, { mode: 'prompt_only', count: 2, source: 'post', length_preset: null });
    } finally {
        CONFIG.CONTENT_WRITING_PROFILE = previousProfile;
        CONFIG.BLOG_WRITING_STRATEGY = previousStrategy;
        fs.rmSync(targetDir, { recursive: true, force: true });
    }
});

test('Core does not write contents.md when generation is canceled after the model responds', async () => {
    const targetDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'core-canceled-text-')), 'generated');
    const controller = new AbortController();
    const selectedModel = { provider: 'openai', code: 'gpt-6-sol' };
    let seenOptions;
    const generateText = async (_prompt, options) => {
        seenOptions = options;
        controller.abort();
        return JSON.stringify({ title: '늦은 원고', content: '본문' });
    };
    try {
        await assert.rejects(
            Core.generateContent({ subject: '취소 테스트', image_options: { mode: 'none' } }, targetDir, {
                platform: 'wordpress', enableRelatedPostsAutoLink: false,
                signal: controller.signal, textModelConfig: selectedModel, generateText
            }),
            (error) => error.code === 'AI_GENERATION_CANCELED'
        );
        assert.equal(seenOptions.signal, controller.signal);
        assert.equal(seenOptions.modelConfig, selectedModel);
        assert.equal(fs.existsSync(targetDir), false);
    } finally {
        fs.rmSync(path.dirname(targetDir), { recursive: true, force: true });
    }
});

test('Core stops before the text model when optional reference lookup is still pending', async () => {
    const targetDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'core-canceled-reference-')), 'generated');
    const previousFetch = Utils.fetchNaverBlogTopPosts;
    const previousText = Utils.callWritingText;
    const controller = new AbortController();
    let textCalls = 0;
    Utils.fetchNaverBlogTopPosts = async () => new Promise(() => {});
    Utils.callWritingText = async () => { textCalls += 1; return '{}'; };
    try {
        const pending = Core.generateContent({
            subject: '참고자료 취소 테스트', use_external_ref: true,
            image_options: { mode: 'none' }
        }, targetDir, { platform: 'wordpress', signal: controller.signal });
        await new Promise((resolve) => setImmediate(resolve));
        controller.abort();
        await assert.rejects(pending, (error) => error.code === 'AI_GENERATION_CANCELED');
        assert.equal(textCalls, 0);
        assert.equal(fs.existsSync(targetDir), false);
    } finally {
        Utils.fetchNaverBlogTopPosts = previousFetch;
        Utils.callWritingText = previousText;
        fs.rmSync(path.dirname(targetDir), { recursive: true, force: true });
    }
});
