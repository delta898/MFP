const test = require('node:test');
const assert = require('node:assert/strict');
const { loadSharp } = require('../sharp-loader');
const { createCardNewsOutgoingImageService, createWatermarkSvg, estimateSignatureTextWidthEm } = require('./outgoing-image-service');

test('watermark is applied only for a verified Free plan', async () => {
    const original = await loadSharp().sharp({
        create: { width: 640, height: 480, channels: 3, background: '#dce8df' }
    }).png().toBuffer();
    const service = createCardNewsOutgoingImageService({
        License: { async checkLicenseStatus() { return { success: true, planCode: 'free' }; } },
        fileSystem: { readFileSync: () => original }
    });

    const result = await service.prepareAsset({ path: '/unused/card.png', file_name: 'card.png', mime_type: 'image/png' });
    const output = await loadSharp().sharp(result.buffer).metadata();
    assert.notDeepEqual(result.buffer, original);
    assert.equal(result.mime_type, 'image/png');
    assert.equal(output.width, 640);
    assert.equal(output.height, 480);
});

test('a verified paid plan uses its custom signature and omits it when empty', async () => {
    const original = await loadSharp().sharp({
        create: { width: 640, height: 480, channels: 3, background: '#dce8df' }
    }).png().toBuffer();
    const service = createCardNewsOutgoingImageService({
        License: { async checkLicenseStatus() { return { success: true, planCode: 'pro' }; } },
        fileSystem: { readFileSync: () => original }
    });
    const custom = await service.prepareAsset({ path: '/unused/card.png', file_name: 'card.png', mime_type: 'image/png' }, 'My Brand');
    const omitted = await service.prepareAsset({ path: '/unused/card.png', file_name: 'card.png', mime_type: 'image/png' }, '   ');
    assert.notDeepEqual(custom.buffer, original);
    assert.deepEqual(omitted.buffer, original);
    assert.match(createWatermarkSvg(640, 480, 'My Brand').input.toString('utf8'), /My Brand/);
});

test('failed, missing, or unknown plan checks behave like Free and use the fixed signature', async () => {
    const original = await loadSharp().sharp({
        create: { width: 640, height: 480, channels: 3, background: '#dce8df' }
    }).png().toBuffer();
    for (const License of [
        { async checkLicenseStatus() { return { success: false, planCode: 'pro' }; } },
        { async checkLicenseStatus() { throw new Error('offline'); } },
        undefined
    ]) {
        const service = createCardNewsOutgoingImageService({
            License,
            fileSystem: { readFileSync: () => original }
        });
        const result = await service.prepareAsset({ path: '/unused/card.png', file_name: 'card.png', mime_type: 'image/png' }, 'Spoofed Brand');
        assert.notDeepEqual(result.buffer, original);
    }
});

test('signature policy locks Free and verification failures, and allows verified non-Free plans', async () => {
    const statusByPlan = {
        free: { success: true, planCode: 'free' },
        pro: { success: true, planCode: 'pro' },
        test: { success: true, planCode: 'test' },
        unavailable: { success: false }
    };
    for (const [plan, expectedEditable] of [['free', false], ['pro', true], ['test', true], ['unavailable', false]]) {
        const service = createCardNewsOutgoingImageService({
            License: { async checkLicenseStatus() { return statusByPlan[plan]; } }
        });
        const policy = await service.getSignaturePolicy();
        assert.equal(policy.editable, expectedEditable);
        assert.equal(policy.plan_verified, plan !== 'unavailable');
        assert.equal(policy.default_signature, expectedEditable ? '' : 'BlogGenius.kr');
    }
});

