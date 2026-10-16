'use strict';

const { resolveRoute } = require('./support');

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const DEFAULT_JOB_TIMEOUT_MS = 15 * 60 * 1000;
const PENDING_JOB_STATES = new Set(['submitted', 'waiting', 'queuing', 'generating']);

class AiGatewayError extends Error {
    constructor(code, message, options = {}) {
        super(message);
        this.name = 'AiGatewayError';
        this.code = code;
        this.retryable = options.retryable === true;
        if (Number.isInteger(options.status)) this.status = options.status;
        if (options.providerCode) this.providerCode = options.providerCode;
        if (options.providerMessage) this.providerMessage = options.providerMessage;
        if (options.providerRequestId) this.providerRequestId = options.providerRequestId;
        if (options.remoteOutcome) this.remoteOutcome = options.remoteOutcome;
    }
}

function canceled(remoteOutcome = 'not_submitted') {
    return new AiGatewayError('AI_GATEWAY_CANCELED', 'AI generation was canceled.', { remoteOutcome });
}

function throwIfAborted(signal, remoteOutcome = 'not_submitted') {
    if (signal?.aborted) throw canceled(remoteOutcome);
}

function sleepWithSignal(ms, signal, sleep) {
    throwIfAborted(signal, 'may_continue');
    if (!signal) return sleep(ms);
    return new Promise((resolve, reject) => {
        const onAbort = () => {
            signal.removeEventListener('abort', onAbort);
            reject(canceled('may_continue'));
        };
        signal.addEventListener('abort', onAbort, { once: true });
        Promise.resolve().then(() => sleep(ms)).then(() => {
            signal.removeEventListener('abort', onAbort);
            resolve();
        }, (error) => {
            signal.removeEventListener('abort', onAbort);
            reject(error);
        });
        if (signal.aborted) onAbort();
    });
}

function getHeader(headers, key) {
    if (!headers || typeof headers !== 'object') return '';
    if (typeof headers.get === 'function') return String(headers.get(key) || '').trim();
    const match = Object.keys(headers).find((name) => name.toLowerCase() === key.toLowerCase());
    return match ? String(headers[match] || '').trim() : '';
}

