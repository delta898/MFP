'use strict';

const crypto = require('node:crypto');

function compact(value, maxLength = 4000) {
    return String(value || '').trim().slice(0, maxLength);
}

function normalizeOriginalUrl(rawUrl) {
    const raw = compact(rawUrl);
    if (!raw) return '';
    let parsed;
    try {
        parsed = new URL(raw);
    } catch (_error) {
        throw new Error('카드뉴스 원문 URL이 올바르지 않습니다.');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('카드뉴스 원문 URL은 HTTP 또는 HTTPS 주소여야 합니다.');
    }
    parsed.hash = '';
    parsed.hostname = parsed.hostname.toLowerCase();
    if ((parsed.protocol === 'https:' && parsed.port === '443') || (parsed.protocol === 'http:' && parsed.port === '80')) parsed.port = '';
    const retainedParams = [...parsed.searchParams.entries()]
        .filter(([key]) => !/^utm_/i.test(key) && !/^(fbclid|gclid)$/i.test(key))
        .sort(([leftKey, leftValue], [rightKey, rightValue]) => leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue));
    parsed.search = '';
    for (const [key, value] of retainedParams) parsed.searchParams.append(key, value);
    if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    return parsed.toString();
}

function sha256(value) {
    return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function buildEntryKey(source = {}) {
    const kind = compact(source.kind || source.sourceKind, 40).toLowerCase();
    const stableFeedIdentity = compact(source.item_key || source.itemKey || source.rss_guid || source.rssGuid || source.guid, 1000);
    if (kind === 'feed_item' && stableFeedIdentity) return sha256(`feed_item\n${stableFeedIdentity}`);
    if (kind === 'manuscript') {
        const managementId = compact(source.management_id || source.managementId, 1000);
        if (managementId) return sha256(`manuscript\n${managementId}`);
    }
    const originalUrl = normalizeOriginalUrl(source.canonical_url || source.canonicalUrl || source.original_url || source.originalUrl || source.url);
    if (originalUrl) return sha256(`url\n${originalUrl}`);
    throw new Error('카드뉴스 관리대장 등록에는 RSS 항목 식별자 또는 원문 URL이 필요합니다.');
}

module.exports = { normalizeOriginalUrl, buildEntryKey };
