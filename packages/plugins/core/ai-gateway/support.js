'use strict';

const KIE_TEXT_RESPONSES = Object.freeze([
    'gpt-6-astra', 'gpt-5-6-sol', 'gpt-5-6-terra', 'gpt-5-6-luna'
]);
const KIE_TEXT_CHAT = Object.freeze([
    'gemini-3-8-flash-openai', 'gemini-3-6-flash-openai', 'gemini-3-5-flash-openai', 'gemini-3.1-pro'
]);
const KIE_IMAGE_MODELS = Object.freeze([
    'gpt-image-2-5-sunburst-text-to-image',
    'gpt-image-2-5-flare-text-to-image',
    'gpt-image-2-text-to-image',
    'nano-banana-2-lite',
    'nano-banana-2',
    'nano-banana-pro',
    'seedream/4.5-text-to-image',
    'seedream/5-pro-text-to-image'
]);
const KIE_IMAGE_SIZES = Object.freeze(Object.fromEntries(KIE_IMAGE_MODELS.map((modelId) => [
    modelId,
    Object.freeze(modelId === 'nano-banana-2-lite' ? ['1K'] : ['1K', '2K'])
])));

const ROUTES = Object.freeze([
    { kind: 'text', provider: 'google', transport: 'gemini_generate_content', modelIds: null, jsonMode: true },
    { kind: 'text', provider: 'openai', transport: 'openai_chat_completions', modelIds: null, jsonMode: true },
    { kind: 'text', provider: 'direct', transport: 'openai_chat_completions', modelIds: null, jsonMode: false },
    { kind: 'text', provider: 'anthropic', transport: 'anthropic_openai_compat', modelIds: null, jsonMode: false },
    { kind: 'text', provider: 'kie', transport: 'kie_responses', modelIds: KIE_TEXT_RESPONSES, jsonMode: false },
    { kind: 'text', provider: 'kie', transport: 'kie_openai_chat', modelIds: KIE_TEXT_CHAT, jsonMode: false },
    {
        kind: 'image', provider: 'google', transport: 'gemini_generate_content',
        modelIds: Object.freeze(['gemini-nano-banana-2.1', 'gemini-3.1-flash-image', 'gemini-3.1-flash-lite-image']),
        aspectRatios: Object.freeze(['1:1', '4:5', '9:16']),
        supportedSizesByModel: Object.freeze({
            'gemini-nano-banana-2.1': Object.freeze(['1K']),
            'gemini-3.1-flash-image': Object.freeze(['1K']),
            'gemini-3.1-flash-lite-image': Object.freeze(['1K'])
        }),
        limits: Object.freeze({ defaultCount: 1, maxCount: 1, maxImageBytes: 10485760 })
    },
    {
        kind: 'image', provider: 'openai', transport: 'openai_images',
        modelIds: Object.freeze(['gpt-image-2.5-sunburst', 'gpt-image-2.5-flare', 'gpt-image-2']),
        aspectRatios: Object.freeze(['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16']),
        supportedSizesByModel: Object.freeze({
            'gpt-image-2.5-sunburst': Object.freeze(['1K', '2K']),
            'gpt-image-2.5-flare': Object.freeze(['1K', '2K']),
            'gpt-image-2': Object.freeze(['1K', '2K'])
        }),
        limits: Object.freeze({ defaultCount: 1, maxCount: 4, maxImageBytes: 10485760 })
    },
    {
        kind: 'image', provider: 'direct', transport: 'openai_images', modelIds: null,
        limits: Object.freeze({ defaultCount: 1, maxCount: 4, maxImageBytes: 10485760 })
    },
    {
        kind: 'image', provider: 'kie', transport: 'kie_market_image_jobs', modelIds: KIE_IMAGE_MODELS,
        supportedSizesByModel: KIE_IMAGE_SIZES,
        limits: Object.freeze({ defaultCount: 1, maxCount: 1, maxImageBytes: 10485760 })
    }
]);

function describeSupport() {
    return Object.freeze({
        supportVersion: 1,
        routes: Object.freeze(ROUTES.map((route) => Object.freeze({
            ...route,
            ...(route.modelIds ? { modelIds: Object.freeze([...route.modelIds]) } : {}),
            ...(route.aspectRatios ? { aspectRatios: Object.freeze([...route.aspectRatios]) } : {}),
            ...(route.supportedSizesByModel ? { supportedSizesByModel: Object.freeze(Object.fromEntries(
                Object.entries(route.supportedSizesByModel).map(([modelId, sizes]) => [modelId, Object.freeze([...sizes])])
            )) } : {}),
            ...(route.limits ? { limits: Object.freeze({ ...route.limits }) } : {})
        })))
    });
}

function resolveRoute(kind, model = {}) {
    const provider = String(model.provider || '').trim().toLowerCase();
    const modelId = String(model.modelId || '').trim();
    if (!provider || !modelId) return null;
    return ROUTES.find((route) => route.kind === kind
        && route.provider === provider
        && (!route.modelIds || route.modelIds.includes(modelId))) || null;
}

module.exports = { describeSupport, resolveRoute };
