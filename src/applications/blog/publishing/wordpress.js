'use strict';

const ASSET_REFERENCE_PATTERN = /\{\{asset:([^}]+)}}/g;

function escapeHtmlAttribute(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[character]);
}

function requireText(value, label) {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be a non-empty string.`);
    return value.trim();
}

function assertNotAborted(executionContext) {
    if (executionContext?.signal?.aborted) {
        const error = new Error('WordPress publishing was cancelled.');
        error.code = 'ABORTED';
        throw error;
    }
}

function normalizeRequest(request, options = {}) {
    if (!request || typeof request !== 'object' || Array.isArray(request)) {
        throw new TypeError('WordPress publishing request must be an object.');
    }
    const status = request.status || 'draft';
    if (!['draft', 'publish', 'schedule'].includes(status)) throw new TypeError('Unsupported publication status.');
    const date = request.date == null ? undefined : requireText(request.date, 'Schedule date');
    if (status === 'schedule' && !date) throw new TypeError('Schedule date is required for scheduled publishing.');
    if (request.assets !== undefined && !Array.isArray(request.assets)) throw new TypeError('Assets must be an array.');
    const content = typeof request.content === 'string' && request.content.trim()
        ? request.content
        : '';
    if (!options.allowMissingContent && !content) throw new TypeError('Content must be a non-empty string.');
    return {
        title: requireText(request.title, 'Title'),
        ...(content ? { content } : {}),
        status,
        date,
        category: typeof request.category === 'string' ? request.category.trim() : '',
        featuredAsset: typeof request.featuredAsset === 'string' ? request.featuredAsset.trim() : '',
        assets: (request.assets || []).map((asset) => {
            if (!asset || typeof asset !== 'object' || Array.isArray(asset)) throw new TypeError('Each asset must be an object.');
            if (!Buffer.isBuffer(asset.bytes) || asset.bytes.length === 0) throw new TypeError('Asset bytes must be a non-empty Buffer.');
            return {
                key: requireText(asset.key, 'Asset key'),
                bytes: asset.bytes,
                filename: requireText(asset.filename, 'Asset filename'),
                mimeType: requireText(asset.mimeType, 'Asset MIME type'),
                altText: typeof asset.altText === 'string' ? asset.altText : ''
            };
        })
    };
}

function createWordPressPublishingApplication(options = {}) {
    const publisher = options.publisher;
    if (!publisher || typeof publisher.uploadMedia !== 'function'
        || typeof publisher.listCategories !== 'function' || typeof publisher.createPost !== 'function') {
        throw new TypeError('WordPress publishing Application requires a Publisher capability.');
    }

    return Object.freeze({
        validate(request) {
            return Object.freeze(normalizeRequest(request, { allowMissingContent: true }));
        },
        listCategories(search = '', executionContext = {}) {
            return publisher.listCategories(search, executionContext);
        },
        async publish(request, executionContext = {}) {
            const input = normalizeRequest(request);
            assertNotAborted(executionContext);
            const warnings = [];
            const uploadedAssets = new Map();
            let featuredMedia = null;

            for (const asset of input.assets) {
                try {
                    assertNotAborted(executionContext);
                    const uploaded = await publisher.uploadMedia(asset, executionContext);
                    uploadedAssets.set(asset.key, uploaded);
                    if (input.featuredAsset === asset.key && featuredMedia === null) featuredMedia = uploaded.id;
                } catch (error) {
                    if (executionContext?.signal?.aborted || error?.code === 'ABORTED') throw error;
                    warnings.push(`이미지 '${asset.key}' 업로드 실패`);
                }
            }

            let categories = [];
            if (input.category) {
                try {
                    assertNotAborted(executionContext);
                    const found = await publisher.listCategories(input.category, executionContext);
                    const target = input.category.toLowerCase();
                    const match = found.find((category) => (
                        String(category.id).toLowerCase() === target
                        || category.name.trim().toLowerCase() === target
                        || String(category.slug || '').toLowerCase() === target
                    ));
                    if (match) categories = [Number(match.id)];
                    else warnings.push(`카테고리 '${input.category}' 없음`);
                } catch (error) {
                    if (executionContext?.signal?.aborted || error?.code === 'ABORTED') throw error;
                    warnings.push(`카테고리 '${input.category}' 조회 실패`);
                }
            }

            const content = input.content.replace(ASSET_REFERENCE_PATTERN, (reference, key) => {
                const asset = uploadedAssets.get(key.trim());
                if (!asset) return '';
                const descriptor = input.assets.find((item) => item.key === key.trim());
                return `<img src="${escapeHtmlAttribute(asset.url)}" alt="${escapeHtmlAttribute(descriptor?.altText || '')}">`;
            });

            let finalStatus = input.status === 'schedule' ? 'future' : input.status;
            if (warnings.length && finalStatus !== 'draft') finalStatus = 'draft';
            assertNotAborted(executionContext);
            const post = await publisher.createPost({
                title: input.title,
                content,
                status: finalStatus,
                categories,
                featuredMedia,
                ...(finalStatus === 'future' && input.date ? { date: input.date } : {})
            }, executionContext);

            return {
                success: true,
                postId: post.id,
                postUrl: post.url,
                status: finalStatus,
                warnings: warnings.length ? warnings : null
            };
        }
    });
}

module.exports = { createWordPressPublishingApplication };
