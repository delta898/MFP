'use strict';

function createWordPressPublisherAdapter(options = {}) {
    if (typeof options.executeOperation !== 'function') {
        throw new TypeError('WordPress Publisher adapter requires executeOperation().');
    }
    const executeOperation = options.executeOperation;
    return Object.freeze({
        uploadMedia(asset, executionContext = {}) {
            return executeOperation('wordpress-publisher', 'media.upload', {
                bytesBase64: asset.bytes.toString('base64'),
                filename: asset.filename,
                mimeType: asset.mimeType,
                altText: asset.altText || ''
            }, executionContext);
        },
        listCategories(search = '', executionContext = {}) {
            return executeOperation('wordpress-publisher', 'categories.list', {
                search: typeof search === 'string' ? search.trim() : ''
            }, executionContext);
        },
        createPost(request, executionContext = {}) {
            return executeOperation('wordpress-publisher', 'posts.create', request, executionContext);
        }
    });
}

module.exports = { createWordPressPublisherAdapter };