function normalizeProviderError(error, provider) {
    if (error instanceof AiGatewayError) return error;
    const providerCode = /^[A-Za-z0-9_.:-]{1,100}$/.test(String(error?.providerCode || ''))
        ? String(error.providerCode)
        : '';
    const providerMessage = String(error?.providerMessage || '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
    const providerRequestId = /^[A-Za-z0-9._:-]{1,256}$/.test(String(error?.providerRequestId || ''))
        ? String(error.providerRequestId)
        : '';
    const details = {
        ...(Number.isInteger(error?.status) ? { status: error.status } : {}),
        ...(providerCode ? { providerCode } : {}),
        ...(providerMessage ? { providerMessage } : {}),
        ...(providerRequestId ? { providerRequestId } : {})
    };
    if (typeof error?.code === 'string' && error.code.startsWith('AI_GATEWAY_')) {
        return new AiGatewayError(error.code, error.code === 'AI_GATEWAY_CREDENTIALS_MISSING'
            ? 'No credential is configured for the selected provider.'
            : 'The AI Gateway could not complete the requested operation.', details);
    }
    if (error?.code === 'AI_GATEWAY_CREDENTIALS_MISSING') {
        return new AiGatewayError('AI_GATEWAY_CREDENTIALS_MISSING', 'No credential is configured for the selected provider.');
    }
    if (error?.code === 'AI_GATEWAY_CANCELED' || error?.name === 'AbortError' || error?.code === 'ERR_CANCELED') {
        return canceled('may_continue');
    }
    const status = Number(error?.status || error?.response?.status || 0);
    const candidateRequestId = String(error?.providerRequestId || error?.requestId || '').slice(0, 256);
    const normalizedRequestId = /^[A-Za-z0-9._:-]+$/.test(candidateRequestId) ? candidateRequestId : '';
    const providerDetails = {
        ...(providerCode ? { providerCode } : {}),
        ...(providerMessage ? { providerMessage } : {}),
        ...(normalizedRequestId ? { providerRequestId: normalizedRequestId } : {})
    };
    if (status === 401 || status === 403) {
        return new AiGatewayError('AI_GATEWAY_AUTHENTICATION_FAILED', 'The AI provider rejected the configured credential.', { status, ...providerDetails });
    }
    if (status === 429) {
        return new AiGatewayError('AI_GATEWAY_RATE_LIMITED', 'The AI provider rate limit was reached.', { status, retryable: true, ...providerDetails });
    }
    if (status >= 500) {
        return new AiGatewayError('AI_GATEWAY_PROVIDER_UNAVAILABLE', 'The AI provider is temporarily unavailable.', { status, retryable: true, ...providerDetails });
    }
    if (status >= 400) {
        return new AiGatewayError('AI_GATEWAY_PROVIDER_REJECTED_REQUEST', 'The AI provider rejected the generation request.', { status, ...providerDetails });
    }
    const timeout = error?.code === 'ETIMEDOUT' || error?.code === 'ECONNABORTED' || /timeout/i.test(String(error?.message || ''));
    return new AiGatewayError(
        timeout ? 'AI_GATEWAY_TIMEOUT' : 'AI_GATEWAY_PROVIDER_ERROR',
        timeout ? 'The AI provider request timed out.' : `The ${provider} provider request failed.`,
        { retryable: false, ...(providerRequestId ? { providerRequestId } : {}) }
    );
}

function assertResponse(response, provider) {
    const status = Number(response?.status || 0);
    if (status >= 200 && status < 300) return response.body;
    const error = new Error('Provider request failed.');
    error.status = status || 502;
    error.providerRequestId = getHeader(response?.headers, 'x-request-id')
        || getHeader(response?.headers, 'request-id');
    if (response?.providerError && typeof response.providerError === 'object') {
        error.providerCode = response.providerError.code;
        error.providerMessage = response.providerError.message;
    }
    throw normalizeProviderError(error, provider);
}

function extractOpenAiText(body) {
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content === 'string') return content.trim();
    if (Array.isArray(content)) return content.map((part) => String(part?.text || '')).join('').trim();
    return '';
}

function extractGeminiText(body) {
    return (body?.candidates?.[0]?.content?.parts || [])
        .filter((part) => part?.thought !== true)
        .map((part) => String(part?.text || '').trim())
        .filter(Boolean)
        .join('\n');
}

function flattenMessages(messages = []) {
    return messages.map((message) => `${message.role}: ${message.content}`).join('\n\n');
}

function normalizeUsage(body, route) {
    const usage = route.transport === 'gemini_generate_content'
        ? body?.usageMetadata
        : (body?.usage || body?.usageMetadata);
    const inputTokens = Number(usage?.promptTokenCount ?? usage?.input_tokens ?? usage?.prompt_tokens);
    const outputTokens = Number(usage?.candidatesTokenCount ?? usage?.output_tokens ?? usage?.completion_tokens);
    return {
        ...(Number.isInteger(inputTokens) && inputTokens >= 0 ? { inputTokens } : {}),
        ...(Number.isInteger(outputTokens) && outputTokens >= 0 ? { outputTokens } : {})
    };
}

