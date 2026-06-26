const crypto = require('crypto');

function normalizeOperationPart(value) {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._:-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
}

function createPublishOperationId({ scope = 'publish', stableKey = '', postStatus = 'publish' } = {}) {
    const normalizedScope = normalizeOperationPart(scope) || 'publish';
    const normalizedStatus = normalizeOperationPart(postStatus) || 'publish';
    const normalizedKey = normalizeOperationPart(stableKey);
    if (normalizedKey) {
        return `${normalizedScope}:${normalizedKey}:${normalizedStatus}`.slice(0, 160);
    }
    return `${normalizedScope}:${crypto.randomUUID()}:${normalizedStatus}`;
}

function hasSuccessfulPlatformResult(results) {
    return Object.values(results || {}).some((result) => result?.success === true);
}

function buildPublishQuotaPreflight(selectedCount, licenseStatus = {}) {
    const selected = Math.max(0, Number.parseInt(selectedCount, 10) || 0);
    const remaining = Number(licenseStatus?.remaining);
    const unlimited = remaining === -1;
    const normalizedRemaining = unlimited
        ? -1
        : Math.max(0, Number.isFinite(remaining) ? Math.trunc(remaining) : 0);
    const executable = unlimited ? selected : Math.min(selected, normalizedRemaining);
    return {
        selected,
        remaining: normalizedRemaining,
        executable,
        unlimited,
        message: `${selected}건 선택 · 잔여 ${unlimited ? '무제한' : `${normalizedRemaining}회`} · 최대 ${executable}건 실행`
    };
}

async function settlePublishQuota({ License, operationId, results, metadata = {} } = {}) {
    if (!License || !operationId) {
        throw new Error('quota settlement requires License and operationId');
    }
    if (hasSuccessfulPlatformResult(results)) {
        return License.commitPublishQuota(operationId, metadata);
    }
    return License.releasePublishQuota(operationId, metadata);
}

module.exports = {
    buildPublishQuotaPreflight,
    createPublishOperationId,
    hasSuccessfulPlatformResult,
    settlePublishQuota
};
