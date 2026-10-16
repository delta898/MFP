'use strict';

// Provider endpoints are transport configuration, not a model inventory.
// Model/provider choices come exclusively from the Supabase AI catalog.
const CLAUDE_OPENAI_BASE_URL = 'https://api.anthropic.com/v1';
const KIE_BASE_URL = 'https://api.kie.ai';
const OPENAI_BASE_URL = 'https://api.openai.com/v1';

function getBundledAiModelCatalog() {
    return { providers: { text: [], image: [] }, text: [], image: [] };
}

module.exports = {
    CLAUDE_OPENAI_BASE_URL,
    KIE_BASE_URL,
    OPENAI_BASE_URL,
    getBundledAiModelCatalog
};
