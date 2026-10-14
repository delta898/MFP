'use strict';

const PACKAGE_METADATA = require('./package.json');
const PACKAGE_VERSION = PACKAGE_METADATA.version;

class WordPressPublisherError extends Error {
    constructor(message, options = {}) {
        super(message, options);
        this.name = 'WordPressPublisherError';
        this.code = options.code || 'WORDPRESS_PUBLISHER_ERROR';
        this.status = options.status;
    }
}

function requireObject(value, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError(`${label} must be an object.`);
    }
    return value;
}

function requireText(value, label) {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be a non-empty string.`);
    return value.trim();
}

function requireWebUrl(value, label) {
    const text = requireText(value, label);
    let parsed;
    try { parsed = new URL(text); }
    catch (cause) { throw new WordPressPublisherError(`${label} was not a valid HTTP(S) URL.`, { cause, code: 'INVALID_RESPONSE' }); }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new WordPressPublisherError(`${label} was not a valid HTTP(S) URL.`, { code: 'INVALID_RESPONSE' });
    }
    return text;
}

function createPlugin(options = {}) {
    if (typeof options.getCredentials !== 'function') {
        throw new TypeError('WordPress Plugin requires an injected getCredentials() function.');
    }
    const fetchImpl = options.fetch || globalThis.fetch;
    if (typeof fetchImpl !== 'function') throw new TypeError('WordPress Plugin requires fetch().');

    async function createRequestContext(signal) {
        let suppliedCredentials;
        try { suppliedCredentials = await options.getCredentials(); }
        catch (_) {
            throw new WordPressPublisherError('WordPress credentials could not be loaded.', {
                code: 'CREDENTIALS_UNAVAILABLE'
            });
        }
        const credentials = requireObject(suppliedCredentials, 'WordPress credentials');
        const baseUrl = requireText(credentials.url, 'WordPress URL').replace(/\/+$/, '');
        const userId = requireText(credentials.userId, 'WordPress user ID');
        const appPassword = requireText(credentials.appPassword, 'WordPress application password');
        let parsedUrl;
        try { parsedUrl = new URL(baseUrl); }
        catch (cause) { throw new WordPressPublisherError('WordPress URL is invalid.', { cause, code: 'INVALID_CONFIGURATION' }); }
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            throw new WordPressPublisherError('WordPress URL must use HTTP or HTTPS.', { code: 'INVALID_CONFIGURATION' });
        }
        if (parsedUrl.username || parsedUrl.password || parsedUrl.search || parsedUrl.hash) {
            throw new WordPressPublisherError('WordPress URL must not embed credentials or query parameters.', { code: 'INVALID_CONFIGURATION' });
        }
        const auth = Buffer.from(`${userId}:${appPassword}`).toString('base64');
        return {
            apiBase: `${baseUrl}/wp-json/wp/v2`,
            headers: { Authorization: `Basic ${auth}` },
            signal
        };
    }

    async function request(context, route, init = {}) {
        let response;
        try {
            response = await fetchImpl(`${context.apiBase}${route}`, {
                ...init,
                headers: { ...context.headers, ...(init.headers || {}) },
                signal: context.signal
            });
        } catch (cause) {
            if (context.signal?.aborted || cause?.name === 'AbortError') {
                throw new WordPressPublisherError('WordPress operation was cancelled.', { code: 'ABORTED' });
            }
            throw new WordPressPublisherError('WordPress request failed before receiving a response.', {
                cause,
                code: 'NETWORK_ERROR'
            });
        }
        if (!response?.ok) {
            throw new WordPressPublisherError(`WordPress returned HTTP ${response?.status || 'error'}.`, {
                code: 'HTTP_ERROR',
                status: response?.status
            });
        }
        try { return await response.json(); }
        catch (cause) {
            throw new WordPressPublisherError('WordPress returned an invalid JSON response.', {
                cause,
                code: 'INVALID_RESPONSE',
                status: response.status
            });
        }
    }

    return Object.freeze({
        operations: Object.freeze({
            'media.upload': Object.freeze({
                async execute(input, context = {}) {
                    const requestContext = await createRequestContext(context.signal);
                    const form = new FormData();
                    form.append('file', new Blob([Buffer.from(input.bytesBase64, 'base64')], { type: input.mimeType }), input.filename);
                    const uploaded = await request(requestContext, '/media', { method: 'POST', body: form });
                    if (!uploaded || uploaded.id == null || !uploaded.source_url) {
                        throw new WordPressPublisherError('WordPress media response omitted required fields.', { code: 'INVALID_RESPONSE' });
                    }
                    if (input.altText || input.filename) {
                        const mediaId = encodeURIComponent(String(uploaded.id));
                        // Match the existing product behavior: media survives if metadata update fails.
                        try {
                            await request(requestContext, `/media/${mediaId}`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    alt_text: input.altText,
                                    title: input.altText || input.filename.replace(/\.[^.]+$/, ''),
                                    caption: input.altText
                                })
                            });
                        } catch (_) { /* Metadata is best effort; keep the uploaded media result. */ }
                    }
                    return { id: uploaded.id, url: requireWebUrl(uploaded.source_url, 'WordPress media URL') };
                }
            }),
            'categories.list': Object.freeze({
                async execute(input, context = {}) {
                    const requestContext = await createRequestContext(context.signal);
                    const query = new URLSearchParams({ per_page: '100' });
                    if (input.search?.trim()) query.set('search', input.search.trim());
                    const result = await request(requestContext, `/categories?${query}`, { method: 'GET' });
                    if (!Array.isArray(result)) {
                        throw new WordPressPublisherError('WordPress category response was invalid.', { code: 'INVALID_RESPONSE' });
                    }
                    return result.map((item) => {
                        const category = requireObject(item, 'WordPress category');
                        const id = Number(category.id);
                        if (!Number.isInteger(id) || id <= 0) {
                            throw new WordPressPublisherError('WordPress category response was invalid.', { code: 'INVALID_RESPONSE' });
                        }
                        return {
                            id,
                            name: requireText(category.name, 'WordPress category name'),
                            slug: typeof category.slug === 'string' ? category.slug : ''
                        };
                    });
                }
            }),
            'posts.create': Object.freeze({
                async execute(input, context = {}) {
                    const requestContext = await createRequestContext(context.signal);
                    const post = {
                        title: input.title,
                        content: input.content,
                        status: input.status,
                        categories: input.categories,
                        featured_media: input.featuredMedia || 0
                    };
                    if (input.date) post.date = input.date;
                    const result = await request(requestContext, '/posts', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(post)
                    });
                    if (!result || result.id == null || typeof result.link !== 'string') {
                        throw new WordPressPublisherError('WordPress post response omitted required fields.', { code: 'INVALID_RESPONSE' });
                    }
                    return { id: result.id, url: requireWebUrl(result.link, 'WordPress post URL') };
                }
            })
        })
    });
}

module.exports = { PACKAGE_VERSION, WordPressPublisherError, createPlugin };
