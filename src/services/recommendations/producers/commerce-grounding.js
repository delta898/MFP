const ALLOWED_COMMERCE_STAGES = new Set(['saved', 'selected', 'drafted', 'published']);
const GENERIC_COMMERCE_TOKENS = new Set([
    '쇼핑', '추천', '인기', '상품', '제품', '세일', '할인', '신제품', '신상', '구매', '후기', '리뷰',
    '정보', '비교', '관련', '최신'
]);

function compact(value, maxLength = 180) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeProductIdentity(value) {
    return compact(value, 180)
        .toLocaleLowerCase('ko-KR')
        .replace(/[^\p{L}\p{N}]+/gu, '');
}

function meaningfulProductTokens(value) {
    return [...new Set(
        compact(value, 180)
            .toLocaleLowerCase('ko-KR')
            .split(/[^\p{L}\p{N}]+/u)
            .map((token) => token.trim())
            .filter((token) => token.length >= 2 && !GENERIC_COMMERCE_TOKENS.has(token))
    )];
}

function isConcreteProduct(value) {
    const identity = normalizeProductIdentity(value);
    const tokens = meaningfulProductTokens(value);
    return identity.length >= 2
        && tokens.length > 0
        && !GENERIC_COMMERCE_TOKENS.has(compact(value, 180).toLocaleLowerCase('ko-KR'));
}

function productIdentityMatches(left, right) {
    const leftIdentity = normalizeProductIdentity(left);
    const rightIdentity = normalizeProductIdentity(right);
    if (!leftIdentity || !rightIdentity) return false;
    if (leftIdentity === rightIdentity) return true;

    const leftTokens = meaningfulProductTokens(left);
    const rightTokens = meaningfulProductTokens(right);
    if (leftTokens.length >= 2 && rightTokens.length >= 2
        && (leftIdentity.includes(rightIdentity) || rightIdentity.includes(leftIdentity))) {
        return true;
    }
    const rightSet = new Set(rightTokens);
    return leftTokens.filter((token) => rightSet.has(token)).length >= 2;
}

function validTimestamp(value) {
    return Number.isFinite(Date.parse(String(value || '')));
}

function normalizeSourceKind(value) {
    return ['event', 'artifact'].includes(compact(value, 40)) ? compact(value, 40) : '';
}

function collectCommerceAnchors(input = {}, context = {}, options = {}) {
    const now = typeof options.now === 'function' ? options.now() : (options.now || new Date());
    const anchors = [];
    const explicit = input.commerce_intent || context.commerce_intent || {};
    const explicitProduct = compact(explicit.product, 180);
    if (compact(explicit.intent, 40).toLowerCase() === 'shopping_content' && isConcreteProduct(explicitProduct)) {
        anchors.push({
            product: explicitProduct,
            identity: normalizeProductIdentity(explicitProduct),
            lane: 'explicit',
            stage: 'observed',
            strength: 'explicit',
            timestamp: new Date(now).toISOString(),
            source_kind: 'event',
            source_id: 'request:current'
        });
    }

    const memory = context?.memory?.owner_memory || {};
    const signals = [
        ...(Array.isArray(context?.owner_activity?.signals) ? context.owner_activity.signals : []),
        ...(Array.isArray(memory?.activity?.signals) ? memory.activity.signals : [])
    ];
    for (const signal of signals) {
        const product = compact(signal?.subject, 180);
        const stage = compact(signal?.stage, 40).toLowerCase();
        const sourceKind = normalizeSourceKind(signal?.evidence?.kind);
        const sourceId = compact(signal?.evidence?.id, 240);
        if (compact(signal?.domain, 40).toLowerCase() !== 'shopping'
            || !ALLOWED_COMMERCE_STAGES.has(stage)
            || !isConcreteProduct(product)
            || !validTimestamp(signal?.timestamp)
            || !sourceKind
            || !sourceId) continue;
        const requestedStrength = compact(signal?.strength, 40).toLowerCase();
        anchors.push({
            product,
            identity: normalizeProductIdentity(product),
            lane: 'owner_activity',
            stage,
            strength: ['strong', 'explicit'].includes(requestedStrength) ? requestedStrength : 'medium',
            timestamp: new Date(signal.timestamp).toISOString(),
            source_kind: sourceKind,
            source_id: sourceId
        });
    }

    const seen = new Set();
    return anchors
        .sort((left, right) => {
            if (left.lane !== right.lane) return left.lane === 'explicit' ? -1 : 1;
            return Date.parse(right.timestamp) - Date.parse(left.timestamp);
        })
        .filter((anchor) => {
            const key = `${anchor.lane}:${anchor.identity}:${anchor.source_kind}:${anchor.source_id}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}

module.exports = {
    ALLOWED_COMMERCE_STAGES,
    GENERIC_COMMERCE_TOKENS,
    collectCommerceAnchors,
    isConcreteProduct,
    meaningfulProductTokens,
    normalizeProductIdentity,
    productIdentityMatches
};
