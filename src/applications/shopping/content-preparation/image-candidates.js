'use strict';

// Shopping image selection policy; no fetching or filesystem effects.

function unescapeJsEscapes(text) {
    if (!text) return '';
    return String(text)
        .replace(/\\u002F/gi, '/')
        .replace(/\\\//g, '/')
        .replace(/\\u003A/gi, ':')
        .replace(/\\u003F/gi, '?')
        .replace(/\\u003D/gi, '=')
        .replace(/\\u0026/gi, '&');
}

function toAbsoluteUrl(input, baseUrl) {
    if (!input) return '';
    try {
        return new URL(input, baseUrl).href;
    } catch (e) {
        return '';
    }
}

function normalizeImageIdentity(imageUrl) {
    try {
        const parsed = new URL(imageUrl);
        return `${parsed.origin}${parsed.pathname}`;
    } catch (e) {
        return imageUrl;
    }
}

function extractNaverTypeSize(imageUrl) {
    try {
        const parsed = new URL(imageUrl);
        const type = String(parsed.searchParams.get('type') || '').toLowerCase();
        const matched = type.match(/^([a-z])(\d{2,4})$/i);
        if (!matched) return null;
        return {
            kind: matched[1].toLowerCase(),
            size: parseInt(matched[2], 10)
        };
    } catch (e) {
        return null;
    }
}

function scoreImageUrl(imageUrl, source = 'generic') {
    let score = 0;
    const lower = String(imageUrl || '').toLowerCase();
    const sourceTag = String(source || '').toLowerCase();

    try {
        const parsed = new URL(imageUrl);
        const host = parsed.hostname.toLowerCase();

        if (host.includes('shop-phinf.pstatic.net')) score += 80;
        if (host.includes('phinf.pstatic.net')) score += 20;
        if (host.includes('ssl.pstatic.net')) score -= 80;
    } catch (e) { }

    if (/\/contact\//.test(lower)) score -= 90;
    if (/banner|gnb|profile|avatar|thumb|thumbnail|icon|logo|sprite|blank|mall_pc|_pc\d{1,2}/.test(lower)) score -= 70;
    if (/main|represent|대표|cover/.test(lower)) score -= 20;
    if (/detail|desc|introduce|editor|content|smarteditor/.test(lower)) score += 20;

    if (sourceTag === 'main_gallery') score += 80;
    if (sourceTag === 'detail_dom') score += 35;
    if (sourceTag === 'detail_script') score += 30;
    if (sourceTag === 'structured') score += 12;
    if (sourceTag === 'og') score += 6;

    const typeInfo = extractNaverTypeSize(imageUrl);
    if (typeInfo) {
        if ((typeInfo.kind === 's' || typeInfo.kind === 'm') && typeInfo.size <= 250) score -= 80;
        if (typeInfo.kind === 'f' && typeInfo.size < 500) score -= 90;
        if (typeInfo.kind === 'o' && typeInfo.size >= 800) score += 40;
        if (typeInfo.kind === 'w' && typeInfo.size >= 800) score += 20;
    }

    return score;
}

function rankImageCandidates(imageCandidates, finalUrl) {
    const normalized = imageCandidates
        .map(item => {
            const rawUrl = typeof item === 'string' ? item : item?.url;
            const source = typeof item === 'string' ? 'generic' : (item?.source || 'generic');
            const src = toAbsoluteUrl(unescapeJsEscapes(String(rawUrl || '')), finalUrl);
            return { src, source };
        })
        .filter(item => !!item.src)
        .filter(item => !item.src.startsWith('data:'))
        .filter(item => !item.src.includes('.svg'));

    const expanded = [];
    for (const item of normalized) {
        const src = item.src;
        expanded.push(item);
        try {
            const parsed = new URL(src);
            const host = parsed.hostname.toLowerCase();
            const typeInfo = extractNaverTypeSize(src);
            if (host.includes('shop-phinf.pstatic.net') && typeInfo && typeInfo.size < 700) {
                const noTypeUrl = new URL(parsed.toString());
                noTypeUrl.searchParams.delete('type');
                expanded.push({ src: noTypeUrl.toString(), source: item.source });

                const o1000Url = new URL(parsed.toString());
                o1000Url.searchParams.set('type', 'o1000');
                expanded.push({ src: o1000Url.toString(), source: item.source });
            }
        } catch (e) { }
    }

    const dedupedMap = new Map();
    for (const item of expanded) {
        const src = item.src;
        const identity = normalizeImageIdentity(src);
        const current = dedupedMap.get(identity);
        if (!current) {
            dedupedMap.set(identity, item);
            continue;
        }
        const currentScore = scoreImageUrl(current.src, current.source);
        const nextScore = scoreImageUrl(src, item.source);
        if (nextScore > currentScore + 2) {
            dedupedMap.set(identity, item);
            continue;
        }
        if (nextScore + 2 < currentScore) continue;

        // 점수가 비슷하면 더 큰 type 파라미터(예: s80보다 o1000)를 우선
        const currentType = extractNaverTypeSize(current.src);
        const nextType = extractNaverTypeSize(src);
        if (currentType && !nextType) {
            dedupedMap.set(identity, item);
            continue;
        }
        if (!currentType && nextType) continue;
        if (currentType && nextType && nextType.size > currentType.size) {
            dedupedMap.set(identity, item);
        }
    }

    return [...dedupedMap.values()]
        .filter(item => {
            const src = item.src;
            const typeInfo = extractNaverTypeSize(src);
            if (!typeInfo) return true;
            if ((typeInfo.kind === 's' || typeInfo.kind === 'm') && typeInfo.size <= 250) return false;
            if (typeInfo.kind === 'f' && typeInfo.size < 500) return false;
            return true;
        })
        .filter(item => scoreImageUrl(item.src, item.source) > -20)
        .sort((a, b) => scoreImageUrl(b.src, b.source) - scoreImageUrl(a.src, a.source));
}

function refineImageCandidates(imageCandidates, finalUrl, options = {}) {
    const sortedItems = rankImageCandidates(imageCandidates, finalUrl);
    const used = new Set();
    const diversified = [];
    const pushItem = (item) => {
        if (!item?.src) return;
        if (used.has(item.src)) return;
        diversified.push(item);
        used.add(item.src);
    };

    // 🌟 main_gallery 이미지가 있으면 그것을 최우선 배치합니다.
    const mainGalleryItems = sortedItems.filter(item => item.source === 'main_gallery');
    if (mainGalleryItems.length > 0) {
        for (const item of mainGalleryItems) {
            pushItem(item);
        }
    } else {
        // main_gallery가 없는 경우에만 detail_dom 3개 우선 배치 (기존 로직)
        const detailFirst = sortedItems.filter(item => ['detail_dom', 'detail_script', 'html_img'].includes(item.source));
        for (let i = 0; i < Math.min(3, detailFirst.length); i++) {
            pushItem(detailFirst[i]);
        }
    }

    // 나머지 이미지 순위대로 추가
    for (const item of sortedItems) {
        pushItem(item);
    }

    if (options.withMeta) {
        return diversified.map(item => ({
            url: item.src,
            source: item.source,
            score: scoreImageUrl(item.src, item.source)
        }));
    }
    return diversified.map(item => item.src);
}


module.exports = { refineImageCandidates, unescapeJsEscapes };
