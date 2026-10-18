'use strict';

// Provider endpoints are Gateway-owned transport configuration, not catalog data.
const PROVIDER_ENDPOINTS = Object.freeze({
    google: 'https://generativelanguage.googleapis.com',
    openai: 'https://api.openai.com',
    anthropic: 'https://api.anthropic.com',
    kie: 'https://api.kie.ai'
});

const CLAUDE_OPENAI_BASE_URL = `${PROVIDER_ENDPOINTS.anthropic}/v1`;
const KIE_BASE_URL = PROVIDER_ENDPOINTS.kie;
const OPENAI_BASE_URL = `${PROVIDER_ENDPOINTS.openai}/v1`;

module.exports = {
    CLAUDE_OPENAI_BASE_URL,
    KIE_BASE_URL,
    OPENAI_BASE_URL,
    PROVIDER_ENDPOINTS
};
