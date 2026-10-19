'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const CONFIG = require('../../../host/configuration/runtime-config');
const { getDefaultContentWritingProfile } = require('../../../services/content-writing/writing-profile');
const { createBlogPostingApplication } = require('./application');

function createApplication({ writing, config = CONFIG, ...dependencies } = {}) {
    return createBlogPostingApplication({
        relatedPostsService: {
            async fetchOwnBlogRelatedPosts() { return []; },
            async fetchWordPressRandomPosts() { return []; },
            pickHeading() { return '함께 보면 좋은 글'; },
            shuffle(items) { return items.slice(); }
        },
        CONFIG: config,
        blogPromptPaths: require('../writing/prompts/paths'),
        Logger: { info() {}, warn() {}, error() {}, debug() {} },
        fs,
        path,
        blogWritingApplication: writing,
        ...dependencies
    });
}

test('Blog Posting Application owns content assembly and routes text and image generation through Blog Writing Application', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-posting-application-'));
    const targetDir = path.join(root, 'post');
    const calls = [];
    const writing = {
        async generateText(prompt, context) {
            calls.push(['text', prompt, context]);
            return JSON.stringify({ title: '제목', content: '본문\n\n[[IMAGE_0\ntitle: 이미지\nprompt: image prompt\n]]', hashtags: ['#키워드'] });
        },
        async generateImage(prompt, imageOptions, context) {
            calls.push(['image', prompt, imageOptions, context]);
            return { dataBase64: Buffer.from('image').toString('base64'), mimeType: 'image/png' };
        }
    };
    const progress = [];
    try {
        const application = createApplication({ writing, config: { IMAGE_STYLE: 'illustration' } });
        const result = await application.preparePost({
            subject: '주제',
            image_options: { mode: 'generate', count: 1 }
        }, {
            workspaceDir: targetDir,
            platform: 'naver',
            enableRelatedPostsAutoLink: false,
            textModelConfig: { provider: 'google', code: 'writer' },
            imageModelConfig: { provider: 'openai', code: 'artist' },
            onImageProgress: (event) => progress.push(event)
        });

        assert.equal(result.targetDir, targetDir);
        assert.equal(fs.readFileSync(path.join(targetDir, 'contents.md'), 'utf8'), '# 제목\n본문\n\n[[IMAGE_0\ntitle: 이미지\nprompt: image prompt\n]]\n\n\n#키워드');
        assert.equal(fs.readFileSync(path.join(targetDir, '00_image.png'), 'utf8'), 'image');
        assert.deepEqual(calls.map(([kind]) => kind), ['text', 'image']);
        assert.deepEqual(calls[0][2].modelSelection, { provider: 'google', modelId: 'writer' });
        assert.equal(calls[0][2].responseMimeType, undefined);
        assert.deepEqual(calls[1][2], { aspectRatio: '4:3', size: '1K', count: 1 });
        assert.deepEqual(calls[1][3].modelSelection, { provider: 'openai', modelId: 'artist' });
        assert.deepEqual(progress.map(({ state }) => state), ['started', 'completed']);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('Blog Posting Application uses the selected writing profile when composing its prompt', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-posting-profile-'));
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
    try {
        const application = createApplication({
            writing: {
                async generateText(prompt) {
                    capturedPrompt = prompt;
                    return JSON.stringify({ title: '프로필 연결 테스트', content: '생성된 본문' });
                },
                async generateImage() { throw new Error('not used'); }
            },
            resolvePlatformWorkspaceDir: () => root,
            config: CONFIG
        });
        const result = await application.preparePost({
            subject: '프로필 연결',
            keywords: ['글쓰기 프로필'],
            writing_strategy: 'discovery',
            content_guide: {
                additional_instructions: '이번 글에서는 도입을 한 문장으로 작성하세요.',
                reference_urls: [],
                writing_overrides: { length: 'long', opening: 'direct' }
            },
            use_external_ref: false,
            image_options: { mode: 'none' }
        }, { platform: 'wordpress', enableRelatedPostsAutoLink: false });

        assert.equal(result.finalSubject, '프로필 연결 테스트');
        assert.equal(fs.existsSync(path.join(result.targetDir, 'contents.md')), true);
        assert.match(capturedPrompt, /전략: 발견 중심 \(피드\)/);
        assert.match(capturedPrompt, /약 2,200~2,800자/);
        assert.match(capturedPrompt, /도입은 핵심 답변이나 결론부터/);
        assert.match(capturedPrompt, /핵심 용어는 첫 등장에 쉽게 풀이/);
        assert.match(capturedPrompt, /결론에 두 항목 체크리스트/);
        assert.match(capturedPrompt, /이번 글에서는 도입을 한 문장/);
        assert.doesNotMatch(capturedPrompt, /쇼핑 전용 가격 설명/);
    } finally {
        CONFIG.CONTENT_WRITING_PROFILE = previousProfile;
        CONFIG.BLOG_WRITING_STRATEGY = previousStrategy;
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('Blog Posting Application does not write a manuscript when generation is canceled after the model responds', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-posting-canceled-'));
    const targetDir = path.join(root, 'generated');
    const controller = new AbortController();
    let seenContext;
    const application = createApplication({
        resolvePlatformWorkspaceDir: () => root,
        writing: {
            async generateText(_prompt, context) {
                seenContext = context;
                controller.abort();
                return JSON.stringify({ title: '늦은 원고', content: '본문' });
            },
            async generateImage() { throw new Error('not used'); }
        }
    });
    try {
        await assert.rejects(application.preparePost({ subject: '취소 테스트', image_options: { mode: 'none' } }, {
            workspaceDir: targetDir,
            platform: 'wordpress',
            enableRelatedPostsAutoLink: false,
            signal: controller.signal,
            textModelConfig: { provider: 'openai', code: 'gpt-6-sol' }
        }), (error) => error.code === 'AI_GENERATION_CANCELED');
        assert.equal(seenContext.signal, controller.signal);
        assert.deepEqual(seenContext.modelSelection, { provider: 'openai', modelId: 'gpt-6-sol' });
        assert.equal(fs.existsSync(targetDir), false);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('Blog Posting Application stops before text generation when optional reference lookup is canceled', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-posting-canceled-reference-'));
    const controller = new AbortController();
    let textCalls = 0;
    const application = createApplication({
        resolvePlatformWorkspaceDir: () => root,
        writing: {
            async generateText() { textCalls += 1; return '{}'; },
            async generateImage() { throw new Error('not used'); }
        },
        referenceSearchGateway: { searchLatestReferences() { return new Promise(() => {}); } }
    });
    try {
        const pending = application.preparePost({
            subject: '참고자료 취소 테스트', use_external_ref: true,
            image_options: { mode: 'none' }
        }, { platform: 'wordpress', signal: controller.signal });
        await new Promise((resolve) => setImmediate(resolve));
        controller.abort();
        await assert.rejects(pending, (error) => error.code === 'AI_GENERATION_CANCELED');
        assert.equal(textCalls, 0);
        assert.deepEqual(fs.readdirSync(root), []);
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});
