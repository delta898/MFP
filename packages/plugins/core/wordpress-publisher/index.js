'use strict';

const PLUGIN_ID = 'wordpress-publisher';
const PACKAGE_VERSION = require('./package.json').version;
const PLUGIN_METADATA = Object.freeze({
    id: PLUGIN_ID,
    name: 'WordPress Publisher',
    version: PACKAGE_VERSION,
    summary: 'Publishes posts and uploads media through the WordPress REST API.',
    operations: Object.freeze([
        Object.freeze({ id: 'media.upload', description: 'Upload an image asset to the WordPress media library.' }),
        Object.freeze({ id: 'categories.list', description: 'List WordPress categories, optionally filtered by search text.' }),
        Object.freeze({ id: 'posts.create', description: 'Create a WordPress post using WordPress REST API fields.' })
    ])
});

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
    catch (cause) { throw new TypeError(`${label} must be an absolute HTTP(S) URL.`, { cause }); }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new TypeError(`${label} must be an absolute HTTP(S) URL.`);
    return text;
}

function parseUploadInput(value) {
    const input = requireObject(value, 'Media upload input');
    if (!Buffer.isBuffer(input.bytes)) throw new TypeError('Media upload bytes must be a Buffer.');
    if (input.bytes.length === 0) throw new TypeError('Media upload bytes must not be empty.');
    const mimeType = requireText(input.mimeType, 'Media MIME type');
    if (!mimeType.toLowerCase().startsWith('image/')) throw new TypeError('Media MIME type must be an image type.');
    return Object.freeze({
        bytes: input.bytes,
        filename: requireText(input.filename, 'Media filename'),
        mimeType,
        altText: typeof input.altText === 'string' ? input.altText : ''
    });
}

function parseUploadOutput(value) {
    const output = requireObject(value, 'Media upload output');
    if (!(typeof output.id === 'number' && Number.isFinite(output.id)) && typeof output.id !== 'string') {
        throw new TypeError('Media ID must be a string or number.');
    }
    const url = requireWebUrl(output.url, 'Media URL');
    return Object.freeze({ id: output.id, url });
}

function parseCategoriesInput(value) {
    const input = requireObject(value, 'Category list input');
    const search = input.search == null ? '' : requireText(input.search, 'Category search');
    return Object.freeze({ search });
}

function parseCategoriesOutput(value) {
    if (!Array.isArray(value)) throw new TypeError('Categories output must be an array.');
    return Object.freeze(value.map((item) => {
        const category = requireObject(item, 'Category');
        const id = Number(category.id);
        if (!Number.isInteger(id) || id <= 0) throw new TypeError('Category ID must be a positive number.');
        return Object.freeze({
            id,
            name: requireText(category.name, 'Category name'),
            slug: typeof category.slug === 'string' ? category.slug : ''
        });
    }));
}

function parsePostInput(value) {
    const input = requireObject(value, 'Post creation input');
    const status = requireText(input.status, 'Post status');
    if (!['draft', 'publish', 'future', 'pending', 'private'].includes(status)) {
        throw new TypeError('Post status is not supported.');
    }
    const date = input.date == null ? undefined : requireText(input.date, 'Post date');
    if (status === 'future' && !date) throw new TypeError('Post date is required for future posts.');
    if (!Array.isArray(input.categories) || input.categories.some((id) => !Number.isInteger(Number(id)) || Number(id) <= 0)) {
        throw new TypeError('Post categories must be positive numeric IDs.');
    }
    const featuredMedia = input.featuredMedia == null ? null : Number(input.featuredMedia);
    if (featuredMedia !== null && (!Number.isInteger(featuredMedia) || featuredMedia <= 0)) {
        throw new TypeError('Featured media must be a positive numeric ID.');
    }
    return Object.freeze({
        title: requireText(input.title, 'Post title'),
        content: typeof input.content === 'string' && input.content.trim()
            ? input.content
            : (() => { throw new TypeError('Post content must be a non-empty string.'); })(),
        status,
        categories: Object.freeze(input.categories.map(Number)),
        featuredMedia,
        date
    });
}

function parsePostOutput(value) {
    const output = requireObject(value, 'Post creation output');
    if (!(typeof output.id === 'number' && Number.isFinite(output.id)) && typeof output.id !== 'string') {
        throw new TypeError('Post ID must be a string or number.');
    }
    return Object.freeze({ id: output.id, url: requireWebUrl(output.url, 'Post URL') });
}

function createWordPressPublisherPlugin(options = {}) {
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
        id: PLUGIN_METADATA.id,
        name: PLUGIN_METADATA.name,
        version: PLUGIN_METADATA.version,
        operations: Object.freeze({
            'media.upload': Object.freeze({
                description: PLUGIN_METADATA.operations[0].description,
                input: Object.freeze({ parse: parseUploadInput }),
                output: Object.freeze({ parse: parseUploadOutput }),
                async execute(input, context = {}) {
                    const requestContext = await createRequestContext(context.signal);
                    const form = new FormData();
                    form.append('file', new Blob([input.bytes], { type: input.mimeType }), input.filename);
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
                    return { id: uploaded.id, url: uploaded.source_url };
                }
            }),
            'categories.list': Object.freeze({
                description: PLUGIN_METADATA.operations[1].description,
                input: Object.freeze({ parse: parseCategoriesInput }),
                output: Object.freeze({ parse: parseCategoriesOutput }),
                async execute(input, context = {}) {
                    const requestContext = await createRequestContext(context.signal);
                    const query = new URLSearchParams({ per_page: '100' });
                    if (input.search) query.set('search', input.search);
                    const result = await request(requestContext, `/categories?${query}`, { method: 'GET' });
                    if (!Array.isArray(result)) {
                        throw new WordPressPublisherError('WordPress category response was invalid.', { code: 'INVALID_RESPONSE' });
                    }
                    return result;
                }
            }),
            'posts.create': Object.freeze({
                description: PLUGIN_METADATA.operations[2].description,
                input: Object.freeze({ parse: parsePostInput }),
                output: Object.freeze({ parse: parsePostOutput }),
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
                    return { id: result.id, url: result.link };
                }
            })
        })
    });
}

module.exports = { PLUGIN_ID, PACKAGE_VERSION, PLUGIN_METADATA, WordPressPublisherError, createWordPressPublisherPlugin };
