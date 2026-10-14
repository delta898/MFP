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