function buildTextRequest(route, modelId, messages, options = {}) {
    const text = flattenMessages(messages);
    if (route.transport === 'gemini_generate_content') {
        const system = messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n\n');
        const contents = messages.filter((message) => message.role !== 'system').map((message) => ({
            role: message.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: message.content }]
        }));
        const body = { contents };
        if (system) body.systemInstruction = { parts: [{ text: system }] };
        const generationConfig = {};
        if (options.maxOutputTokens) generationConfig.maxOutputTokens = options.maxOutputTokens;
        if (options.temperature !== undefined) generationConfig.temperature = options.temperature;
        if (options.responseFormat === 'json') generationConfig.responseMimeType = 'application/json';
        if (options.reasoningEffort && /^gemini-3(?:\.|-)/.test(modelId)) {
            const thinkingLevel = options.reasoningEffort === 'none' ? 'minimal' : options.reasoningEffort;
            if (['minimal', 'low', 'medium', 'high'].includes(thinkingLevel)) {
                generationConfig.thinkingConfig = { thinkingLevel };
            }
        }
        if (Object.keys(generationConfig).length) body.generationConfig = generationConfig;
        return { method: 'POST', path: `/v1beta/models/${encodeURIComponent(modelId)}:generateContent`, body };
    }
    if (route.transport === 'kie_responses') {
        return {
            method: 'POST', path: '/codex/v1/responses',
            body: {
                model: modelId,
                stream: false,
                input: text,
                reasoning: { effort: options.reasoningEffort || 'low' },
                ...(options.responseFormat === 'json' ? { text: { format: { type: 'json_object' } } } : {})
            }
        };
    }
    const body = { model: modelId, messages };
    if (options.maxOutputTokens) {
        body[route.provider === 'openai' ? 'max_completion_tokens' : 'max_tokens'] = options.maxOutputTokens;
    }
    if (options.temperature !== undefined) body.temperature = options.temperature;
    if (options.reasoningEffort && route.provider === 'openai') body.reasoning_effort = options.reasoningEffort;
    if (options.responseFormat === 'json') body.response_format = { type: 'json_object' };
    const path = route.provider === 'direct'
        ? '/chat/completions'
        : route.provider === 'kie'
        ? `/${encodeURIComponent(modelId)}/v1/chat/completions`
        : '/v1/chat/completions';
    return { method: 'POST', path, body };
}

function parseKieResponsesText(body) {
    if (typeof body?.output_text === 'string') return body.output_text.trim();
    return (Array.isArray(body?.output) ? body.output : [])
        .filter((item) => item?.type === 'message' && Array.isArray(item.content))
        .flatMap((item) => item.content)
        .filter((part) => part?.type === 'output_text')
        .map((part) => String(part.text || ''))
        .join('')
        .trim();
}

async function generateText(input, context, transport) {
    const route = resolveRoute('text', input.model);
    if (!route) throw new AiGatewayError('AI_GATEWAY_UNSUPPORTED_ROUTE', 'The selected text model is not supported by this Gateway.');
    try {
        throwIfAborted(context.signal);
        const request = buildTextRequest(route, input.model.modelId, input.messages, input.options);
        const response = await transport.request({
            provider: route.provider, kind: 'text', modelId: input.model.modelId,
            ...request, timeoutMs: 120000, signal: context.signal
        });
        const body = assertResponse(response, route.provider);
        const content = route.transport === 'gemini_generate_content'
            ? extractGeminiText(body)
            : (route.transport === 'kie_responses' ? parseKieResponsesText(body) : extractOpenAiText(body));
        if (!content) throw new AiGatewayError('AI_GATEWAY_EMPTY_RESPONSE', 'The AI provider returned no text.');
        const usage = normalizeUsage(body, route);
        return {
            content,
            model: { provider: route.provider, modelId: input.model.modelId },
            ...(Object.keys(usage).length ? { usage } : {}),
            ...(typeof body?.choices?.[0]?.finish_reason === 'string'
                ? { finishReason: body.choices[0].finish_reason }
                : (typeof body?.candidates?.[0]?.finishReason === 'string'
                    ? { finishReason: body.candidates[0].finishReason.toLowerCase() }
                    : {}))
        };
    } catch (error) {
        throw normalizeProviderError(error, route.provider);
    }
}

