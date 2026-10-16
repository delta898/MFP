'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createBlogPublishingApplication } = require('./application');

function createApplication(options = {}) {
    const calls = [];
    const app = createBlogPublishingApplication({
        Core: {
            async publishToBlog(directory, request) { calls.push({ operation: 'naver', directory, request }); return { success: true }; },
            async publishToWordPress(directory, request) { calls.push({ operation: 'wordpress', directory, request }); return { success: true }; }
        },
        legacyNaverPublisher: {
            async publish(directory, request) { calls.push({ operation: 'naver', directory, request }); return { success: true }; }
        },
        ImageService: {
            async optimizeBufferForFormat(bytes, format, settings) {
                calls.push({ operation: 'optimize', bytes, format, settings });
                return settings.enabled === false
                    ? { buffer: bytes, format: settings.fallbackFormat, optimized: false }
                    : { buffer: Buffer.from(`${format}:${bytes.toString()}`), format, optimized: true };
            }
        },
        wordpressPublishingApplication: { async publish(request, context) { calls.push({ operation: 'plugin', request, context }); return { success: true }; } },
        CONFIG: { IMAGE_OPTIMIZATION_ENABLED: true },
        Logger: { info() {} },
        fs,
        path,
        ...options
    });
    return { app, calls };
}

test('Blog Publishing Application owns target image policy for Naver and WordPress', async () => {
    const { app, calls } = createApplication();
    const source = { key: 'hero', bytes: Buffer.from('pixels'), filename: 'hero.png', mimeType: 'image/png', altText: 'A view' };
    const naver = await app.prepareImageAsset('naver', source);
    const wordpress = await app.prepareImageAsset('wordpress', source);
    const hosting = await app.prepareImageAsset('site-hosting', source);

    assert.equal(naver.filename, 'hero.webp');
    assert.equal(naver.mimeType, 'image/webp');
    assert.equal(naver.bytes.toString(), 'webp:pixels');
    assert.equal(wordpress.filename, 'hero.avif');
    assert.equal(wordpress.mimeType, 'image/avif');
    assert.equal(wordpress.bytes.toString(), 'avif:pixels');
    assert.equal(hosting, source);
    assert.deepEqual(calls.filter((call) => call.operation === 'optimize').map((call) => call.format), ['webp', 'avif']);
});

test('Blog Publishing Application preserves source assets when optimization is disabled or fails', async () => {
    const disabled = createApplication({ CONFIG: { IMAGE_OPTIMIZATION_ENABLED: false } });
    const source = { key: 'hero', bytes: Buffer.from('pixels'), filename: 'hero.png', mimeType: 'image/png' };
    assert.equal(await disabled.app.prepareImageAsset('wordpress', source), source);

    const failed = createApplication({
        ImageService: { async optimizeBufferForFormat(bytes, _format, settings) { return { buffer: bytes, format: settings.fallbackFormat, optimized: false }; } }
    });
    assert.equal(await failed.app.prepareImageAsset('naver', source), source);
});

test('Blog Publishing Application injects its target policy into legacy publishers and prepares Plugin media', async (t) => {
    const { app, calls } = createApplication();
    const signal = new AbortController().signal;
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-publishing-policy-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const sourcePath = path.join(directory, 'source.png');
    fs.writeFileSync(sourcePath, Buffer.from('pixels'));
    await app.publishNaver('/tmp/naver', { postStatus: 'draft' });
    const naver = calls.find((call) => call.operation === 'naver');
    assert.equal(naver.request.postStatus, 'draft');
    assert.equal(path.basename(await naver.request.prepareImageForUpload(sourcePath)), 'source.webp');

    const request = {
        title: 'Title', content: '{{asset:hero}}',
        assets: [{ key: 'hero', bytes: Buffer.from('pixels'), filename: 'hero.png', mimeType: 'image/png' }]
    };
    await app.publishWordPressPlugin(request, { signal });
    const plugin = calls.find((call) => call.operation === 'plugin');
    assert.equal(plugin.request.assets[0].filename, 'hero.avif');
    assert.equal(plugin.request.assets[0].mimeType, 'image/avif');
    assert.equal(plugin.context.signal, signal);
});

