'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createBlogPostingApplication } = require('./application');

test('Blog Posting Application prepares topic content and images through Blog Writing Application', async () => {
    const calls = [];
    const Core = {
        async generateContent(topic, workspaceDir, options) {
            calls.push(['content', topic, workspaceDir]);
            await options.generateText('prompt', { modelConfig: { provider: 'google', code: 'writer' } });
            return { targetDir: '/tmp/blog-post', finalSubject: '제목' };
        },
        async prepareImages(targetDir, topic, options) {
            calls.push(['images', targetDir, topic.image_options, options.imageGenerationEnabled]);
            options.onImageProgress?.({ current: 1, total: 2, imageIndex: 0, state: 'started' });
            await options.generateImage('image prompt', { modelConfig: { provider: 'openai', code: 'artist' } });
        }
    };
    const blogWritingApplication = {
        async generateText(prompt, context) { calls.push(['text', prompt, context]); return '본문'; },
        async generateImage(prompt, imageOptions, context) {
            calls.push(['image', prompt, imageOptions, context]);
            return { dataBase64: 'image', mimeType: 'image/png' };
        }
    };
    const application = createBlogPostingApplication({ Core, blogWritingApplication });
    const topic = { subject: '주제', image_options: { generate: true } };

    const result = await application.preparePost(topic, {
        platform: 'naver',
        imageGenerationEnabled: true,
        onImageProgress(progress) { calls.push(['image-progress', progress]); },
        signal: AbortSignal.timeout(1000)
    });

    assert.equal(result.targetDir, '/tmp/blog-post');
    assert.deepEqual(calls.map(([kind]) => kind), ['content', 'text', 'images', 'image-progress', 'image']);
    assert.deepEqual(calls[3][1], { current: 1, total: 2, imageIndex: 0, state: 'started' });
    assert.deepEqual(calls[1][2].modelSelection, { provider: 'google', modelId: 'writer' });
    assert.deepEqual(calls[4][3].modelSelection, { provider: 'openai', modelId: 'artist' });
});