function buildKieImageRequest(modelId, prompt, options = {}) {
    const aspectRatio = options.aspectRatio || '4:3';
    const size = String(options.size || '1K').toUpperCase();
    const high = size === '2K';
    const input = { prompt, aspect_ratio: aspectRatio };
    if (modelId === 'nano-banana-2' || modelId === 'nano-banana-pro') {
        Object.assign(input, { image_input: [], resolution: size, output_format: 'png' });
    } else if (modelId === 'nano-banana-2-lite') {
        Object.assign(input, { image_input: [], resolution: String(options.size || '1K').toUpperCase(), output_format: 'png' });
    } else if (modelId === 'seedream/5-pro-text-to-image') {
        Object.assign(input, { quality: high ? 'high' : 'basic', output_format: 'png', nsfw_checker: true });
    } else if (modelId === 'seedream/4.5-text-to-image') {
        Object.assign(input, { quality: high ? 'high' : 'basic', nsfw_checker: false });
    } else if (modelId === 'gpt-image-2-text-to-image') {
        input.resolution = size;
    } else if (modelId === 'gpt-image-2-5-sunburst-text-to-image' || modelId === 'gpt-image-2-5-flare-text-to-image') {
        Object.assign(input, { resolution: size, background: 'opaque' });
    } else {
        // Catalog records determine which model IDs are available. The route
        // owns only the shared KIE task protocol; new catalog entries use its
        // generic prompt/aspect-ratio request shape unless a future protocol
        // contract requires an explicit adapter.
    }
    return { model: modelId, input };
}

function base64Image(data, mimeType = 'image/png') {
    if (typeof data !== 'string' || !data.trim()) return null;
    const normalized = data.replace(/^data:[^,]*,/, '').trim();
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(normalized)) return null;
    if (Buffer.from(normalized, 'base64').byteLength > MAX_IMAGE_BYTES) {
        throw new AiGatewayError('AI_GATEWAY_IMAGE_TOO_LARGE', 'The generated image exceeded the Gateway size limit.');
    }
    return { mimeType: normalizeImageMimeType(mimeType), dataBase64: normalized };
}

function normalizeImageMimeType(value) {
    const mimeType = String(value || 'image/png').split(';')[0].trim().toLowerCase();
    if (!/^image\/[a-z0-9.+-]+$/.test(mimeType)) {
        throw new AiGatewayError('AI_GATEWAY_INVALID_PROVIDER_RESPONSE', 'The AI provider returned an unsupported image type.');
    }
    return mimeType;
}

function collectGeminiImages(body) {
    return (body?.candidates?.[0]?.content?.parts || [])
        .filter((part) => part?.inlineData || part?.inline_data)
        .map((part) => part.inlineData || part.inline_data)
        .map((part) => base64Image(part.data, part.mimeType || part.mime_type))
        .filter(Boolean);
}

async function collectOpenAiImages(body, transport, route, modelId, signal) {
    const images = [];
    for (const item of Array.isArray(body?.data) ? body.data : []) {
        throwIfAborted(signal);
        if (item?.b64_json) {
            const image = base64Image(item.b64_json);
            if (image) images.push(image);
            continue;
        }
        const url = String(item?.url || '').trim();
        if (!url || typeof transport.downloadUrl !== 'function') continue;
        const downloaded = await transport.downloadUrl({ provider: route.provider, url, signal });
        const bytes = Buffer.from(downloaded?.bytes || downloaded || []);
        if (bytes.byteLength > MAX_IMAGE_BYTES) {
            throw new AiGatewayError('AI_GATEWAY_IMAGE_TOO_LARGE', 'The generated image exceeded the Gateway size limit.');
        }
        images.push({ mimeType: normalizeImageMimeType(downloaded?.mimeType), dataBase64: bytes.toString('base64') });
    }
    return images;
}

function normalizeJob(body) {
    const data = body?.data && typeof body.data === 'object' ? body.data : body;
    const state = String(data?.state || data?.status || '').trim().toLowerCase();
    let result = data?.resultJson || data?.result_json || {};
    if (typeof result === 'string') {
        try { result = JSON.parse(result); } catch (_error) { result = {}; }
    }
    const resultUrls = [
        ...(Array.isArray(result?.resultUrls) ? result.resultUrls : []),
        ...(Array.isArray(data?.resultUrls) ? data.resultUrls : []),
        ...(Array.isArray(data?.response?.resultUrls) ? data.response.resultUrls : [])
    ].map((value) => String(value || '').trim()).filter(Boolean);
    return {
        state,
        progress: Number.isFinite(Number(data?.progress)) ? Number(data.progress) : undefined,
        resultUrls,
        errorCode: String(data?.failCode || data?.errorCode || '').slice(0, 128)
    };
}

