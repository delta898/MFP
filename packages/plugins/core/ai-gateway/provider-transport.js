'use strict';

const dns = require('node:dns/promises');
const net = require('node:net');
const { PROVIDER_ENDPOINTS } = require('./provider-endpoints');

const DEFAULT_TIMEOUT_MS = 120000;

function normalizePath(path) {
    const value = String(path || '');
    if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\') || /[?#]/.test(value)) {
        throw new TypeError('AI transport path must be an absolute provider-relative path.');
    }
    let decoded;
    try { decoded = decodeURIComponent(value); } catch (_) { throw new TypeError('AI transport path is invalid.'); }
    if (decoded.split('/').some((part) => part === '..' || part === '.')) throw new TypeError('AI transport path is invalid.');
    return value;
}

function isAllowedRoute({ provider, kind, modelId, method, path }) {
    const normalized = normalizePath(path);
    const model = encodeURIComponent(String(modelId || ''));
    const verb = String(method || '').toUpperCase();
    if (provider === 'google') return kind === 'text' || kind === 'image'
        ? verb === 'POST' && normalized === `/v1beta/models/${model}:generateContent`
        : false;
    if (provider === 'openai') return (kind === 'text' && verb === 'POST' && normalized === '/v1/chat/completions')
        || (kind === 'image' && verb === 'POST' && normalized === '/v1/images/generations');
    if (provider === 'direct') return (kind === 'text' && verb === 'POST' && normalized === '/chat/completions')
        || (kind === 'image' && verb === 'POST' && normalized === '/images/generations');
    if (provider === 'anthropic') return kind === 'text' && verb === 'POST' && normalized === '/v1/chat/completions';
    if (provider === 'kie') return (kind === 'text' && verb === 'POST' && ['/codex/v1/responses', '/openai/v1/responses', '/grok/v1/responses'].includes(normalized))
        || (kind === 'text' && verb === 'POST' && normalized === `/${model}/v1/chat/completions`)
        || (kind === 'text' && verb === 'POST' && normalized === '/claude/v1/messages')
        || (kind === 'image' && verb === 'POST' && normalized === '/api/v1/jobs/createTask')
        || (kind === 'image' && verb === 'GET' && normalized === '/api/v1/jobs/recordInfo');
    return false;
}

function resolveDirectEndpoint(profile, path) {
    const rawBase = String(profile?.base_url || '').trim();
    let base;
    try { base = new URL(rawBase); } catch (_) { throw new TypeError('Direct AI Base URL is invalid.'); }
    if (base.username || base.password || base.search || base.hash || !base.hostname) {
        throw new TypeError('Direct AI Base URL cannot contain credentials, query, or fragment.');
    }
    const localHttp = base.protocol === 'http:' && isPrivateAddress(base.hostname);
    if (base.protocol !== 'https:' && !localHttp) {
        throw new TypeError('Direct AI Base URL must use HTTPS, except for local or private HTTP endpoints.');
    }
    let decodedBasePath;
    try { decodedBasePath = decodeURIComponent(base.pathname); } catch (_) { throw new TypeError('Direct AI Base URL path is invalid.'); }
    if (decodedBasePath.split('/').some((part) => part === '.' || part === '..') || base.pathname.includes('\\')) {
        throw new TypeError('Direct AI Base URL path is invalid.');
    }
    return new URL(`${base.origin}${base.pathname.replace(/\/+$/, '')}${path}`);
}

function collectRequestText(value, result = []) {
    if (Array.isArray(value)) {
        value.forEach((item) => collectRequestText(item, result));
        return result;
    }
    if (!value || typeof value !== 'object') return result;
    for (const [key, nested] of Object.entries(value)) {
        if (['content', 'prompt', 'input'].includes(key) && typeof nested === 'string' && nested.length >= 12) result.push(nested);
        else if (nested && typeof nested === 'object') collectRequestText(nested, result);
    }
    return result;
}

