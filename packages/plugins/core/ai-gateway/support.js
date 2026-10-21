'use strict';

// Option inventories below are discovery hints from maintained references.
// Runtime compatibility must be decided by the selected Provider response.
const GEMINI_IMAGE_ASPECT_RATIOS = Object.freeze([
    '1:1', '1:4', '1:8', '2:3', '3:2', '3:4', '4:1', '4:3', '4:5', '5:4', '8:1', '9:16', '16:9', '21:9'
]);
const ROUTES = Object.freeze([
    { kind: 'text', provider: 'google', transport: 'gemini_generate_content', jsonMode: true },
    { kind: 'text', provider: 'openai', transport: 'openai_chat_completions', jsonMode: true },
    { kind: 'text', provider: 'direct', transport: 'openai_chat_completions', jsonMode: false },
    { kind: 'text', provider: 'anthropic', transport: 'anthropic_openai_compat', jsonMode: false },
    { kind: 'text', provider: 'kie', transport: 'kie_responses', jsonMode: false },
    { kind: 'text', provider: 'kie', transport: 'kie_openai_responses', jsonMode: false },
    { kind: 'text', provider: 'kie', transport: 'kie_grok_responses', jsonMode: false },
    { kind: 'text', provider: 'kie', transport: 'kie_openai_chat', jsonMode: false },
    { kind: 'text', provider: 'kie', transport: 'kie_claude_messages', jsonMode: false },
    {
        kind: 'image', provider: 'google', transport: 'gemini_generate_content',
        aspectRatios: GEMINI_IMAGE_ASPECT_RATIOS,
        limits: Object.freeze({ defaultCount: 1, maxCount: 1, maxImageBytes: 10485760 })
    },
    {
        kind: 'image', provider: 'openai', transport: 'openai_images',
        aspectRatios: Object.freeze(['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16']),
        limits: Object.freeze({ defaultCount: 1, maxCount: 4, maxImageBytes: 10485760 })
    },
    {
        kind: 'image', provider: 'direct', transport: 'openai_images',
        limits: Object.freeze({ defaultCount: 1, maxCount: 4, maxImageBytes: 10485760 })
    },
    {
        kind: 'image', provider: 'kie', transport: 'kie_market_image_jobs',
        limits: Object.freeze({ defaultCount: 1, maxCount: 1, maxImageBytes: 10485760 })
    }
]);

function describeSupport() {
    return Object.freeze({
        supportVersion: 1,
        routes: Object.freeze(ROUTES.map((route) => Object.freeze({
            ...route,
            ...(route.aspectRatios ? { aspectRatios: Object.freeze([...route.aspectRatios]) } : {}),
            ...(route.limits ? { limits: Object.freeze({ ...route.limits }) } : {})
        })))
    });
}

function resolveRoute(kind, model = {}) {
    const provider = String(model.provider || '').trim().toLowerCase();
    const modelId = String(model.modelId || '').trim();
    const transport = String(model.transport || '').trim();
    if (!provider || !modelId) return null;
    return ROUTES.find((route) => route.kind === kind
        && route.provider === provider
        && (!transport || route.transport === transport)) || null;
}

module.exports = { describeSupport, resolveRoute };