test('a paid-to-Free plan change ignores the retained custom signature, then restores it if upgraded again', async () => {
    let planCode = 'test';
    const original = await loadSharp().sharp({
        create: { width: 640, height: 480, channels: 3, background: '#dce8df' }
    }).png().toBuffer();
    const service = createCardNewsOutgoingImageService({
        License: { async checkLicenseStatus() { return { success: true, planCode }; } },
        fileSystem: { readFileSync: () => original }
    });
    const asset = { path: '/unused/card.png', file_name: 'card.png', mime_type: 'image/png' };

    const paidPolicy = await service.getSignaturePolicy();
    const paidImage = await service.prepareAsset(asset, 'My Brand');
    assert.equal(paidPolicy.editable, true);

    planCode = 'free';
    const freePolicy = await service.getSignaturePolicy();
    const freeImage = await service.prepareAsset(asset, 'My Brand');
    assert.equal(freePolicy.editable, false);
    assert.equal(freePolicy.default_signature, 'BlogGenius.kr');
    assert.notDeepEqual(freeImage.buffer, original);
    assert.notDeepEqual(freeImage.buffer, paidImage.buffer);

    planCode = 'pro';
    const upgradedPolicy = await service.getSignaturePolicy();
    const upgradedImage = await service.prepareAsset(asset, 'My Brand');
    assert.equal(upgradedPolicy.editable, true);
    assert.deepEqual(upgradedImage.buffer, paidImage.buffer);
});

test('rejects an output request when its expected signature no longer matches the verified plan', async () => {
    const service = createCardNewsOutgoingImageService({
        License: { async checkLicenseStatus() { return { success: true, planCode: 'free' }; } },
        fileSystem: { readFileSync: () => Buffer.from('original') }
    });
    await assert.rejects(
        () => service.prepareAssets([{ path: '/unused/card.png', mime_type: 'image/png' }], 'My Brand', 'My Brand', { force: true }),
        (error) => error.status === 409 && error.apiCode === 'CARD_NEWS_SIGNATURE_PREVIEW_STALE'
    );
});

test('watermark label remains fixed and SVG-safe', () => {
    const watermark = createWatermarkSvg(1080, 1080);
    assert.ok(watermark.width < 1080);
    assert.match(watermark.input.toString('utf8'), /BlogGenius\.kr/);
    assert.match(watermark.input.toString('utf8'), /fill-opacity="0\.58"/);
});

test('watermark pill is centered and estimates mixed-script text width without clipping Hangul', () => {
    const korean = createWatermarkSvg(1080, 1350, '감자공주');
    const english = createWatermarkSvg(1080, 1350, 'Amadeus');
    const longEnglish = createWatermarkSvg(1080, 1350, 'Wolfgang Amadeus');
    for (const watermark of [korean, english, longEnglish]) {
        const svg = watermark.input.toString('utf8');
        assert.match(svg, /text-anchor="middle"/);
        assert.match(svg, /dominant-baseline="central"/);
        assert.match(svg, new RegExp(`x="${Math.round(watermark.width / 2)}"`));
    }
    assert.ok(estimateSignatureTextWidthEm('감자공주') > 4 * 0.62);
    assert.ok(estimateSignatureTextWidthEm('Wolfgang Amadeus') < 'Wolfgang Amadeus'.length * 1.08);
    assert.ok(longEnglish.width > english.width);
});

test('batch preparation performs a single plan lookup for all output images', async () => {
    let checks = 0;
    const original = await loadSharp().sharp({
        create: { width: 640, height: 480, channels: 3, background: '#dce8df' }
    }).png().toBuffer();
    const service = createCardNewsOutgoingImageService({
        License: { async checkLicenseStatus() { checks += 1; return { success: true, planCode: 'pro' }; } },
        fileSystem: { readFileSync: () => original }
    });
    const result = await service.prepareAssets([
        { path: '/unused/01.png', file_name: '01.png', mime_type: 'image/png' },
        { path: '/unused/02.png', file_name: '02.png', mime_type: 'image/png' }
    ]);
    assert.equal(checks, 1);
    assert.deepEqual(result.map((asset) => asset.buffer), [original, original]);
});