function sanitizeProviderDiagnostic(value, { apiKey = '', requestBody } = {}) {
    let text = String(value || '');
    const requestText = collectRequestText(requestBody).sort((a, b) => b.length - a.length);
    for (const sensitive of requestText) {
        if (sensitive.length >= 32) {
            const width = Math.min(64, sensitive.length);
            for (let offset = 0; offset + width <= sensitive.length; offset += Math.max(16, Math.floor(width / 2))) {
                if (text.includes(sensitive.slice(offset, offset + width))) {
                    return 'Provider error message redacted because it echoed request content.';
                }
            }
        } else if (sensitive.length >= 12 && text.includes(sensitive)) {
            return 'Provider error message redacted because it echoed request content.';
        }
    }
    for (const sensitive of [apiKey, ...requestText]) {
        if (sensitive) text = text.split(sensitive).join('[redacted]');
    }
    return text
        .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
        .replace(/\b(?:sk|rk|pk|AIza|gh[pousr]_|xox[baprs]-)[A-Za-z0-9_-]{8,}\b/gi, '[redacted-token]')
        .replace(/https?:\/\/[^\s"'<>]+/gi, '[url]')
        .replace(/([?&][^=\s]+=)[^&\s]+/g, '$1[redacted]')
        .replace(/[\u0000-\u001f\u007f]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 500);
}

function extractProviderError(body, options = {}) {
    const error = body?.error && typeof body.error === 'object' ? body.error : body;
    const rawCode = error?.code || error?.type || body?.error_code || body?.code || '';
    const code = /^[A-Za-z0-9_.:-]{1,100}$/.test(String(rawCode)) ? String(rawCode) : '';
    const message = sanitizeProviderDiagnostic(error?.message || error?.detail || body?.error_description || body?.message || body?.msg, options);
    return {
        ...(code ? { code } : {}),
        ...(message ? { message } : {})
    };
}

function createProviderTransport(options = {}) {
    const getProfile = options.getProviderProfile;
    if (typeof getProfile !== 'function') {
        throw new TypeError('AI Gateway provider transport requires getProviderProfile().');
    }
    const fetchImpl = options.fetch || globalThis.fetch;
    const lookup = options.lookup || dns.lookup;
    if (typeof fetchImpl !== 'function') throw new TypeError('AI transport requires fetch().');
    const maxDownloadBytes = Number.isInteger(options.maxDownloadBytes) ? options.maxDownloadBytes : 10 * 1024 * 1024;

    async function request(input = {}) {
        const provider = String(input.provider || '').trim().toLowerCase();
        const kind = String(input.kind || '').trim();
        const modelId = String(input.modelId || '').trim();
        const method = String(input.method || '').trim().toUpperCase();
        const path = normalizePath(input.path);
        const base = PROVIDER_ENDPOINTS[provider];
        if (!isAllowedRoute({ provider, kind, modelId, method, path }) || (provider !== 'direct' && !base)) {
            throw Object.assign(new Error('AI transport route is not allowed.'), { code: 'AI_GATEWAY_UNSUPPORTED_ROUTE' });
        }
        const profile = await getProfile({ kind, provider, modelId });
        if (provider === 'direct' && String(profile?.code || '').trim() !== modelId) {
            throw Object.assign(new Error('The selected direct model is not the Host-configured model.'), { code: 'AI_GATEWAY_UNSUPPORTED_ROUTE' });
        }
        const apiKey = String(profile?.api_key || '').trim();
        if (!profile || (provider !== 'direct' && !apiKey)) {
            throw Object.assign(new Error('No credential is configured.'), { code: 'AI_GATEWAY_CREDENTIALS_MISSING' });
        }
        const headers = { Accept: input.body?.stream === true ? 'text/event-stream, application/json' : 'application/json' };
        if (provider === 'google') headers['x-goog-api-key'] = apiKey;
        else if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
        if (input.body !== undefined) headers['Content-Type'] = 'application/json';
        const url = provider === 'direct'
            ? resolveDirectEndpoint(profile, path)
            : new URL(path, `${base}/`);
        for (const [key, value] of Object.entries(input.query || {})) {
            if (!['taskId'].includes(key) || provider !== 'kie') throw new TypeError('AI transport query is not allowed.');
            url.searchParams.set(key, String(value));
        }
        const requestOptions = {
            method,
            headers,
            ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
            redirect: 'error',
            signal: combineTimeout(input.signal, input.timeoutMs || DEFAULT_TIMEOUT_MS)
        };
        const response = await fetchImpl(url, requestOptions);
        let body;
        const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();
        if (contentType.includes('text/event-stream')) {
            let eventStream = '';
            try { eventStream = await response.text(); } catch (_) { eventStream = ''; }
            body = parseResponseEventStream(eventStream);
        } else {
            try { body = await response.json(); } catch (_) { body = null; }
        }
        const kieTaskApiError = provider === 'kie'
            && kind === 'image'
            && /^\/api\/v1\/jobs\/(?:createTask|recordInfo)$/.test(path)
            && body?.code !== undefined
            && Number(body.code) !== 200;
        const providerError = Number(response.status) >= 400 || kieTaskApiError
            ? extractProviderError(body, { apiKey, requestBody: input.body })
            : null;
        return {
            status: response.status,
            headers: response.headers,
            body,
            ...(providerError && Object.keys(providerError).length ? { providerError } : {})
        };
    }

    async function inspectModel(input = {}) {
        const provider = String(input.provider || '').trim().toLowerCase();
        const kind = String(input.kind || '').trim();
        const modelId = String(input.modelId || '').trim();
        const paths = {
            google: `/v1beta/models/${encodeURIComponent(modelId)}`,
            openai: `/v1/models/${encodeURIComponent(modelId)}`,
            anthropic: `/v1/models/${encodeURIComponent(modelId)}`,
            kie: '/api/v1/chat/credit',
            direct: '/models'
        };
        const path = paths[provider];
        if (!path || !['text', 'image'].includes(kind) || !modelId) {
            throw Object.assign(new Error('AI model verification route is not allowed.'), { code: 'AI_GATEWAY_UNSUPPORTED_ROUTE' });
        }
        const profile = await getProfile({
            kind, provider, modelId,
            ...(input.profileRef ? { profileRef: input.profileRef } : {})
        });
        if (!profile) throw Object.assign(new Error('No credential is configured.'), { code: 'AI_GATEWAY_CREDENTIALS_MISSING' });
        if (provider === 'direct' && String(profile.code || '').trim() !== modelId) {
            throw Object.assign(new Error('The selected direct model is not the Host-configured model.'), { code: 'AI_GATEWAY_UNSUPPORTED_ROUTE' });
        }
        const apiKey = String(profile.api_key || '').trim();
        if (provider !== 'direct' && !apiKey) {
            throw Object.assign(new Error('No credential is configured.'), { code: 'AI_GATEWAY_CREDENTIALS_MISSING' });
        }
        const headers = { Accept: 'application/json' };
        if (provider === 'google') headers['x-goog-api-key'] = apiKey;
        else if (provider === 'anthropic') {
            headers['x-api-key'] = apiKey;
            headers['anthropic-version'] = '2023-06-01';
        } else if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
        const url = provider === 'direct'
            ? resolveDirectEndpoint(profile, path)
            : new URL(path, `${PROVIDER_ENDPOINTS[provider]}/`);
        const response = await fetchImpl(url, {
            method: 'GET', headers, redirect: 'error',
            signal: combineTimeout(input.signal, input.timeoutMs || 15000)
        });
        let body;
        try { body = await response.json(); } catch (_) { body = null; }
        const providerError = Number(response.status) >= 400
            ? extractProviderError(body, { apiKey })
            : null;
        return {
            status: response.status,
            headers: response.headers,
            body,
            ...(providerError && Object.keys(providerError).length ? { providerError } : {})
        };
    }

    async function downloadUrl(input = {}) {
        const url = new URL(String(input.url || ''));
        if (url.protocol !== 'https:' || url.username || url.password || net.isIP(url.hostname) || isPrivateAddress(url.hostname)) {
            throw new TypeError('AI image download URL is not allowed.');
        }
        const addresses = await lookup(url.hostname, { all: true, verbatim: true });
        if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
            throw new TypeError('AI image download host is not publicly routable.');
        }
        const response = await fetchImpl(url, { method: 'GET', signal: input.signal, redirect: 'error' });
        if (!response.ok) throw Object.assign(new Error('AI image download failed.'), { status: response.status });
        const mimeType = String(response.headers.get('content-type') || 'image/png').split(';')[0].trim();
        if (!/^image\/[a-z0-9.+-]+$/i.test(mimeType)) throw new TypeError('AI download did not return an image.');
        const declaredLength = Number(response.headers.get('content-length'));
        if (Number.isFinite(declaredLength) && declaredLength > maxDownloadBytes) {
            throw Object.assign(new Error('AI image exceeded the size limit.'), { code: 'AI_GATEWAY_IMAGE_TOO_LARGE' });
        }
        const bytes = await readBoundedImageBody(response, maxDownloadBytes);
        return { bytes, mimeType };
    }

    return Object.freeze({ request, inspectModel, downloadUrl });
}

async function readBoundedImageBody(response, maxBytes) {
    const tooLarge = () => Object.assign(new Error('AI image exceeded the size limit.'), { code: 'AI_GATEWAY_IMAGE_TOO_LARGE' });
    if (typeof response.body?.getReader !== 'function') {
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.byteLength > maxBytes) throw tooLarge();
        return bytes;
    }
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = Buffer.from(value);
            total += chunk.byteLength;
            if (total > maxBytes) {
                await reader.cancel();
                throw tooLarge();
            }
            chunks.push(chunk);
        }
    } finally {
        reader.releaseLock?.();
    }
    return Buffer.concat(chunks, total);
}

