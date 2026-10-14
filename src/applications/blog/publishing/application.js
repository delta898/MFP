'use strict';

const pathDefault = require('path');

const TARGET_FORMATS = Object.freeze({ naver: 'webp', wordpress: 'avif' });
const MIME_TYPES = Object.freeze({ avif: 'image/avif', webp: 'image/webp' });
const FORMAT_EXTENSIONS = Object.freeze({
    avif: new Set(['.avif']),
    webp: new Set(['.webp'])
});

function createBlogPublishingApplication(options = {}) {
    const { Core, ImageService, wordpressPublishingApplication, CONFIG, Logger, fs } = options;
    const path = options.path || pathDefault;
    if (!Core || typeof Core.publishToBlog !== 'function' || typeof Core.publishToWordPress !== 'function') {
        throw new TypeError('Blog Publishing Application requires Naver and WordPress publishers.');
    }
    if (!ImageService || typeof ImageService.optimizeBufferForFormat !== 'function') {
        throw new TypeError('Blog Publishing Application requires an image optimization service.');
    }
    if (!fs || typeof fs.readFileSync !== 'function' || typeof fs.writeFileSync !== 'function') {
        throw new TypeError('Blog Publishing Application requires filesystem access for prepared image files.');
    }

    function isOptimizationEnabled() {
        return CONFIG?.IMAGE_OPTIMIZATION_ENABLED !== false;
    }

    async function prepareImageAsset(target, asset) {
        const format = TARGET_FORMATS[target];
        if (!format || !asset || !Buffer.isBuffer(asset.bytes)) return asset;
        const currentExtension = path.extname(String(asset.filename || '')).toLowerCase();
        if (FORMAT_EXTENSIONS[format].has(currentExtension)) {
            return { ...asset, mimeType: MIME_TYPES[format] };
        }
        const result = await ImageService.optimizeBufferForFormat(asset.bytes, format, {
            enabled: isOptimizationEnabled(),
            fallbackFormat: currentExtension.replace(/^\./, '')
        });
        if (!result.optimized) return asset;
        const filename = `${path.basename(String(asset.filename), currentExtension)}.${result.format}`;
        Logger?.info?.(`[Blog Publishing] 이미지 변환 완료 (target=${target}, format=${result.format}, bytes=${asset.bytes.length}->${result.buffer.length})`);
        return { ...asset, bytes: result.buffer, filename, mimeType: MIME_TYPES[result.format] };
    }

    async function prepareImageFile(target, filePath) {
        const format = TARGET_FORMATS[target];
        if (!format || !filePath || !fs.existsSync(filePath)) return filePath;
        const extension = path.extname(filePath).toLowerCase();
        if (FORMAT_EXTENSIONS[format].has(extension)) return filePath;
        const originalBytes = fs.readFileSync(filePath);
        const asset = await prepareImageAsset(target, {
            bytes: originalBytes,
            filename: path.basename(filePath),
            mimeType: ''
        });
        if (asset.bytes === originalBytes) return filePath;
        const preparedPath = path.join(path.dirname(filePath), asset.filename);
        fs.writeFileSync(preparedPath, asset.bytes);
        return preparedPath;
    }

    async function publishNaver(directory, request = {}) {
        return Core.publishToBlog(directory, {
            ...request,
            prepareImageForUpload: (filePath) => prepareImageFile('naver', filePath)
        });
    }

    async function publishWordPressLegacy(directory, request = {}) {
        return Core.publishToWordPress(directory, {
            ...request,
            prepareImageForUpload: (filePath) => prepareImageFile('wordpress', filePath)
        });
    }

    async function publishWordPressPlugin(request = {}, executionContext = {}) {
        if (typeof wordpressPublishingApplication?.publish !== 'function') {
            throw new TypeError('WordPress Publishing Application is unavailable.');
        }
        const assets = [];
        for (const asset of Array.isArray(request.assets) ? request.assets : []) {
            assets.push(await prepareImageAsset('wordpress', asset));
        }
        assets.forEach((asset, index) => {
            Logger?.info?.(`[Blog Publishing] 이미지 업로드 준비 (${index + 1}/${assets.length}, mime=${asset.mimeType}, bytes=${asset.bytes.length})`);
        });
        Logger?.info?.(`[Blog Publishing] WordPress 발행 준비 (assets=${assets.length})`);
        return wordpressPublishingApplication.publish({ ...request, assets }, executionContext);
    }

    return Object.freeze({
        listWordPressCategories(search = '', executionContext = {}) {
            if (typeof wordpressPublishingApplication?.listCategories !== 'function') {
                throw new TypeError('WordPress Publishing Application is unavailable.');
            }
            return wordpressPublishingApplication.listCategories(search, executionContext);
        },
        prepareImageAsset,
        prepareImageFile,
        publishNaver,
        publishWordPressLegacy,
        publishWordPressPlugin
    });
}

module.exports = { TARGET_FORMATS, createBlogPublishingApplication };