function retryablePollError(error) {
    const status = Number(error?.status || 0);
    return !status || status === 429 || status >= 500;
}

function retryableDownloadError(error) {
    if (error?.code?.startsWith?.('AI_GATEWAY_') || error instanceof TypeError) return false;
    const status = Number(error?.status || error?.response?.status || 0);
    return !status || status === 429 || status >= 500;
}

async function generateKieImage(input, context, transport, route, settings) {
    const requestBody = buildKieImageRequest(input.model.modelId, input.input.prompt, input.options);
    let submitted;
    try {
        submitted = assertResponse(await transport.request({
            provider: 'kie', kind: 'image', modelId: input.model.modelId,
            method: 'POST', path: '/api/v1/jobs/createTask', body: requestBody,
            timeoutMs: 30000
        }), 'kie');
    } catch (error) {
        if (context.signal?.aborted) throw canceled('unknown');
        throw error;
    }
    const taskId = String(submitted?.data?.taskId || submitted?.taskId || '').trim();
    if (!taskId) throw new AiGatewayError('AI_GATEWAY_INVALID_PROVIDER_RESPONSE', 'KIE did not return a generation job ID.');
    context.reportProgress?.({ phase: 'submitted' });
    if (context.signal?.aborted) throw canceled('may_continue');

    const startedAt = settings.now();
    let pollErrors = 0;
    let completed;
    while (true) {
        throwIfAborted(context.signal, 'may_continue');
        const elapsed = settings.now() - startedAt;
        if (elapsed >= settings.jobTimeoutMs) {
            throw new AiGatewayError('AI_GATEWAY_TIMEOUT', 'The KIE image job exceeded its wait limit.', { retryable: true, remoteOutcome: 'may_continue' });
        }
        const delay = elapsed < 30000 ? 2000 : (elapsed < 60000 ? 3000 : (elapsed < 180000 ? 5000 : 10000));
        await sleepWithSignal(Math.min(delay, settings.jobTimeoutMs - elapsed), context.signal, settings.sleep);
        let response;
        try {
            response = await transport.request({
                provider: 'kie', kind: 'image', modelId: input.model.modelId,
                method: 'GET', path: '/api/v1/jobs/recordInfo', query: { taskId },
                timeoutMs: 15000, signal: context.signal
            });
            completed = normalizeJob(assertResponse(response, 'kie'));
            pollErrors = 0;
        } catch (error) {
            if (context.signal?.aborted) throw canceled('may_continue');
            pollErrors += 1;
            if (!retryablePollError(error) || pollErrors > 5) {
                throw new AiGatewayError('AI_GATEWAY_PROVIDER_ERROR', 'KIE image job status could not be read.', {
                    retryable: false, remoteOutcome: 'may_continue'
                });
            }
            context.reportProgress?.({ phase: 'waiting' });
            continue;
        }
        const state = completed.state;
        if (state === 'success' || state === 'succeeded' || state === 'completed') break;
        if (state === 'fail' || state === 'failed') {
            throw new AiGatewayError('AI_GATEWAY_PROVIDER_ERROR', 'KIE image generation failed.', { remoteOutcome: 'may_continue' });
        }
        if (!PENDING_JOB_STATES.has(state)) {
            throw new AiGatewayError('AI_GATEWAY_INVALID_PROVIDER_RESPONSE', 'KIE returned an unknown image job state.', { remoteOutcome: 'may_continue' });
        }
        const progress = completed.progress;
        context.reportProgress?.({
            phase: state === 'generating' ? 'generating' : 'waiting',
            ...(Number.isFinite(progress) && progress >= 0 && progress <= 100 ? { progress } : {})
        });
    }

    const resultUrl = completed.resultUrls[0];
    if (!resultUrl || typeof transport.downloadUrl !== 'function') {
        throw new AiGatewayError('AI_GATEWAY_INVALID_PROVIDER_RESPONSE', 'KIE completed without a downloadable image.');
    }
    context.reportProgress?.({ phase: 'downloading' });
    let downloaded;
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        throwIfAborted(context.signal, 'may_continue');
        try {
            downloaded = await transport.downloadUrl({ provider: 'kie', url: resultUrl, signal: context.signal });
            lastError = null;
            break;
        } catch (error) {
            if (context.signal?.aborted) throw canceled('may_continue');
            if (!retryableDownloadError(error)) throw normalizeProviderError(error, 'kie');
            lastError = error;
            if (attempt < 2) await sleepWithSignal(1000 * (2 ** attempt), context.signal, settings.sleep);
        }
    }
    if (lastError) throw new AiGatewayError('AI_GATEWAY_PROVIDER_ERROR', 'The generated KIE image could not be downloaded.', { retryable: true, remoteOutcome: 'may_continue' });
    const bytes = Buffer.from(downloaded?.bytes || downloaded || []);
    if (bytes.byteLength > route.limits.maxImageBytes) {
        throw new AiGatewayError('AI_GATEWAY_IMAGE_TOO_LARGE', 'The generated image exceeded the Gateway size limit.', { remoteOutcome: 'may_continue' });
    }
    return [{ mimeType: normalizeImageMimeType(downloaded?.mimeType), dataBase64: bytes.toString('base64') }];
}

