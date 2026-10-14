'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createImageOptimizationService } = require('./image-optimization-service');

function createSharp(returned = Buffer.from('optimized')) {
    return (input) => ({
        avif(options) { this.format = 'avif'; this.options = options; return this; },
        webp(options) { this.format = 'webp'; this.options = options; return this; },
        async toBuffer() { this.input = input; return returned; }
    });
}

test('image optimization service converts only the requested supported format', async () => {
    const imageOptimization = createImageOptimizationService({ loadSharp: () => ({ sharp: createSharp() }) });
    const input = Buffer.from('source');

    const avif = await imageOptimization.optimizeBuffer(input, { format: 'avif', quality: 62, effort: 3 });
    assert.deepEqual(avif, { buffer: Buffer.from('optimized'), format: 'avif', optimized: true });
    const webp = await imageOptimization.optimizeBuffer(input, { format: 'webp' });
    assert.equal(webp.format, 'webp');
    assert.equal(webp.optimized, true);
    await assert.rejects(imageOptimization.optimizeBuffer(input, { format: 'png' }), /Unsupported image format/);
});

test('image optimization service preserves input when disabled, unavailable, or conversion fails', async () => {
    const input = Buffer.from('source');
    const disabled = createImageOptimizationService({ loadSharp() { throw new Error('must not load'); } });
    assert.deepEqual(await disabled.optimizeBuffer(input, { format: 'webp', enabled: false, fallbackFormat: 'png' }), {
        buffer: input, format: 'png', optimized: false, reason: 'disabled'
    });

    const unavailable = createImageOptimizationService({ loadSharp() { throw new Error('missing sharp'); } });
    assert.deepEqual(await unavailable.optimizeBuffer(input, { format: 'avif', fallbackFormat: 'jpeg' }), {
        buffer: input, format: 'jpeg', optimized: false, reason: 'unavailable'
    });

    const broken = createImageOptimizationService({
        loadSharp: () => ({ sharp: () => ({ avif() { return this; }, webp() { return this; }, async toBuffer() { throw new Error('decode failed'); } }) }),
        logger: { warn() {} }
    });
    assert.deepEqual(await broken.optimizeBuffer(input, { format: 'webp', fallbackFormat: 'png' }), {
        buffer: input, format: 'png', optimized: false, reason: 'conversion_failed'
    });
});
