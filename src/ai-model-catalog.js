const CLAUDE_OPENAI_BASE_URL = 'https://api.anthropic.com/v1';
const KIE_BASE_URL = 'https://api.kie.ai';
const OPENAI_BASE_URL = 'https://api.openai.com/v1';

const PROVIDER_PRESETS = Object.freeze({
    text: Object.freeze([
        Object.freeze({ id: 'openai', name: 'ChatGPT', sort_order: 10 }),
        Object.freeze({ id: 'anthropic', name: 'Claude', sort_order: 20 }),
        Object.freeze({ id: 'gemini', name: 'Gemini', sort_order: 30 }),
        Object.freeze({ id: 'kie', name: 'KIE.ai', sort_order: 40 })
    ]),
    image: Object.freeze([
        Object.freeze({ id: 'openai', name: 'ChatGPT', sort_order: 10 }),
        Object.freeze({ id: 'gemini', name: 'Gemini', sort_order: 20 }),
        Object.freeze({ id: 'imagen4', name: 'Imagen 4', sort_order: 30 })
    ])
});

const TEXT_MODEL_PRESETS = Object.freeze([
    {
        key: 'openai:gpt-5.6-sol',
        name: 'GPT-5.6 Sol',
        code: 'gpt-5.6-sol',
        provider: 'openai',
        transport: 'openai_chat_completions',
        base_url: OPENAI_BASE_URL,
        status: 'active',
        sort_order: 10,
        capabilities: { temperature: false, structured_output: true, image_input: true }
    },
    {
        key: 'openai:gpt-5.6-terra',
        name: 'GPT-5.6 Terra',
        code: 'gpt-5.6-terra',
        provider: 'openai',
        transport: 'openai_chat_completions',
        base_url: OPENAI_BASE_URL,
        status: 'active',
        sort_order: 20,
        capabilities: { temperature: false, structured_output: true, image_input: true }
    },
    {
        key: 'openai:gpt-5.6-luna',
        name: 'GPT-5.6 Luna',
        code: 'gpt-5.6-luna',
        provider: 'openai',
        transport: 'openai_chat_completions',
        base_url: OPENAI_BASE_URL,
        status: 'active',
        sort_order: 30,
        capabilities: { temperature: false, structured_output: true, image_input: true }
    },
    {
        key: 'gemini:gemini-3.6-flash',
        name: 'Gemini 3.6 Flash',
        code: 'gemini-3.6-flash',
        provider: 'gemini',
        transport: 'gemini_generate_content',
        base_url: '',
        status: 'active',
        sort_order: 10,
        capabilities: { temperature: false, structured_output: true, image_input: true }
    },
    {
        key: 'gemini:gemini-3.1-pro-preview',
        name: 'Gemini 3.1 Pro Preview',
        code: 'gemini-3.1-pro-preview',
        provider: 'gemini',
        transport: 'gemini_generate_content',
        base_url: '',
        status: 'preview',
        sort_order: 30,
        capabilities: { temperature: true, structured_output: true, image_input: true }
    },
    {
        key: 'gemini:gemini-3.5-flash',
        name: 'Gemini 3.5 Flash',
        code: 'gemini-3.5-flash',
        provider: 'gemini',
        transport: 'gemini_generate_content',
        base_url: '',
        status: 'active',
        sort_order: 20,
        capabilities: { temperature: true, structured_output: true, image_input: true }
    },
    {
        key: 'gemini:gemini-3.1-flash-lite',
        name: 'Gemini 3.1 Flash-Lite',
        code: 'gemini-3.1-flash-lite',
        provider: 'gemini',
        transport: 'gemini_generate_content',
        base_url: '',
        status: 'active',
        sort_order: 40,
        capabilities: { temperature: true, structured_output: true, image_input: true }
    },
    {
        key: 'anthropic:claude-fable-5',
        name: 'Claude Fable 5',
        code: 'claude-fable-5',
        provider: 'anthropic',
        transport: 'anthropic_openai_compat',
        base_url: CLAUDE_OPENAI_BASE_URL,
        status: 'active',
        sort_order: 10,
        capabilities: { temperature: true, structured_output: false, image_input: true }
    },
    {
        key: 'anthropic:claude-opus-5',
        name: 'Claude Opus 5',
        code: 'claude-opus-5',
        provider: 'anthropic',
        transport: 'anthropic_openai_compat',
        base_url: CLAUDE_OPENAI_BASE_URL,
        status: 'active',
        sort_order: 20,
        capabilities: { temperature: true, structured_output: false, image_input: true }
    },
    {
        key: 'anthropic:claude-sonnet-5',
        name: 'Claude Sonnet 5',
        code: 'claude-sonnet-5',
        provider: 'anthropic',
        transport: 'anthropic_openai_compat',
        base_url: CLAUDE_OPENAI_BASE_URL,
        status: 'active',
        sort_order: 30,
        capabilities: { temperature: true, structured_output: false, image_input: true }
    },
    {
        key: 'kie:gpt-5-6-sol',
        name: 'GPT 5.6 Sol',
        code: 'gpt-5-6-sol',
        provider: 'kie',
        transport: 'kie_responses',
        base_url: KIE_BASE_URL,
        status: 'active',
        sort_order: 10,
        capabilities: { temperature: false, structured_output: false, image_input: false }
    },
    {
        key: 'kie:gpt-5-6-terra',
        name: 'GPT 5.6 Terra',
        code: 'gpt-5-6-terra',
        provider: 'kie',
        transport: 'kie_responses',
        base_url: KIE_BASE_URL,
        status: 'active',
        sort_order: 20,
        capabilities: { temperature: false, structured_output: false, image_input: false }
    },
    {
        key: 'kie:gpt-5-6-luna',
        name: 'GPT 5.6 Luna',
        code: 'gpt-5-6-luna',
        provider: 'kie',
        transport: 'kie_responses',
        base_url: KIE_BASE_URL,
        status: 'active',
        sort_order: 30,
        capabilities: { temperature: false, structured_output: false, image_input: false }
    },
    {
        key: 'kie:gemini-3-6-flash-openai',
        name: 'Gemini 3.6 Flash',
        code: 'gemini-3-6-flash-openai',
        provider: 'kie',
        transport: 'kie_openai_chat',
        base_url: KIE_BASE_URL,
        status: 'active',
        sort_order: 40,
        capabilities: { temperature: false, structured_output: false, image_input: false }
    },
    {
        key: 'kie:gemini-3-5-flash-openai',
        name: 'Gemini 3.5 Flash',
        code: 'gemini-3-5-flash-openai',
        provider: 'kie',
        transport: 'kie_openai_chat',
        base_url: KIE_BASE_URL,
        status: 'active',
        sort_order: 50,
        capabilities: { temperature: true, structured_output: false, image_input: false }
    },
    {
        key: 'kie:gemini-3.1-pro',
        name: 'Gemini 3.1 Pro',
        code: 'gemini-3.1-pro',
        provider: 'kie',
        transport: 'kie_openai_chat',
        base_url: KIE_BASE_URL,
        status: 'active',
        sort_order: 60,
        capabilities: { temperature: true, structured_output: false, image_input: false }
    },
    { key: 'anthropic:claude-opus-4-6', name: 'Claude Opus 4.6', code: 'claude-opus-4-6', provider: 'anthropic', transport: 'anthropic_openai_compat', base_url: CLAUDE_OPENAI_BASE_URL, status: 'active', sort_order: 40, capabilities: { temperature: true, structured_output: false, image_input: true } },
    { key: 'anthropic:claude-sonnet-4-6', name: 'Claude Sonnet 4.6', code: 'claude-sonnet-4-6', provider: 'anthropic', transport: 'anthropic_openai_compat', base_url: CLAUDE_OPENAI_BASE_URL, status: 'active', sort_order: 50, capabilities: { temperature: true, structured_output: false, image_input: true } },
    { key: 'anthropic:claude-haiku-4-5', name: 'Claude Haiku 4.5', code: 'claude-haiku-4-5', provider: 'anthropic', transport: 'anthropic_openai_compat', base_url: CLAUDE_OPENAI_BASE_URL, status: 'active', sort_order: 80, capabilities: { temperature: true, structured_output: false, image_input: true } },
    { key: 'anthropic:claude-opus-4-5', name: 'Claude Opus 4.5', code: 'claude-opus-4-5', provider: 'anthropic', transport: 'anthropic_openai_compat', base_url: CLAUDE_OPENAI_BASE_URL, status: 'active', sort_order: 60, capabilities: { temperature: true, structured_output: false, image_input: true } },
    { key: 'anthropic:claude-sonnet-4-5', name: 'Claude Sonnet 4.5', code: 'claude-sonnet-4-5', provider: 'anthropic', transport: 'anthropic_openai_compat', base_url: CLAUDE_OPENAI_BASE_URL, status: 'active', sort_order: 70, capabilities: { temperature: true, structured_output: false, image_input: true } }
].map((item) => Object.freeze(item)));

