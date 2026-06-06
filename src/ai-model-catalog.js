const CLAUDE_OPENAI_BASE_URL = 'https://api.anthropic.com/v1';

const TEXT_MODEL_PRESETS = Object.freeze([
    { name: 'Gemini 3.1 Pro Preview', code: 'gemini-3.1-pro-preview', provider: 'gemini', base_url: '' },
    { name: 'Gemini 3.5 Flash', code: 'gemini-3.5-flash', provider: 'gemini', base_url: '' },
    { name: 'Gemini 3.1 Flash-Lite', code: 'gemini-3.1-flash-lite', provider: 'gemini', base_url: '' },
    { name: 'Claude Opus 4.6', code: 'claude-opus-4-6', provider: 'anthropic', base_url: CLAUDE_OPENAI_BASE_URL },
    { name: 'Claude Sonnet 4.6', code: 'claude-sonnet-4-6', provider: 'anthropic', base_url: CLAUDE_OPENAI_BASE_URL },
    { name: 'Claude Haiku 4.5', code: 'claude-haiku-4-5', provider: 'anthropic', base_url: CLAUDE_OPENAI_BASE_URL },
    { name: 'Claude Opus 4.5', code: 'claude-opus-4-5', provider: 'anthropic', base_url: CLAUDE_OPENAI_BASE_URL },
    { name: 'Claude Sonnet 4.5', code: 'claude-sonnet-4-5', provider: 'anthropic', base_url: CLAUDE_OPENAI_BASE_URL }
].map((item) => Object.freeze(item)));

const IMAGE_MODEL_PRESETS = Object.freeze([
    { name: 'Nano Banana 2', code: 'gemini-3.1-flash-image', provider: 'gemini', base_url: '' },
    { name: 'Nano Banana Pro', code: 'gemini-3-pro-image', provider: 'gemini', base_url: '' },
    { name: 'Nano Banana (Gemini 2.5)', code: 'gemini-2.5-flash-image', provider: 'gemini', base_url: '' },
    { name: 'Imagen 4', code: 'imagen-4.0-generate-001', provider: 'imagen4', base_url: '' },
    { name: 'Imagen 4 Ultra', code: 'imagen-4.0-ultra-generate-001', provider: 'imagen4', base_url: '' },
    { name: 'Imagen 4 Fast', code: 'imagen-4.0-fast-generate-001', provider: 'imagen4', base_url: '' }
].map((item) => Object.freeze(item)));

const DEFAULT_MODEL_CODES = {
    text: 'gemini-3.1-flash-lite',
    image: 'gemini-3.1-flash-image'
};

function clonePresetList(list = []) {
    return list.map((item) => ({ ...item }));
}

function getAiModelCatalog() {
    return {
        text: clonePresetList(TEXT_MODEL_PRESETS),
        image: clonePresetList(IMAGE_MODEL_PRESETS)
    };
}

module.exports = {
    CLAUDE_OPENAI_BASE_URL,
    DEFAULT_MODEL_CODES,
    getAiModelCatalog
};