test('Naver publishing prepares typed Markdown blocks and WebP assets before calling the publisher port', async (t) => {
    const { app, calls } = createApplication({
        naverPublisher: {
            async publish(request, context) {
                calls.push({ operation: 'naver-plugin', request, context });
                return { status: request.status, warnings: [] };
            }
        },
        Utils: {
            parseMarkdown() {
                return { title: 'Naver title', contents: [
                    { type: 'newline' },
                    { type: 'header-h2', text: 'Heading' },
                    { type: 'paragraph', text: 'Body', boldRanges: [{ start: 0, end: 2 }] },
                    { type: 'image', index: 0, text: 'Hero' },
                    { type: 'list-item', text: 'Item', listType: 'unordered' }
                ] };
            },
            findImageByPrefix(_directory, index) { return index === 0 ? path.join(directory, '00_hero.png') : null; }
        }
    });
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'naver-plugin-publish-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    fs.writeFileSync(path.join(directory, 'contents.md'), '# Naver title');
    fs.writeFileSync(path.join(directory, '00_hero.png'), Buffer.from('pixels'));
    const signal = new AbortController().signal;
    const progress = [];

    const result = await app.publishNaver(directory, {
        postStatus: 'publish',
        category: 'Travel',
        signal,
        onProgress(event) { progress.push(event); }
    });

    const published = calls.find((call) => call.operation === 'naver-plugin');
    assert.deepEqual(published.request.blocks, [
        { type: 'heading', level: 2, text: 'Heading' },
        { type: 'newline' },
        { type: 'paragraph', text: 'Body', boldRanges: [{ start: 0, end: 2 }] },
        { type: 'image', assetKey: 'image-0', caption: 'Hero' },
        { type: 'list-item', text: 'Item', listType: 'unordered' }
    ]);
    assert.equal(published.request.assets[0].filename, '00_hero.webp');
    assert.equal(published.request.assets[0].mimeType, 'image/webp');
    assert.equal(Buffer.from(published.request.assets[0].bytesBase64, 'base64').toString(), 'webp:pixels');
    assert.equal(published.request.category, 'Travel');
    assert.equal(published.context.signal, signal);
    published.context.reportProgress({ phase: 'working', stage: 'body', current: 1, total: 4 });
    assert.deepEqual(progress, [{ stage: 'body', current: 1, total: 4, postStatus: 'publish' }]);
    assert.equal(result.success, true);
});

test('Naver publishing uses one title transition and preserves additional authored newlines', async (t) => {
    const calls = [];
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'naver-plugin-newlines-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    fs.writeFileSync(path.join(directory, 'contents.md'), '# Naver title');
    const app = createApplication({
        naverPublisher: { async publish(request) { calls.push(request); return { status: request.status, warnings: [] }; } },
        Utils: {
            parseMarkdown() {
                return { title: 'Naver title', contents: [
                    { type: 'newline' },
                    { type: 'newline' },
                    { type: 'paragraph', text: 'First paragraph' },
                    { type: 'newline' },
                    { type: 'newline' },
                    { type: 'header-h2', text: 'A heading' },
                    { type: 'paragraph', text: 'Following paragraph' }
                ] };
            },
            findImageByPrefix() { return null; }
        }
    }).app;

    await app.publishNaver(directory, { postStatus: 'draft' });

    assert.deepEqual(calls[0].blocks, [
        { type: 'newline' },
        { type: 'paragraph', text: 'First paragraph' },
        { type: 'newline' },
        { type: 'newline' },
        { type: 'heading', level: 2, text: 'A heading' },
        { type: 'newline' },
        { type: 'paragraph', text: 'Following paragraph' }
    ]);
});

test('Naver missing image blocks are preserved and force an otherwise live post to draft', async (t) => {
    const calls = [];
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'naver-plugin-missing-image-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    fs.writeFileSync(path.join(directory, 'contents.md'), '# Naver title');
    const app = createApplication({
        naverPublisher: { async publish(request) { calls.push(request); return { status: request.status, warnings: [] }; } },
        Utils: {
            parseMarkdown() { return { title: 'Naver title', contents: [{ type: 'image', index: 1, raw: '[[IMAGE_1\\nprompt: a scene\\n]]', text: 'Hero' }] }; },
            findImageByPrefix() { return null; }
        }
    }).app;

    const result = await app.publishNaver(directory, { postStatus: 'publish' });

    assert.equal(calls[0].status, 'draft');
    assert.deepEqual(calls[0].blocks, [{ type: 'paragraph', text: '[[IMAGE_1\\nprompt: a scene\\n]]' }]);
    assert.match(result.warnings[0], /임시저장/);
});

test('affiliate-required publishing stays on the legacy Naver port', async () => {
    const { app, calls } = createApplication({
        naverPublisher: { async publish(request) { calls.push({ operation: 'unexpected-plugin', request }); return { status: 'publish', warnings: [] }; } }
    });

    await app.publishNaver('/tmp/shopping-post', {
        affiliateUrl: 'https://example.test/item',
        requireAffiliateUrl: true,
        postStatus: 'publish'
    });

    assert.equal(calls.some((call) => call.operation === 'naver'), true);
    assert.equal(calls.some((call) => call.operation === 'unexpected-plugin'), false);
});

test('Blog Publishing Application writes converted file variants without overwriting source images', async (t) => {
    const { app } = createApplication();
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-publishing-image-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const sourcePath = path.join(directory, '00_image.png');
    fs.writeFileSync(sourcePath, Buffer.from('pixels'));

    const preparedPath = await app.prepareImageFile('naver', sourcePath);
    assert.equal(path.basename(preparedPath), '00_image.webp');
    assert.equal(fs.readFileSync(sourcePath).toString(), 'pixels');
    assert.equal(fs.readFileSync(preparedPath).toString(), 'webp:pixels');
});
