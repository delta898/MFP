const SMART_USAGE_CAPABILITIES = Object.freeze({
    content_idea: {
        label: '글감 추천',
        defaultRequestLimit: 2
    },
    keyword_discovery: {
        label: '키워드 탐색',
        defaultRequestLimit: 5
    },
    title_recommendation: {
        label: 'AI 제목 추천',
        defaultRequestLimit: 2
    }
});

function normalizeCapability(value) {
    const capability = String(value || '').trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(SMART_USAGE_CAPABILITIES, capability)
        ? capability
        : '';
}

function getCapabilityLabel(value) {
    const capability = normalizeCapability(value);
    return capability ? SMART_USAGE_CAPABILITIES[capability].label : '';
}

function normalizeSmartUsageItems(value) {
    const items = Array.isArray(value) ? value : [];
    return items
        .map((item) => {
            const capability = normalizeCapability(item?.capability);
            if (!capability) return null;
            const limit = Number(item?.limit);
            const used = Number(item?.used);
            const remaining = Number(item?.remaining);
            return {
                capability,
                label: getCapabilityLabel(capability),
                limit: Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0,
                used: Number.isFinite(used) ? Math.max(0, Math.floor(used)) : 0,
                remaining: Number.isFinite(remaining) ? Math.max(0, Math.floor(remaining)) : 0,
                requestLimit: Number.isFinite(Number(item?.request_limit))
                    ? Math.max(1, Math.floor(Number(item.request_limit)))
                    : SMART_USAGE_CAPABILITIES[capability].defaultRequestLimit,
                requestsRemaining: Number.isFinite(Number(item?.requests_remaining))
                    ? Math.max(0, Math.floor(Number(item.requests_remaining)))
                    : null
            };
        })
        .filter(Boolean);
}

module.exports = {
    SMART_USAGE_CAPABILITIES,
    normalizeCapability,
    getCapabilityLabel,
    normalizeSmartUsageItems
};
