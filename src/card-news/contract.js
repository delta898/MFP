const CARD_NEWS_SOURCE_KINDS = Object.freeze(['feed_item', 'url', 'manuscript']);
const CARD_NEWS_TEXT_RENDER_MODES = Object.freeze(['layout', 'integrated']);

function createCardNewsContractError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}

function compact(value, maxLength = 20000) {
    return String(value || '').trim().slice(0, maxLength);
}

function normalizePublicHttpsUrl(value, fieldName) {
    const raw = compact(value, 4000);
    let parsed;
    try {
        parsed = new URL(raw);
    } catch (_error) {
        throw createCardNewsContractError('CARD_NEWS_SOURCE_URL_INVALID', `${fieldName}에 공개 HTTPS 주소가 필요합니다.`);
    }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
        throw createCardNewsContractError('CARD_NEWS_SOURCE_URL_INVALID', `${fieldName}에 공개 HTTPS 주소가 필요합니다.`);
    }
    parsed.hash = '';
    return parsed.toString();
}

function normalizeCardNewsSource(input = {}) {
    const kind = compact(input.kind, 40).toLowerCase();
    if (!CARD_NEWS_SOURCE_KINDS.includes(kind)) {
        throw createCardNewsContractError('CARD_NEWS_SOURCE_KIND_INVALID', '지원하지 않는 카드뉴스 원문 방식입니다.');
    }

    if (kind === 'manuscript') {
        const text = compact(input.text);
        if (!text) {
            throw createCardNewsContractError('CARD_NEWS_SOURCE_TEXT_REQUIRED', '카드뉴스로 만들 원고를 입력해 주세요.');
        }
        return {
            kind,
            title: compact(input.title, 300),
            text,
            attribution: compact(input.attribution, 500)
        };
    }

    const canonicalUrl = normalizePublicHttpsUrl(input.canonical_url || input.canonicalUrl || input.url, '원문');
    if (kind === 'url') {
        return {
            kind,
            canonical_url: canonicalUrl,
            title: compact(input.title, 300),
            preview_text: compact(input.preview_text || input.previewText)
        };
    }

    const feedUrl = normalizePublicHttpsUrl(input.feed_url || input.feedUrl, 'RSS');
    const itemKey = compact(input.item_key || input.itemKey || input.guid || canonicalUrl, 1000);
    return {
        kind,
        feed_url: feedUrl,
        item_key: itemKey,
        canonical_url: canonicalUrl,
        title: compact(input.title, 300),
        published_at: compact(input.published_at || input.publishedAt, 80),
        preview_text: compact(input.preview_text || input.previewText)
    };
}

function normalizeCardNewsTextRenderMode(value, fallback = 'integrated') {
    const normalized = compact(value, 40).toLowerCase();
    if (CARD_NEWS_TEXT_RENDER_MODES.includes(normalized)) return normalized;
    if (!normalized && CARD_NEWS_TEXT_RENDER_MODES.includes(fallback)) return fallback;
    throw createCardNewsContractError('CARD_NEWS_TEXT_RENDER_MODE_INVALID', '지원하지 않는 카드뉴스 글자 표현 방식입니다.');
}

function normalizeCardNewsAssets(value) {
    const source = Array.isArray(value) ? value : [];
    const seenOrders = new Set();
    return source.map((item, index) => {
        const order = Number.parseInt(item?.order, 10);
        if (!Number.isInteger(order) || order < 1 || seenOrders.has(order)) {
            throw createCardNewsContractError('CARD_NEWS_ASSET_ORDER_INVALID', '카드 이미지 순서가 올바르지 않습니다.');
        }
        seenOrders.add(order);
        const localPath = compact(item.local_path || item.localPath, 4000);
        const publicUrlRaw = compact(item.public_url || item.publicUrl, 4000);
        const publicUrl = publicUrlRaw ? normalizePublicHttpsUrl(publicUrlRaw, '카드 이미지') : '';
        if (!localPath && !publicUrl) {
            throw createCardNewsContractError('CARD_NEWS_ASSET_LOCATION_REQUIRED', `${index + 1}번째 카드 이미지 위치가 필요합니다.`);
        }
        return {
            id: compact(item.id || `card-${order}`, 200),
            order,
            local_path: localPath,
            public_url: publicUrl,
            mime_type: compact(item.mime_type || item.mimeType, 100),
            width: Math.max(0, Number.parseInt(item.width, 10) || 0),
            height: Math.max(0, Number.parseInt(item.height, 10) || 0)
        };
    }).sort((left, right) => left.order - right.order);
}

function assessCardNewsDelivery(value = {}) {
    const assets = normalizeCardNewsAssets(value.assets);
    const capability = value.capability && typeof value.capability === 'object' ? value.capability : {};
    const minAssets = Math.max(0, Number.parseInt(capability.min_assets, 10) || 0);
    const maxAssets = Math.max(minAssets, Number.parseInt(capability.max_assets, 10) || 0);
    const issues = [];
    if (assets.length < minAssets) issues.push('CARD_NEWS_DELIVERY_TOO_FEW_ASSETS');
    if (maxAssets > 0 && assets.length > maxAssets) issues.push('CARD_NEWS_DELIVERY_TOO_MANY_ASSETS');
    if (capability.requires_public_urls === true && assets.some((asset) => !asset.public_url)) {
        issues.push('CARD_NEWS_DELIVERY_PUBLIC_URL_REQUIRED');
    }
    return {
        ready: issues.length === 0,
        issues,
        assets
    };
}

module.exports = {
    CARD_NEWS_SOURCE_KINDS,
    CARD_NEWS_TEXT_RENDER_MODES,
    createCardNewsContractError,
    normalizeCardNewsSource,
    normalizeCardNewsTextRenderMode,
    normalizeCardNewsAssets,
    assessCardNewsDelivery
};