async function generateImage(input, context, transport, settings) {
    const route = resolveRoute('image', input.model);
    if (!route) throw new AiGatewayError('AI_GATEWAY_UNSUPPORTED_ROUTE', 'The selected image model is not supported by this Gateway.');
    const count = Number.isInteger(input.options?.count) ? input.options.count : route.limits.defaultCount;
    const requestedSize = String(input.options?.size || '1K').toUpperCase();
    if (count < 1 || count > route.limits.maxCount) {
        throw new AiGatewayError('AI_GATEWAY_IMAGE_COUNT_LIMIT_EXCEEDED', 'The requested image count exceeds this Gateway operation limit.');
    }
    try {
        throwIfAborted(context.signal);
        if (route.transport !== 'kie_market_image_jobs') context.reportProgress?.({ phase: 'generating' });
        let images;
        if (route.transport === 'kie_market_image_jobs') {
            images = await generateKieImage(input, context, transport, route, settings);
        } else if (route.transport === 'gemini_generate_content') {
            const body = {
                contents: [{ parts: [{ text: input.input.prompt }] }],
                generationConfig: {
                    responseModalities: ['IMAGE'],
                    imageConfig: input.options?.aspectRatio || input.options?.size
                        ? {
                            ...(input.options?.aspectRatio ? { aspectRatio: input.options.aspectRatio } : {}),
                            ...(input.options?.size ? { imageSize: requestedSize } : {})
                        }
                        : undefined
                }
            };
            const response = await transport.request({
                provider: route.provider, kind: 'image', modelId: input.model.modelId,
                method: 'POST', path: `/v1beta/models/${encodeURIComponent(input.model.modelId)}:generateContent`,
                body, timeoutMs: 180000, signal: context.signal
            });
            images = collectGeminiImages(assertResponse(response, route.provider));
        } else {
            const body = {
                model: input.model.modelId,
                prompt: input.input.prompt,
                n: count
            };
            if (route.provider === 'direct') body.response_format = 'b64_json';
            if (input.options?.aspectRatio) {
                // OpenAI-compatible image APIs take a finite set of pixel sizes,
                // not arbitrary ratios. Map what this adapter can represent;
                // otherwise forward the requested ratio as best effort so the
                // provider can accept or reject it at runtime.
                const mappedSize = imageSize(input.options.aspectRatio, input.options.size);
                if (mappedSize) body.size = mappedSize;
                else body.aspect_ratio = input.options.aspectRatio;
            }
            const response = await transport.request({
                provider: route.provider, kind: 'image', modelId: input.model.modelId,
                method: 'POST', path: route.provider === 'direct' ? '/images/generations' : '/v1/images/generations', body,
                timeoutMs: 180000, signal: context.signal
            });
            images = await collectOpenAiImages(assertResponse(response, route.provider), transport, route, input.model.modelId, context.signal);
        }
        throwIfAborted(context.signal, route.transport === 'kie_market_image_jobs' ? 'may_continue' : 'unknown');
        if (!Array.isArray(images) || images.length === 0) {
            throw new AiGatewayError('AI_GATEWAY_EMPTY_RESPONSE', 'The AI provider returned no images.');
        }
        if (images.length > count) images = images.slice(0, count);
        return { images, model: { provider: route.provider, modelId: input.model.modelId } };
    } catch (error) {
        throw normalizeProviderError(error, route.provider);
    }
}