const IMAGE_MODEL_PRESETS = Object.freeze([
    {
        key: 'openai:gpt-image-2',
        name: 'GPT Image 2',
        code: 'gpt-image-2',
        provider: 'openai',
        transport: 'openai_images',
        base_url: OPENAI_BASE_URL,
        status: 'active',
        sort_order: 10,
        capabilities: {
            response_format: false,
            arbitrary_size: true,
            output_format: ['png', 'jpeg', 'webp'],
            quality: ['low', 'medium', 'high', 'auto']
        }
    },
    { key: 'gemini:gemini-3.1-flash-image', name: 'Nano Banana 2', code: 'gemini-3.1-flash-image', provider: 'gemini', transport: 'gemini_generate_content', base_url: '', status: 'active', sort_order: 10, capabilities: { aspect_ratio: true } },
    { key: 'gemini:gemini-3-pro-image', name: 'Nano Banana Pro', code: 'gemini-3-pro-image', provider: 'gemini', transport: 'gemini_generate_content', base_url: '', status: 'active', sort_order: 20, capabilities: { aspect_ratio: true } },
    { key: 'gemini:gemini-2.5-flash-image', name: 'Nano Banana (Gemini 2.5)', code: 'gemini-2.5-flash-image', provider: 'gemini', transport: 'gemini_generate_content', base_url: '', status: 'active', sort_order: 30, capabilities: { aspect_ratio: true } },
    { key: 'imagen4:imagen-4.0-generate-001', name: 'Imagen 4', code: 'imagen-4.0-generate-001', provider: 'imagen4', transport: 'imagen_predict', base_url: '', status: 'active', sort_order: 20, capabilities: { aspect_ratio: true, image_size: ['1K', '2K'] } },
    { key: 'imagen4:imagen-4.0-ultra-generate-001', name: 'Imagen 4 Ultra', code: 'imagen-4.0-ultra-generate-001', provider: 'imagen4', transport: 'imagen_predict', base_url: '', status: 'active', sort_order: 10, capabilities: { aspect_ratio: true, image_size: ['1K', '2K'] } },
    { key: 'imagen4:imagen-4.0-fast-generate-001', name: 'Imagen 4 Fast', code: 'imagen-4.0-fast-generate-001', provider: 'imagen4', transport: 'imagen_predict', base_url: '', status: 'active', sort_order: 30, capabilities: { aspect_ratio: true, image_size: ['1K'] } }
].map((item) => Object.freeze(item)));

const DEFAULT_MODEL_CODES = {
    text: 'gemini-3.1-flash-lite',
    image: 'gemini-3.1-flash-image'
};

function clonePresetList(list = []) {
    return list.map((item) => ({ ...item }));
}

function getBundledAiModelCatalog() {
    return {
        providers: {
            text: clonePresetList(PROVIDER_PRESETS.text),
            image: clonePresetList(PROVIDER_PRESETS.image)
        },
        text: clonePresetList(TEXT_MODEL_PRESETS),
        image: clonePresetList(IMAGE_MODEL_PRESETS)
    };
}

module.exports = {
    CLAUDE_OPENAI_BASE_URL,
    KIE_BASE_URL,
    OPENAI_BASE_URL,
    DEFAULT_MODEL_CODES,
    getBundledAiModelCatalog
};
