const SNS_SERVICE_POLICIES = Object.freeze({
    bluesky: Object.freeze({ limit: 300, linkLength: 22 }),
    threads: Object.freeze({ limit: 500 }),
    twitter: Object.freeze({ limit: 280 }),
    instagram: Object.freeze({ limit: 2200, imageRequired: true }),
    linkedin: Object.freeze({ limit: 3000 }),
    facebook: Object.freeze({ limit: 5000 }),
    pinterest: Object.freeze({ limit: 500 }),
    mastodon: Object.freeze({ limit: 500 }),
    googlebusiness: Object.freeze({ limit: 1500 }),
    startpage: Object.freeze({ limit: 5000 })
});

const SNS_DISABLED_SERVICES = Object.freeze(new Set([
    'tiktok',
    'youtube',
    'youtubeshorts'
]));

function normalizeSnsService(value) {
    const compact = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (compact === 'x' || compact === 'xcom' || compact === 'twitter' || compact === 'xtwitter') return 'twitter';
    if (compact === 'google' || compact === 'googlebusinessprofile') return 'googlebusiness';
    if (compact === 'startpages') return 'startpage';
    return compact;
}

function isSnsServiceSupported(value) {
    return Object.prototype.hasOwnProperty.call(SNS_SERVICE_POLICIES, normalizeSnsService(value));
}

function isSnsServiceDisabled(value) {
    return SNS_DISABLED_SERVICES.has(normalizeSnsService(value));
}

function requiresImageAsset(value) {
    return SNS_SERVICE_POLICIES[normalizeSnsService(value)]?.imageRequired === true;
}

function codePointLength(value) {
    return Array.from(String(value || '')).length;
}

function normalizeHashtagTokens(value, limit = 5) {
    const source = Array.isArray(value)
        ? value
        : String(value || '').split(/[\s,]+/);
    const seen = new Set();
    const normalized = [];
    for (const candidate of source) {
        const clean = String(candidate || '')
            .trim()
            .replace(/^#+/, '')
            .replace(/\s+/g, '_')
            .replace(/[^\p{L}\p{N}_]/gu, '');
        if (!clean || /^\d+$/.test(clean)) continue;
        const token = Array.from(clean).slice(0, 50).join('');
        const key = token.toLocaleLowerCase();
        if (!token || seen.has(key)) continue;
        seen.add(key);
        normalized.push(`#${token}`);
        if (normalized.length >= limit) break;
    }
    return normalized;
}

function renderPost(parts = {}) {
    const hashtags = normalizeHashtagTokens(parts.hashtags);
    return [
        String(parts.title || '').trim(),
        String(parts.summary || '').trim(),
        String(parts.url || '').trim(),
        hashtags.join(' ')
    ].filter(Boolean).join('\n\n');
}

function measurePost(text, service, url = '') {
    const policy = SNS_SERVICE_POLICIES[normalizeSnsService(service)];
    let length = codePointLength(text);
    const normalizedUrl = String(url || '').trim();
    if (policy?.linkLength && normalizedUrl && String(text || '').includes(normalizedUrl)) {
        length -= codePointLength(normalizedUrl);
        length += policy.linkLength;
    }
    return length;
}

function truncateComponentToFit(value, buildCandidate, measureCandidate, limit) {
    const points = Array.from(String(value || '').trim());
    if (points.length === 0) return '';
    let low = 0;
    let high = points.length;
    let best = '';
    while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        const candidate = middle >= points.length
            ? points.join('')
            : (middle > 0 ? `${points.slice(0, middle).join('').trimEnd()}…` : '');
        if (measureCandidate(buildCandidate(candidate)) <= limit) {
            best = candidate;
            low = middle + 1;
        } else {
            high = middle - 1;
        }
    }
    return best;
}

function formatSnsPost(input = {}) {
    const service = normalizeSnsService(input.service);
    const policy = SNS_SERVICE_POLICIES[service];
    if (!policy) {
        return {
            success: false,
            service,
            code: isSnsServiceDisabled(service) ? 'SNS_SERVICE_DISABLED' : 'SNS_SERVICE_UNSUPPORTED',
            message: `${input.service || 'unknown'} 채널은 SNS 자동 발행을 지원하지 않습니다.`
        };
    }

    const parts = {
        title: String(input.title || '').trim(),
        summary: String(input.summary || '').trim(),
        url: String(input.url || input.originalUrl || '').trim(),
        hashtags: normalizeHashtagTokens(input.hashtags)
    };
    const measure = (text) => measurePost(text, service, parts.url);
    const build = (overrides = {}) => renderPost({ ...parts, ...overrides });
    let text = build();

    if (measure(text) > policy.limit && parts.summary) {
        parts.summary = truncateComponentToFit(
            parts.summary,
            (summary) => build({ summary }),
            measure,
            policy.limit
        );
        text = build();
    }
    while (measure(text) > policy.limit && parts.hashtags.length > 0) {
        parts.hashtags.pop();
        text = build();
    }
    if (measure(text) > policy.limit && parts.title) {
        parts.title = truncateComponentToFit(
            parts.title,
            (title) => build({ title }),
            measure,
            policy.limit
        );
        text = build();
    }

    const characterCount = measure(text);
    if (!text || characterCount > policy.limit) {
        return {
            success: false,
            service,
            code: 'SNS_CONTENT_TOO_LONG',
            message: `${input.service || service} 글자 수 제한 안에 원문 URL을 보존할 수 없습니다.`,
            limit: policy.limit,
            characterCount
        };
    }
    return {
        success: true,
        service,
        text,
        limit: policy.limit,
        characterCount,
        usedHashtags: parts.hashtags,
        summaryTruncated: parts.summary !== String(input.summary || '').trim(),
        titleTruncated: parts.title !== String(input.title || '').trim()
    };
}

module.exports = {
    SNS_SERVICE_POLICIES,
    SNS_DISABLED_SERVICES,
    normalizeSnsService,
    isSnsServiceSupported,
    isSnsServiceDisabled,
    requiresImageAsset,
    codePointLength,
    normalizeHashtagTokens,
    renderPost,
    measurePost,
    formatSnsPost
};