function imageSize(aspectRatio, size = '1K') {
    const high = String(size).toUpperCase() === '2K';
    const sizes = {
        '1:1': high ? '2048x2048' : '1024x1024',
        '4:5': high ? '2048x2560' : '1024x1280',
        '3:2': high ? '2048x1365' : '1536x1024',
        '2:3': high ? '1365x2048' : '1024x1536',
        '4:3': high ? '2048x1536' : '1536x1152',
        '3:4': high ? '1536x2048' : '1152x1536',
        '16:9': high ? '2048x1152' : '1536x864',
        '9:16': high ? '1152x2048' : '864x1536'
    };
    return sizes[aspectRatio] || undefined;
}

function createGatewayOperations(options = {}) {
    const transport = options.transport;
    if (!transport || typeof transport.request !== 'function') {
        throw new TypeError('AI Gateway Plugin requires a Host-owned AI transport.');
    }
    const settings = {
        now: typeof options.now === 'function' ? options.now : Date.now,
        sleep: typeof options.sleep === 'function' ? options.sleep : (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        jobTimeoutMs: Number.isFinite(options.jobTimeoutMs) ? Math.max(1000, options.jobTimeoutMs) : DEFAULT_JOB_TIMEOUT_MS
    };
    const catalog = options.catalog;
    const listModels = async (input = {}) => {
        if (!catalog || typeof catalog.getCatalog !== 'function') {
            throw new AiGatewayError('AI_GATEWAY_CATALOG_UNAVAILABLE', 'The AI model catalog is not configured.');
        }
        if (typeof catalog.refresh === 'function') await catalog.refresh(input.forceRefresh === true);
        const snapshot = await catalog.getCatalog();
        if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.text) || !Array.isArray(snapshot.image)) {
            throw new AiGatewayError('AI_GATEWAY_CATALOG_INVALID', 'The AI model catalog returned an invalid snapshot.');
        }
        return {
            providers: {
                text: Array.isArray(snapshot.providers?.text) ? snapshot.providers.text : [],
                image: Array.isArray(snapshot.providers?.image) ? snapshot.providers.image : []
            },
            text: snapshot.text.filter((model) => resolveRoute('text', { provider: model.provider, modelId: model.code })
                ?.transport === model.transport),
            image: snapshot.image.filter((model) => resolveRoute('image', { provider: model.provider, modelId: model.code })
                ?.transport === model.transport),
            ...(typeof catalog.getStatus === 'function' ? { status: catalog.getStatus() } : {})
        };
    };
    return Object.freeze({
        'models.list': Object.freeze({ execute: listModels }),
        'text.generate': Object.freeze({ execute: (input, context = {}) => generateText(input, context, transport) }),
        'image.generate': Object.freeze({ execute: (input, context = {}) => generateImage(input, context, transport, settings) })
    });
}

module.exports = {
    AiGatewayError,
    buildKieImageRequest,
    buildTextRequest,
    createGatewayOperations,
    generateImage,
    generateText,
    imageSize,
    normalizeProviderError
};
