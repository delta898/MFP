'use strict';

const { loadSharp } = require('../../sharp-loader');

const SUPPORTED_FORMATS = new Set(['avif', 'webp']);

function createImageOptimizationService(deps = {}) {
    const loadSharpImpl = typeof deps.loadSharp === 'function' ? deps.loadSharp : loadSharp;
    const logger = deps.logger || { warn() {} };
    let sharp = null;
    let sharpUnavailable = false;

    function getSharp() {
        if (sharp) return sharp;
        if (sharpUnavailable) return null;
        try {
            sharp = loadSharpImpl().sharp;
            return sharp;
        } catch (error) {
            sharpUnavailable = true;
            logger.warn(`이미지 최적화 라이브러리를 사용할 수 없습니다: ${error.message}`);
            return null;
        }
    }

    return Object.freeze({
        async optimizeBuffer(buffer, options = {}) {
            const format = String(options.format || '').trim().toLowerCase();
            if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
                throw new TypeError('Image optimization requires a non-empty Buffer.');
            }
            if (!SUPPORTED_FORMATS.has(format)) throw new TypeError(`Unsupported image format: ${format || '(missing)'}`);
            if (options.enabled === false) return { buffer, format: options.fallbackFormat || '', optimized: false, reason: 'disabled' };
            const sharpFactory = getSharp();
            if (!sharpFactory) return { buffer, format: options.fallbackFormat || '', optimized: false, reason: 'unavailable' };

            try {
                let pipeline = sharpFactory(buffer);
                if (format === 'avif') {
                    pipeline = pipeline.avif({ quality: options.quality || 55, effort: options.effort || 4 });
                } else {
                    pipeline = pipeline.webp({ quality: options.quality || 85 });
                }
                const optimizedBuffer = await pipeline.toBuffer();
                if (!Buffer.isBuffer(optimizedBuffer) || optimizedBuffer.length === 0) {
                    throw new Error('Image optimizer returned an empty result.');
                }
                return { buffer: optimizedBuffer, format, optimized: true };
            } catch (error) {
                logger.warn(`이미지 ${format.toUpperCase()} 최적화 실패: ${error.message}`);
                return { buffer, format: options.fallbackFormat || '', optimized: false, reason: 'conversion_failed' };
            }
        }
    });
}

module.exports = { SUPPORTED_FORMATS, createImageOptimizationService };