function combineTimeout(signal, timeoutMs = DEFAULT_TIMEOUT_MS) {
    if (typeof AbortSignal?.timeout !== 'function') return signal;
    const timeout = AbortSignal.timeout(Math.max(1, Number(timeoutMs) || DEFAULT_TIMEOUT_MS));
    return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function isPrivateAddress(hostname) {
    const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === '::1' || host === '::') return true;
    if (net.isIP(host) === 6) {
        const normalized = host.toLowerCase();
        return normalized === '::' || normalized === '::1'
            || normalized.startsWith('fc') || normalized.startsWith('fd')
            || /^fe[89ab]/.test(normalized) || normalized.startsWith('::ffff:');
    }
    const parts = host.split('.').map(Number);
    if (parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
        return parts[0] === 10 || parts[0] === 127 || parts[0] === 0
            || (parts[0] === 169 && parts[1] === 254)
            || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
            || (parts[0] === 192 && (parts[1] === 168 || parts[1] === 0 || parts[1] === 2))
            || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
            || (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19 || parts[1] === 51))
            || (parts[0] === 203 && parts[1] === 0)
            || parts[0] >= 224;
    }
    return false;
}

function parseResponseEventStream(value) {
    let completedResponse = null;
    let outputText = '';
    let failure = null;
    let providerEnvelopeError = null;
    for (const eventText of String(value || '').split(/\r?\n\r?\n/)) {
        const data = eventText.split(/\r?\n/)
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trimStart())
            .join('\n');
        if (!data || data === '[DONE]') continue;
        let event;
        try { event = JSON.parse(data); } catch (_) { continue; }
        if (Number(event?.code) !== 200 && event?.msg) providerEnvelopeError = event;
        if (event?.type === 'response.output_text.delta' && typeof event.delta === 'string') outputText += event.delta;
        if (event?.type === 'response.completed' && event.response && typeof event.response === 'object') completedResponse = event.response;
        if (event?.type === 'error' || event?.type === 'response.failed') failure = event.error || event.response?.error || event;
    }
    if (providerEnvelopeError) return providerEnvelopeError;
    if (failure) return { error: failure };
    if (completedResponse) return completedResponse;
    return outputText ? { output_text: outputText } : null;
}

module.exports = {
    PROVIDER_HOSTS: PROVIDER_ENDPOINTS,
    createProviderTransport,
    extractProviderError,
    isAllowedRoute,
    isPrivateAddress,
    parseResponseEventStream,
    resolveDirectEndpoint,
    sanitizeProviderDiagnostic
};
