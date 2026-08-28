'use strict';

const { createKnowledgeServerGatewayClient } = require('../knowledge/server-gateway-client');

const REFERENCE_KIND = 'blog_reference';
const REFERENCE_PURPOSE = 'writing_reference';
const MAX_REFERENCE_RESULTS = 5;

function compact(value, maxLength) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function safeHttpsUrl(value) {
    try {
        const parsed = new URL(compact(value, 2048));
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return '';
        parsed.hash = '';
        return parsed.toString();
    } catch (_error) {
        return '';
    }
}

function formatPostDate(value) {
    const parsed = Date.parse(compact(value, 80));
    if (!Number.isFinite(parsed)) return '';
    const date = new Date(parsed);
    return [
        String(date.getUTCFullYear()).padStart(4, '0'),
        String(date.getUTCMonth() + 1).padStart(2, '0'),
        String(date.getUTCDate()).padStart(2, '0')
    ].join('');
}

function normalizeReferenceSnapshot(snapshot, requestedLimit) {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
        throw new Error('invalid reference snapshot');
    }
    if (Number(snapshot.schema_version) !== 1
        || snapshot.kind !== REFERENCE_KIND
        || snapshot.transport !== 'server_gateway') {
        throw new Error('invalid reference snapshot identity');
    }
    if (!Array.isArray(snapshot.items) || snapshot.items.length > MAX_REFERENCE_RESULTS) {
        throw new Error('invalid reference snapshot items');
    }
    const limit = Math.max(1, Math.min(MAX_REFERENCE_RESULTS, Number(requestedLimit) || 3));
    const result = [];
    const seen = new Set();
    for (const raw of snapshot.items) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
        const title = compact(raw.title, 300);
        const link = safeHttpsUrl(raw.url);
        const postdate = formatPostDate(raw.published_at);
        if (!title || !link || !postdate || seen.has(link)) continue;
        seen.add(link);
        result.push({ title, link, postdate });
        if (result.length >= limit) break;
    }
    return result;
}

function createReferenceSearchGateway(options = {}) {
    const serverGatewayClient = options.serverGatewayClient || createKnowledgeServerGatewayClient({
        config: options.config,
        License: options.License,
        createClient: options.createClient,
        timeoutMs: options.timeoutMs
    });

    return {
        async searchLatestReferences(input = {}) {
            const topic = compact(input.topic, 180);
            if (!topic) return [];
            const requestedLimit = Number(input.limit || 3);
            const limit = Math.max(
                1,
                Math.min(MAX_REFERENCE_RESULTS, Number.isFinite(requestedLimit) ? Math.floor(requestedLimit) : 3)
            );
            const snapshot = await serverGatewayClient.fetchSnapshot({
                kind: REFERENCE_KIND,
                purpose: REFERENCE_PURPOSE,
                query: { topic, locale: 'ko-KR', country: 'KR', limit }
            });
            return normalizeReferenceSnapshot(snapshot, limit);
        }
    };
}

async function searchOptionalReferences(gateway, input = {}, onFailure = () => {}) {
    try {
        return await gateway.searchLatestReferences(input);
    } catch (error) {
        onFailure(error);
        return [];
    }
}

module.exports = {
    MAX_REFERENCE_RESULTS,
    REFERENCE_KIND,
    REFERENCE_PURPOSE,
    createReferenceSearchGateway,
    normalizeReferenceSnapshot,
    searchOptionalReferences
};
