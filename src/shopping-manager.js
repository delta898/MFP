const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const moment = require('moment-timezone');
const CONFIG = require('./config-loader');
const Utils = require('./utils');
const Logger = require('./logger');
const BrowserLauncher = require('./browser-launcher');
const RuntimeConfig = require('./runtime-config');

const DEFAULT_LINK_INSERT_COUNT = 3;
const DEFAULT_IMAGE_MAX_COUNT = 12;
const DEFAULT_CTA_IMAGE_INSERT_COUNT = 2;

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function clampInt(value, min, max, fallback) {
    const parsed = parseInt(value, 10);
    if (Number.isNaN(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
}

function stripCodeFence(rawText) {
    if (!rawText) return '';
    return rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
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


function getPngDimensions(buffer) {
    if (!buffer || buffer.length < 24) return null;
    if (buffer.readUInt32BE(0) !== 0x89504E47) return null;
    return {
        width: buffer.readUInt32BE(16),
        height: buffer.readUInt32BE(20)
    };
}

function getJpegDimensions(buffer) {
    if (!buffer || buffer.length < 4) return null;
    if (!(buffer[0] === 0xFF && buffer[1] === 0xD8)) return null;

    let offset = 2;
    while (offset < buffer.length) {
        if (buffer[offset] !== 0xFF) {
            offset++;
            continue;
        }
        const marker = buffer[offset + 1];
        if (!marker) break;

        // SOF0(0xC0), SOF2(0xC2) 등에서 해상도 추출
        if ((marker >= 0xC0 && marker <= 0xC3) || (marker >= 0xC5 && marker <= 0xC7) || (marker >= 0xC9 && marker <= 0xCB) || (marker >= 0xCD && marker <= 0xCF)) {
            if (offset + 8 >= buffer.length) break;
            return {
                height: buffer.readUInt16BE(offset + 5),
                width: buffer.readUInt16BE(offset + 7)
            };
        }

        if (offset + 3 >= buffer.length) break;
        const segmentLength = buffer.readUInt16BE(offset + 2);
        if (segmentLength < 2) break;
        offset += 2 + segmentLength;
    }
    return null;
}

function getImageDimensions(buffer, ext) {
    const normalizedExt = String(ext || '').toLowerCase();
    if (normalizedExt === 'png') return getPngDimensions(buffer);
    if (normalizedExt === 'jpg' || normalizedExt === 'jpeg') return getJpegDimensions(buffer);
    // webp/gif는 해상도 파싱 생략 (URL/type/용량 필터로 선별)
    return null;
}

function isLikelyUsableProductImage(dimensions) {
    if (!dimensions || !dimensions.width || !dimensions.height) return true;

    const width = dimensions.width;
    const height = dimensions.height;
    const shortEdge = Math.min(width, height);
    const wideRatio = width / Math.max(height, 1);
    const tallRatio = height / Math.max(width, 1);

    if (shortEdge < 450) return false;
    if (wideRatio > 2.8 && height < 800) return false;
    if (tallRatio > 5.5 && width < 900) return false;
    return true;
}

function decodeHtml(text) {
    if (!text) return '';
    return cheerio.load('<textarea></textarea>')('textarea').html(text).text();
}

function stripTags(text) {
    if (!text) return '';
    return String(text).replace(/<[^>]*>/g, '').trim();
}

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

function safeDecodeURIComponent(text) {
    if (!text) return '';
    try {
        return decodeURIComponent(text);
    } catch (e) {
        return String(text);
    }
}

function decodeRepeatedly(text, maxDepth = 3) {
    let current = String(text || '');
    for (let i = 0; i < maxDepth; i++) {
        const decoded = safeDecodeURIComponent(current);
        if (!decoded || decoded === current) break;
        current = decoded;
    }
    return current;
}

function safeParseJson(raw) {
    try {
        return JSON.parse(raw);
    } catch (e) {
        return null;
    }
}

function collectProductFromJson(node, productNodes = []) {
    if (!node) return productNodes;

    if (Array.isArray(node)) {
        node.forEach(item => collectProductFromJson(item, productNodes));
        return productNodes;
    }

    if (typeof node !== 'object') return productNodes;

    const typeValue = Array.isArray(node['@type']) ? node['@type'].join(',') : String(node['@type'] || '');
    if (/product/i.test(typeValue)) {
        productNodes.push(node);
    }

    Object.keys(node).forEach(key => collectProductFromJson(node[key], productNodes));
    return productNodes;
}

function guessExtension(url, contentType) {
    const type = (contentType || '').toLowerCase();
    if (type.includes('jpeg') || type.includes('jpg')) return 'jpg';
    if (type.includes('png')) return 'png';
    if (type.includes('webp')) return 'webp';
    if (type.includes('gif')) return 'gif';

    try {
        const ext = path.extname(new URL(url).pathname).replace('.', '').toLowerCase();
        if (ext && ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) {
            return ext === 'jpeg' ? 'jpg' : ext;
        }
    } catch (e) { }
    return 'jpg';
}

function buildImageBlock(index, title, prompt) {
    return `[[IMAGE_${index}\ntitle: ${title}\nprompt: ${prompt}\n]]`;
}

function computeStringSeed(...values) {
    const raw = values.map((value) => normalizeWhitespace(String(value || ''))).join('|');
    let seed = 0;
    for (let i = 0; i < raw.length; i++) {
        seed = (seed * 31 + raw.charCodeAt(i)) % 2147483647;
    }
    return seed;
}

function rotateBySeed(items = [], seed = 0) {
    const source = Array.isArray(items) ? items.filter(Boolean) : [];
    if (source.length <= 1) return source;
    const offset = Math.abs(Number(seed) || 0) % source.length;
    return source.slice(offset).concat(source.slice(0, offset));
}

function getDefaultLinkPhrases(seed = 0) {
    return rotateBySeed([
        '가격/구성 확인하기',
        '자세한 상품 정보 보기',
        '실사용 후기가 궁금하다면 여기',
        '지금 구매 링크 바로가기',
        '할인 여부 확인하기',
        '지금 조건 다시 보기',
        '구매 전 체크포인트 보기'
    ], seed);
}

function getDefaultCtaHeadings(seed = 0) {
    return rotateBySeed([
        '지금 체크해볼 포인트',
        '구매 전에 확인할 부분',
        '이 조건이면 한 번 볼 만합니다',
        '지금 비교해보면 좋은 이유'
    ], seed);
}

function getDefaultClosingCtaPhrases(seed = 0) {
    return rotateBySeed([
        '가격과 혜택 다시 확인하기',
        '내 조건에 맞는지 바로 보기',
        '후기와 조건 함께 체크하기',
        '지금 구매 포인트 확인하기'
    ], seed);
}

function getConfiguredCtaImageUrls() {
    const candidates = [
        CONFIG.SHOPPING_CTA_IMAGE_URL1,
        CONFIG.SHOPPING_CTA_IMAGE_URL2,
        CONFIG.SHOPPING_CTA_IMAGE_URL3
    ];

    const normalized = candidates
        .map(v => normalizeWhitespace(v || ''))
        .filter(v => {
            if (!v) return false;
            if (/^https?:\/\//i.test(v)) return true;
            if (/^[a-z][a-z0-9+\-.]*:\/\//i.test(v) && !/^file:\/\//i.test(v)) return false;
            return true;
        });

    return uniqStrings(normalized).slice(0, 3);
}

function normalizeWhitespace(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
}

function normalizeHashtagTokens(rawHashtags, maxCount = 20) {
    const source = Array.isArray(rawHashtags) ? rawHashtags : [rawHashtags];
    const normalized = [];
    const seen = new Set();

    for (const item of source) {
        if (item === null || item === undefined) continue;
        const tokens = String(item).split(/[\s,]+/);
        for (const tokenRaw of tokens) {
            const token = String(tokenRaw || '')
                .trim()
                .replace(/^[#＃]+/, '')
                .replace(/^[^0-9A-Za-z가-힣_]+/, '')
                .replace(/[^0-9A-Za-z가-힣_]+$/, '');
            if (!token) continue;
            const key = token.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            normalized.push(token);
            if (normalized.length >= maxCount) return normalized;
        }
    }

    return normalized;
}

function uniqStrings(items) {
    return [...new Set((items || []).map(v => normalizeWhitespace(v)).filter(Boolean))];
}

function normalizeFactText(text) {
    let cleaned = normalizeWhitespace(String(text || ''));
    cleaned = cleaned.replace(/^(?:[\s\-–—−•·∙▪◦*]|\u2022|\u00B7|\u2219|\u25AA|\u25E6)+/g, '').trim();
    while (/^[-–—−]\s*/.test(cleaned)) {
        cleaned = cleaned.replace(/^[-–—−]\s*/, '').trim();
    }
    return cleaned;
}

function splitContentSentences(text = '') {
    const clean = normalizeWhitespace(text);
    if (!clean) return [];
    return clean
        .replace(/([.!?。！？])\s+/g, '$1\n')
        .split('\n')
        .map((sentence) => normalizeWhitespace(sentence))
        .filter(Boolean);
}

function mergeDistinctSentences(primary = '', secondary = '', maxSentences = 5) {
    const merged = [];
    const seen = new Set();
    for (const sentence of [...splitContentSentences(primary), ...splitContentSentences(secondary)]) {
        const key = sentence.replace(/\s+/g, '').toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        merged.push(sentence);
        if (merged.length >= maxSentences) break;
    }
    return merged.join(' ').trim();
}

function hasConcreteShoppingSignal(text = '') {
    const clean = normalizeWhitespace(text);
    if (!clean) return false;
    return /(\d{1,3}(?:,\d{3})*원|\d+%|\d+개월|무료배송|택배배송|무이자|적립|예약|공식\s*브랜드스토어|공식\s*스토어|배송|할부|포인트|현재가|할인율)/i.test(clean);
}

function isGenericShoppingCopy(text = '') {
    const clean = normalizeWhitespace(text);
    if (!clean) return false;

    const genericTokens = [
        '적합한 선택', '적합한 선택지', '만족감을', '만족도를', '든든한', '주목을 받고',
        '큰 강점', '효율적인', '쾌적한', '스마트하게', '세련된', '기대됩니다',
        '보여줄 것으로', '최적의 선택', '차별화된', '정갈하게', '선사할', '선사합니다',
        '한층 더', '확실한 품질', '가장 큰 이유', '가장 큰 강점', '좋은 기회입니다'
    ];

    let hitCount = 0;
    for (const token of genericTokens) {
        if (clean.includes(token)) hitCount++;
        if (hitCount >= 2) return true;
    }

    return hitCount >= 1 && !hasConcreteShoppingSignal(clean);
}

function parseKrwNumber(input) {
    const raw = String(input || '').replace(/[^0-9]/g, '');
    if (!raw) return null;
    const num = parseInt(raw, 10);
    if (Number.isNaN(num)) return null;
    return num;
}

function formatKrw(num) {
    if (!num || Number.isNaN(num)) return '';
    return `${num.toLocaleString('ko-KR')}원`;
}

function collectRegexMatches(text, regex, maxCount = 5) {
    const list = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
        list.push(match[0]);
        if (list.length >= maxCount) break;
    }
    return uniqStrings(list);
}

function collectCaptureMatches(text, regex, maxCount = 5) {
    const list = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
        if (match[1]) list.push(match[1]);
        if (list.length >= maxCount) break;
    }
    return uniqStrings(list);
}

function extractPriceMentionsFromText(text) {
    const source = normalizeWhitespace(text);
    const regex = /(\d{1,3}(?:,\d{3})+)\s*원/g;
    const mentions = [];
    let match;

    while ((match = regex.exec(source)) !== null) {
        const value = parseKrwNumber(match[1]);
        if (!value || value < 1000 || value > 100000000) continue;

        const idx = match.index || 0;
        const context = source.slice(Math.max(0, idx - 24), Math.min(source.length, idx + match[0].length + 24));
        mentions.push({ value, context });
    }

    return mentions;
}

function buildCommerceFacts(commerceData) {
    const facts = [];
    if (!commerceData) return facts;

    if (commerceData.salePrice) facts.push(`현재가 ${formatKrw(commerceData.salePrice)}`);
    if (commerceData.originalPrice && commerceData.originalPrice > (commerceData.salePrice || 0)) {
        facts.push(`기존가 ${formatKrw(commerceData.originalPrice)}`);
    }
    if (commerceData.discountRate) facts.push(`할인율 ${commerceData.discountRate}%`);
    if (commerceData.freeShipping) facts.push('무료배송 혜택');
    if (commerceData.deliveryFee && !commerceData.freeShipping) facts.push(`배송비 ${commerceData.deliveryFee}`);
    if (commerceData.deliveryDateNotice) facts.push(`${commerceData.deliveryDateNotice.replace(/\(.*\)/, '').trim()} 예정`);
    if (commerceData.wishlistCount && commerceData.wishlistCount > 100) facts.push(`관심 고객 ${commerceData.wishlistCount.toLocaleString('ko-KR')}명 돌파`);
    if (commerceData.installment) facts.push(`혜택: ${commerceData.installment}`);
    if (commerceData.benefitHighlights?.length > 0) facts.push(...commerceData.benefitHighlights.slice(0, 4));

    return uniqStrings(facts).map(normalizeFactText).filter(Boolean).slice(0, 10);
}

function parseRatingValue(input) {
    const num = Number(String(input || '').replace(/[^0-9.]/g, ''));
    if (Number.isNaN(num) || num <= 0) return null;
    if (num > 5.0) return null;
    return Math.round(num * 10) / 10;
}

function cleanReviewSnippet(text) {
    const decoded = decodeRepeatedly(decodeHtml(unescapeJsEscapes(String(text || ''))));
    const noTags = decoded.replace(/<[^>]*>/g, ' ');
    const compact = normalizeWhitespace(noTags)
        .replace(/[a-z0-9가-힣]{1,12}\*{2,}\s*·?\s*\d{2}\.\d{1,2}\.\d{1,2}\.?/gi, ' ')
        .replace(/색상\s*모델명[:：]?\s*[^|]{0,30}/gi, ' ')
        .replace(/https?:\/\/\S+/g, '')
        .replace(/[{}[\]<>]/g, '')
        .trim();
    if (!compact) return '';
    if (compact.length > 110) return `${compact.substring(0, 110).trim()}...`;
    return compact;
}

function isLikelyReviewSentence(text) {
    const clean = normalizeWhitespace(String(text || ''));
    if (!clean) return false;
    if (clean.length < 8 || clean.length > 300) return false;
    if (!/[가-힣]/.test(clean)) return false;
    if (/^(리뷰|상품평|평점|사용자\s*총\s*평점|전체\s*리뷰수|평점\s*비율|스토어\s*pick|포토\/동영상|랭킹순|최신순|평점\s*높은순|평점\s*낮은순|전체보기)/i.test(clean)) return false;
    if (/^(?:\d+[,.]?)+\s*(?:개|건)?$/.test(clean)) return false;
    if (/(무료배송|택배배송|오늘출발|무이자|할인율)\b/.test(clean) && clean.length < 36) return false;
    return true;
}

function extractAiSummaryPointsFromHtml(rawHtml) {
    const html = decodeRepeatedly(unescapeJsEscapes(String(rawHtml || '')));
    const $ = cheerio.load(html);
    const points = [];

    // 셀렉터 기반 수집 (가장 정확함)
    $('[class*="ReviewSummary"], [class*="AiSummary"], [class*="Chip"], [class*="chip"]').each((_, el) => {
        const txt = ($(el).text() || '').trim();
        if (txt.length >= 3 && txt.length <= 40 && /[가-힣]/.test(txt)) {
            if (!/AI|리뷰|요약|전체보기|전체 리뷰|옵션/.test(txt)) points.push(cleanReviewSnippet(txt));
        }
    });

    const anchorIdx = html.search(/AI\s*리뷰\s*요약/i);
    if (anchorIdx >= 0) {
        const windowed = html.slice(Math.max(0, anchorIdx - 1200), Math.min(html.length, anchorIdx + 22000));
        const chips = collectCaptureMatches(
            windowed,
            />\s*([^<>]{2,24}(?:요|해요|좋아요|편해요|쉬워요|높아요|낮아요|따뜻해요|만족스러워요|잘\s*돼요))\s*</gi,
            30
        );
        points.push(...chips);
    }

    return uniqStrings(points
        .map(cleanReviewSnippet)
        .filter(item => item.length >= 3 && item.length <= 40)
        .filter(item => /[가-힣]/.test(item))
        .filter(item => !/AI|리뷰|요약|전체보기|상품옵션|포토|동영상|랭킹순|최신순/.test(item))
    ).slice(0, 6);
}

function extractReviewSamplesFromHtml(rawHtml) {
    const html = String(rawHtml || '');
    if (!html) return [];

    const fromJson = collectCaptureMatches(
        html,
        /"(?:reviewContent|reviewText|reviewBody|reviewComment|reviewSummary|contents)"\s*:\s*"([^"]{14,320})"/gi,
        12
    );

    const fromDom = [];
    try {
        const $ = cheerio.load(html);
        const selectors = [
            '[class*="review"]',
            '[id*="review"]',
            '[data-shp-area*="review"]',
            '[data-testid*="review"]'
        ];

        for (const selector of selectors) {
            $(selector).each((_, el) => {
                if (fromDom.length >= 12) return false;
                const cleaned = cleanReviewSnippet($(el).text());
                if (!isLikelyReviewSentence(cleaned)) return;
                fromDom.push(cleaned);
            });
            if (fromDom.length >= 12) break;
        }
    } catch (e) { }

    return uniqStrings([...fromJson, ...fromDom]
        .map(cleanReviewSnippet)
        .filter(isLikelyReviewSentence)
    ).slice(0, 6);
}

function splitReviewInsightChunks(text) {
    const raw = decodeRepeatedly(unescapeJsEscapes(String(text || '')));
    if (!raw) return [];

    const compact = normalizeWhitespace(raw)
        .replace(/베타\s*도움말/gi, ' ')
        .replace(/AI\s*리뷰\s*요약/gi, ' ')
        .replace(/[\[\]{}()]/g, ' ')
        .replace(/[•·∙▪◦]/g, ',')
        .replace(/[|/]/g, ',')
        .replace(/(요|해요|좋아요|편해요|쉬워요|높아요|낮아요|만족스러워요|잘\s*돼요|돼요|됩니다)(?=[가-힣])/g, '$1,');

    return uniqStrings(
        compact
            .split(/[,\n;]+/)
            .map(item => normalizeWhitespace(item))
            .map(item => item.replace(/^\d+[.)]?\s*/, '').trim())
            .map(item => item.replace(/\.\.\.$/, '').trim())
            .filter(item => item.length >= 3 && item.length <= 26)
            .filter(item => /[가-힣]/.test(item))
            .filter(item => !/리뷰|요약|전체보기|상품옵션|포토|동영상|랭킹순|최신순|도움말|베타/.test(item))
    );
}

function normalizeReviewInsightPoints(points) {
    const chunks = [];
    for (const point of points || []) {
        chunks.push(...splitReviewInsightChunks(point));
    }
    return uniqStrings(chunks).slice(0, 12);
}

function deriveReviewHighlights(aiSummaryPoints = [], reviewSamples = []) {
    const normalizedPoints = normalizeReviewInsightPoints(aiSummaryPoints);
    const sourceText = `${normalizedPoints.join(' ')} ${reviewSamples.join(' ')}`.toLowerCase();

    const keywordRules = [
        { label: '디자인이 예뻐요', regex: /(디자인|예쁘|예뻐|깔끔|고급|감성)/g },
        { label: '설치가 편해요', regex: /(설치|세팅|설정|연결|배치)/g },
        { label: '소음이 적어요', regex: /(소음|조용|정숙)/g },
        { label: '사용이 편해요', regex: /(사용|조작|편해|간편|쉬워)/g },
        { label: '건조 성능이 좋아요', regex: /(건조|말림|뽀송)/g },
        { label: '세탁 성능이 좋아요', regex: /(세탁|빨래|오염)/g },
        { label: '공간 활용이 좋아요', regex: /(공간|일체형|콤보|사이즈|자리|차지하지)/g },
        { label: '시간 절약에 도움이 돼요', regex: /(시간|절약|빠르|단축)/g }
    ];

    const scored = keywordRules.map(rule => {
        const matched = sourceText.match(rule.regex);
        return { label: rule.label, count: matched ? matched.length : 0 };
    }).filter(item => item.count > 0)
        .sort((a, b) => b.count - a.count)
        .map(item => item.label);

    const highlights = [];
    for (const label of scored) {
        if (!highlights.includes(label)) highlights.push(label);
        if (highlights.length >= 3) break;
    }

    if (highlights.length < 3) {
        for (const point of normalizedPoints) {
            let candidate = point;
            if (!/[요다]$/.test(candidate)) candidate = `${candidate}요`;
            if (candidate.length > 26) continue;
            if (!highlights.includes(candidate)) highlights.push(candidate);
            if (highlights.length >= 3) break;
        }
    }

    return highlights.slice(0, 3);
}

function buildReviewFacts(reviewData) {
    const facts = [];
    if (!reviewData) return facts;
    if (reviewData.sellerName) facts.push(`판매처: ${reviewData.sellerName}`);
    if (reviewData.reviewCount) facts.push(`누적 리뷰 ${reviewData.reviewCount.toLocaleString('ko-KR')}개`);
    if (reviewData.averageRating) {
        let ratingText = `평점 ${reviewData.averageRating.toFixed(2)}점`;
        if (reviewData.recentRating && reviewData.recentRating > 4.5) {
            ratingText += ` (최근 6개월 ${reviewData.recentRating.toFixed(2)}점 기록 중)`;
        }
        facts.push(ratingText);
    }
    const highlights = (reviewData.reviewHighlights?.length > 0)
        ? reviewData.reviewHighlights
        : deriveReviewHighlights(reviewData.aiSummaryPoints || [], reviewData.reviewSamples || []);
    if (highlights.length > 0) {
        facts.push(`사용자 평가: ${highlights.join(', ')}`);
    }
    return uniqStrings(facts).slice(0, 8);
}

function extractReviewData(pageText, rawHtml, structuredProduct) {
    const text = normalizeWhitespace(pageText);
    const html = String(rawHtml || '');
    const $ = cheerio.load(html);

    const aggregateRating = structuredProduct?.aggregateRating || null;
    let reviewCount = parseKrwNumber(aggregateRating?.ratingCount || aggregateRating?.reviewCount);
    let averageRating = parseRatingValue(aggregateRating?.ratingValue);

    // 🌟 [개선] 셀렉터 기반 리뷰 개수 추출 (더 폭넓은 범위)
    if (!reviewCount) {
        reviewCount = parseKrwNumber(
            $('a[class*="ReviewCount"] strong, a[class*="Review"] strong, span[class*="ReviewCount"], span._2Pg_uT9_69, div._2P6977S9un:contains("전체 리뷰수") + span').first().text()
            || $('a.yfYuXvGCiB strong').text()
        );
    }

    if (!reviewCount) {
        const htmlCountPatterns = [
            /"(?:reviewCount|ratingCount|totalReviewCount|reviewTotalCount|reviewCnt)"\s*:\s*"?([0-9][0-9,]*)"?/gi
        ];
        // ... (이후 기존 로직 유지하되 셀렉터 우선)
        for (const pattern of htmlCountPatterns) {
            const match = pattern.exec(html);
            if (!match?.[1]) continue;
            const parsed = parseKrwNumber(match[1]);
            if (parsed && parsed > 0) {
                reviewCount = parsed;
                break;
            }
        }
    }

    // 🌟 [개선] 셀렉터 기반 평점 추출 (전체 및 최근 6개월) - 더 정밀해진 퍼지 셀렉터
    let recentRating = null;
    if (!averageRating) {
        const ratingText = $('[class*="RatingValue"], [class*="AverageRating"], [class*="rating_value"], span._29N9_sgv_d, div._2y6y6f0p_p, em[class*="score"]').first().text();
        averageRating = parseRatingValue(ratingText);
    }
    recentRating = parseRatingValue(
        $('span._2P6977S9un:contains("최근 6개월")').next().text()
        || $('span:contains("최근 6개월 평점")').next().text()
        || $('dt:contains("최근 6개월")').next().text()
        || $('[class*="RecentRating"]').text()
    );

    // 🌟 [개선] 판매자명 추출 (가시성 높은 영역 우선)
    const sellerName = (
        $('a[class*="StoreName"], a._2-9uOkYpxb, [class*="seller_name"], span:contains("판매자") + span, [class*="StoreHeader"] h1, [class*="store_name"]').first().text()
        || ''
    ).trim();

    const aiSummaryPoints = [];
    // 🌟 [개선] 셀렉터 기반 AI 리뷰 요약 추출
    $('[class*="ReviewSummary"], [class*="AiSummary"], [class*="review_summary"]').each((_, el) => {
        const txt = ($(el).text() || '').trim();
        if (txt && txt.length > 5) aiSummaryPoints.push(cleanReviewSnippet(txt));
    });

    const aiSummaryPatterns = [
        /AI\s*리뷰\s*요약[:：]?\s*([^"'\n]{6,90})/gi,
        /리뷰\s*요약[:：]?\s*([^"'\n]{6,90})/gi
    ];
    for (const pattern of aiSummaryPatterns) {
        const match = pattern.exec(text);
        if (!match?.[1]) continue;
        const cleaned = cleanReviewSnippet(match[1]);
        if (cleaned && cleaned.length <= 60) aiSummaryPoints.push(cleaned);
    }
    aiSummaryPoints.push(...extractAiSummaryPointsFromHtml(html));

    const reviewSamples = [];
    // 🌟 [개선] 실제 리뷰 목록에서 대표 텍스트 추출 (Store PICK 등)
    $('p._1reK39Ua4r, div._19YID_5gL- p, [class*="ReviewText"], [class*="review_text"]').each((_, el) => {
        const cleaned = cleanReviewSnippet($(el).text());
        if (cleaned && cleaned.length > 20) reviewSamples.push(cleaned);
        if (reviewSamples.length >= 10) return false;
    });

    const structuredReviews = Array.isArray(structuredProduct?.review)
        ? structuredProduct.review
        : structuredProduct?.review ? [structuredProduct.review] : [];
    for (const review of structuredReviews) {
        const raw = review?.reviewBody || review?.description || review?.name || '';
        const cleaned = cleanReviewSnippet(raw);
        if (cleaned && !reviewSamples.includes(cleaned)) reviewSamples.push(cleaned);
        if (reviewSamples.length >= 15) break;
    }

    const normalizedAiSummaryPoints = normalizeReviewInsightPoints(aiSummaryPoints);
    const reviewHighlights = deriveReviewHighlights(normalizedAiSummaryPoints, reviewSamples);

    const reviewData = {
        reviewCount: reviewCount || null,
        averageRating: averageRating || null,
        recentRating: recentRating || null,
        sellerName: sellerName || null,
        aiSummaryPoints: normalizedAiSummaryPoints.slice(0, 8),
        reviewSamples: uniqStrings(reviewSamples).slice(0, 10),
        reviewHighlights
    };
    reviewData.facts = buildReviewFacts(reviewData);
    return reviewData;
}

function mergeReviewData(baseData = {}, extraData = {}) {
    const reviewCount = Math.max(baseData.reviewCount || 0, extraData.reviewCount || 0) || null;
    const averageRating = extraData.averageRating || baseData.averageRating || null;
    const recentRating = extraData.recentRating || baseData.recentRating || null;
    const sellerName = extraData.sellerName || baseData.sellerName || null;
    const aiSummaryPoints = normalizeReviewInsightPoints([...(baseData.aiSummaryPoints || []), ...(extraData.aiSummaryPoints || [])]).slice(0, 8);
    const reviewSamples = uniqStrings([...(baseData.reviewSamples || []), ...(extraData.reviewSamples || [])]).slice(0, 10);
    const reviewHighlights = deriveReviewHighlights(
        [...(baseData.reviewHighlights || []), ...(extraData.reviewHighlights || []), ...aiSummaryPoints],
        reviewSamples
    );

    const merged = {
        reviewCount,
        averageRating,
        recentRating,
        sellerName,
        aiSummaryPoints,
        reviewSamples,
        reviewHighlights
    };
    merged.facts = buildReviewFacts(merged);
    return merged;
}

function extractCommerceData(pageText, rawHtml, structuredProduct) {
    const text = normalizeWhitespace(pageText);
    const html = String(rawHtml || '');
    const $ = cheerio.load(html);

    const offers = Array.isArray(structuredProduct?.offers)
        ? structuredProduct.offers[0]
        : structuredProduct?.offers || null;

    let salePrice = parseKrwNumber(offers?.price || offers?.lowPrice);
    let originalPrice = parseKrwNumber(offers?.highPrice);
    let discountRate = null;

    const mentions = extractPriceMentionsFromText(text);
    const nonPointPrices = mentions.filter(m => !/적립|포인트|혜택|캐시백|쿠폰/.test(m.context)).map(m => m.value);

    if (!salePrice && nonPointPrices.length > 0) {
        salePrice = Math.min(...nonPointPrices);
    }

    if (!originalPrice && nonPointPrices.length > 0) {
        const candidates = nonPointPrices.filter(v => !salePrice || v > salePrice);
        if (candidates.length > 0) {
            originalPrice = Math.max(...candidates);
        }
    }

    // 찜하기 수 (wishlistCount) 추출 (지연 로드 대응 셀렉터 보강)
    const wishlistCount = parseKrwNumber(
        $('span[class*="Count"], span._3H-ms').text()
        || $('em:contains("관심고객수")').next().text()
        || $('span:contains("관심고객수")').next().text()
        || $('button[class*="zzim"] span[class*="count"]').text()
    );

    // 배송비 및 배송 예정일
    const deliveryFee = normalizeWhitespace(
        $('span._2_nBaYvofS:contains("배송비")').nextAll('span.XmPOfshMvY').first().text()
        || $('dt:contains("배송비")').next().text()
        || ''
    );
    const deliveryDateNotice = normalizeWhitespace(
        $('span._2_nBaYvofS:contains("배송일")').nextAll().find('span.XmPOfshMvY').first().text()
        || $('span:contains("도착보장")').parent().text()
        || $('[class*="DeliveryNotice"]').text()
        || ''
    );

    const discountRegex = /([1-9]\d?)\s*%/g;
    let dMatch;
    while ((dMatch = discountRegex.exec(text)) !== null) {
        const value = parseInt(dMatch[1], 10);
        if (Number.isNaN(value) || value <= 0 || value >= 90) continue;

        const idx = dMatch.index || 0;
        const context = text.slice(Math.max(0, idx - 16), Math.min(text.length, idx + dMatch[0].length + 16));
        if (/적립|포인트|카드|추가/.test(context) && !/할인/.test(context)) continue;
        discountRate = value;
        if (/할인/.test(context)) break;
    }

    if (!discountRate) {
        const htmlDiscount = html.match(/"discountRate"\s*:\s*"?(\d{1,2})"?/i);
        if (htmlDiscount?.[1]) {
            const num = parseInt(htmlDiscount[1], 10);
            if (!Number.isNaN(num) && num > 0 && num < 90) discountRate = num;
        }
    }

    if (!discountRate && salePrice && originalPrice && originalPrice > salePrice) {
        const computed = Math.round((1 - (salePrice / originalPrice)) * 100);
        if (computed > 0 && computed < 90) discountRate = computed;
    }

    const freeShipping = /무료배송/.test(text) || deliveryFee.includes('무료');
    const deliveryMethods = [];
    if (/택배배송/.test(text)) deliveryMethods.push('택배배송');
    if (/우체국택배/.test(text)) deliveryMethods.push('우체국택배');
    if (/오늘출발/.test(text)) deliveryMethods.push('오늘출발');
    if (/내일도착/.test(text)) deliveryMethods.push('내일도착');

    let installment = '';
    const installmentMatch = text.match(/\d{1,2}\s*개월\s*무이자\s*할부/);
    if (installmentMatch?.[0]) {
        installment = normalizeWhitespace(installmentMatch[0]);
    } else if (/무이자\s*할부/.test(text)) {
        installment = '무이자 할부';
    }
    // 셀렉터 기반 무이자 정보 보강
    const installmentDetail = normalizeWhitespace($('span._2_nBaYvofS:contains("무이자")').parent().text() || '');
    if (installmentDetail && !installment) installment = installmentDetail;

    const eventHighlights = uniqStrings([
        normalizeWhitespace($('span._2_nBaYvofS:contains("이벤트")').nextAll('span.XmPOfshMvY').first().text() || ''),
        normalizeWhitespace($('span._2_nBaYvofS:contains("사은품")').nextAll('span.XmPOfshMvY').first().text() || ''),
        ...collectRegexMatches(text, /최대\s*[0-9,]+\s*원\s*(?:추가\s*)?(?:적립|포인트)/g, 3),
        ...collectRegexMatches(text, /네이버페이\s*포인트\s*[0-9,]+\s*원\s*증정/g, 2),
        ...collectRegexMatches(text, /네이버페이\s*머니\s*결제\s*시\s*최대\s*적립/g, 1),
        ...collectRegexMatches(text, /이벤트[^.]{0,35}(?:증정|혜택)/g, 2)
    ]).filter(s => s.length > 2).slice(0, 7);

    const commerceData = {
        salePrice,
        originalPrice,
        discountRate,
        freeShipping,
        deliveryFee,
        deliveryDateNotice,
        deliveryMethods: uniqStrings(deliveryMethods),
        installment,
        wishlistCount,
        benefitHighlights: eventHighlights
    };
    commerceData.facts = buildCommerceFacts(commerceData);
    return commerceData;
}

function mergeCommerceData(baseData = {}, extraData = {}) {
    const salePrice = extraData.salePrice || baseData.salePrice || null;
    const originalPrice = extraData.originalPrice || baseData.originalPrice || null;
    const discountRate = extraData.discountRate || baseData.discountRate || null;
    const freeShipping = !!(extraData.freeShipping || baseData.freeShipping);
    const deliveryFee = extraData.deliveryFee || baseData.deliveryFee || '';
    const deliveryDateNotice = extraData.deliveryDateNotice || baseData.deliveryDateNotice || '';
    const deliveryMethods = uniqStrings([...(baseData.deliveryMethods || []), ...(extraData.deliveryMethods || [])]);
    const installment = extraData.installment || baseData.installment || '';
    const wishlistCount = extraData.wishlistCount || baseData.wishlistCount || null;
    const benefitHighlights = uniqStrings([...(baseData.benefitHighlights || []), ...(extraData.benefitHighlights || [])]).slice(0, 7);

    const merged = {
        salePrice,
        originalPrice,
        discountRate,
        freeShipping,
        deliveryFee,
        deliveryDateNotice,
        deliveryMethods,
        installment,
        wishlistCount,
        benefitHighlights
    };
    merged.facts = buildCommerceFacts(merged);
    return merged;
}

function buildSeoKeywordHints(productTitle = '') {
    const cleanTitle = normalizeWhitespace(String(productTitle || '').split(':')[0]);
    const stopWords = new Set(['최신형', '공식파트너', '공식', '파트너', '정품', '대용량', '신생아', '아기', '필기용']);
    const keywords = [];
    const pushKeyword = (value) => {
        const clean = normalizeWhitespace(value);
        if (!clean || keywords.includes(clean)) return;
        keywords.push(clean);
    };

    if (cleanTitle) pushKeyword(cleanTitle);

    const titleForSplit = cleanTitle.replace(/[^\w\s가-힣-]/g, ' ');
    const tokens = titleForSplit.split(/\s+/).map(t => t.trim()).filter(Boolean);

    for (let i = 0; i < tokens.length - 1; i++) {
        const a = tokens[i];
        const b = tokens[i + 1];
        if (stopWords.has(a) || stopWords.has(b)) continue;
        if (a.length < 2 || b.length < 2) continue;
        pushKeyword(`${a} ${b}`);
        if (keywords.length >= 6) break;
    }

    for (const token of tokens) {
        if (stopWords.has(token)) continue;
        if (token.length < 2) continue;
        pushKeyword(token);
        if (keywords.length >= 8) break;
    }

    if (keywords.length === 0) {
        return '- 메인 키워드: 상품 리뷰';
    }

    return keywords.slice(0, 8).map((k, idx) => `- ${idx === 0 ? '메인' : '서브'} 키워드: ${k}`).join('\n');
}

function getTitleStopWords() {
    return new Set([
        '공식', '공식파트너', '공식인증점', '파트너', '정품', '최신형', '대용량', '신생아', '아기',
        '필기용', '실사용', '사용기', '후기', '추천', '리뷰', '와이파이', 'wifi', '그레이',
        '터치', '아이디', 'touch', 'id', 'ram', 'ssd', '브랜드스토어', '스토어',
        '사전예약', '예약', '1차예약', '2차예약'
    ]);
}

function isSpecLikeTitleToken(token = '') {
    const lower = String(token || '').trim().toLowerCase();
    if (!lower) return false;
    if (/^\d+(gb|tb|mb)$/i.test(lower)) return true;
    if (/^\d+세대$/.test(lower)) return true;
    if (/^[a-z]{1,4}\d[a-z0-9/-]{2,}$/i.test(lower)) return true;
    if (/^[a-z]{2,}\d{2,}[a-z0-9-]*$/i.test(lower)) return true;
    return ['touch', 'id', 'ram', 'ssd', 'lte', '5g'].includes(lower);
}

function truncateTitle(text, maxLen = 35) {
    const clean = normalizeWhitespace(text);
    if (!clean) return '';
    if (clean.length <= maxLen) return clean;
    const words = clean.split(' ');
    let acc = '';
    for (const word of words) {
        const candidate = acc ? `${acc} ${word}` : word;
        if (candidate.length > maxLen) break;
        acc = candidate;
    }
    if (acc.length >= 12) return acc;
    return clean.substring(0, maxLen).trim();
}

function extractCoreTitleKeyword(productTitle = '') {
    const stopWords = getTitleStopWords();

    const raw = normalizeWhitespace(String(productTitle || '').split(':')[0])
        .replace(/\[[^\]]*]/g, ' ')
        .replace(/\([^)]*\)/g, ' ')
        .replace(/[^\w\s가-힣-]/g, ' ');

    const tokens = raw.split(/\s+/).map(v => v.trim()).filter(Boolean);
    const selected = [];
    for (const token of tokens) {
        if (token.length < 2) continue;
        if (stopWords.has(token.toLowerCase())) continue;
        if (isSpecLikeTitleToken(token)) continue;
        selected.push(token);
        if (selected.length >= 4) break;
    }

    const joined = normalizeWhitespace(selected.join(' '));
    if (joined) return truncateTitle(joined, 16);
    return truncateTitle(normalizeWhitespace(productTitle), 16);
}

function escapeRegex(text) {
    return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countKeywordOccurrences(text, keyword) {
    const cleanText = normalizeWhitespace(text);
    const cleanKeyword = normalizeWhitespace(keyword);
    if (!cleanText || !cleanKeyword) return 0;
    const regex = new RegExp(escapeRegex(cleanKeyword), 'gi');
    const matched = cleanText.match(regex);
    return matched ? matched.length : 0;
}

function deriveSeoKeywordPlan(productTitle = '') {
    const mainKeyword = extractCoreTitleKeyword(productTitle) || '상품 리뷰';
    const stopWords = getTitleStopWords();
    const tokens = normalizeWhitespace(productTitle)
        .replace(/\[[^\]]*]/g, ' ')
        .replace(/\([^)]*\)/g, ' ')
        .replace(/[^\w\s가-힣-]/g, ' ')
        .split(/\s+/)
        .map(v => v.trim())
        .filter(Boolean);

    const mainTokens = new Set(mainKeyword.split(/\s+/).map(v => v.trim().toLowerCase()).filter(Boolean));
    const related = [];
    for (const token of tokens) {
        const lower = token.toLowerCase();
        if (token.length < 2) continue;
        if (stopWords.has(lower)) continue;
        if (mainTokens.has(lower)) continue;
        if (related.includes(token)) continue;
        related.push(token);
        if (related.length >= 3) break;
    }

    return { mainKeyword, relatedKeywords: related };
}

function resolveOwnBlogId() {
    const configured = normalizeWhitespace(CONFIG.NAVER_ID || '');
    if (configured && !configured.includes('본인의_네이버_아이디')) return configured;

    const writeUrl = normalizeWhitespace(CONFIG.WRITE_URL || '');
    if (!writeUrl) return '';
    try {
        const parsed = new URL(writeUrl);
        const chunks = parsed.pathname.split('/').filter(Boolean);
        return chunks[0] || '';
    } catch (e) {
        return '';
    }
}

function normalizeNaverBlogPostUrl(rawUrl, blogId = '') {
    const href = normalizeWhitespace(rawUrl);
    if (!href) return '';

    try {
        const parsed = new URL(href, 'https://blog.naver.com');
        const host = parsed.hostname.toLowerCase();
        const pathChunks = parsed.pathname.split('/').filter(Boolean);

        if (parsed.pathname.includes('/PostView.naver')) {
            const id = parsed.searchParams.get('blogId') || blogId;
            const logNo = parsed.searchParams.get('logNo');
            if (id && logNo && /^\d{6,}$/.test(String(logNo))) {
                return `https://blog.naver.com/${id}/${logNo}`;
            }
        }

        if ((host === 'blog.naver.com' || host === 'm.blog.naver.com') && pathChunks.length >= 2) {
            const id = pathChunks[0];
            const logNo = pathChunks[1];
            if (id && /^\d{6,}$/.test(String(logNo))) {
                return `https://blog.naver.com/${id}/${logNo}`;
            }
        }

        return '';
    } catch (e) {
        return '';
    }
}

function parseRecentPostsFromRssXml(xml, blogId, maxCount) {
    if (!xml || typeof xml !== 'string') return [];
    const $ = cheerio.load(xml, { xmlMode: true, decodeEntities: true });
    const posts = [];
    const seen = new Set();

    $('item').each((_, el) => {
        if (posts.length >= maxCount) return false;
        const title = normalizeWhitespace(stripTags(decodeHtml($(el).find('title').first().text() || '')));
        const linkRaw = normalizeWhitespace($(el).find('link').first().text() || '');
        const url = normalizeNaverBlogPostUrl(linkRaw, blogId);
        if (!title || !url || seen.has(url)) return;

        seen.add(url);
        posts.push({ title: truncateTitle(title, 60), url });
    });

    return posts;
}

function parseRecentPostsFromBlogHtml(html, blogId, maxCount) {
    if (!html || typeof html !== 'string') return [];
    const $ = cheerio.load(html);
    const posts = [];
    const seen = new Set();

    $('a[href]').each((_, el) => {
        if (posts.length >= maxCount) return false;
        const href = $(el).attr('href') || '';
        const title = normalizeWhitespace(stripTags($(el).text() || ''));
        if (!title || title.length < 6) return;
        if (/카테고리|메뉴|태그|이웃|프로필|공지|로그인/.test(title)) return;

        const url = normalizeNaverBlogPostUrl(href, blogId);
        if (!url || seen.has(url)) return;
        if (!url.includes(`/${blogId}/`)) return;

        seen.add(url);
        posts.push({ title: truncateTitle(title, 60), url });
    });

    return posts;
}

async function fetchRecentOwnBlogPosts(maxCount = 3) {
    const targetCount = clampInt(maxCount, 1, 10, 3);
    const blogId = resolveOwnBlogId();
    if (!blogId) return [];

    const rssUrl = `https://rss.blog.naver.com/${encodeURIComponent(blogId)}.xml`;
    try {
        const rssRes = await axios.get(rssUrl, {
            timeout: 10000,
            maxRedirects: 3,
            headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/rss+xml, application/xml, text/xml, */*' },
            validateStatus: () => true
        });
        if (rssRes.status >= 200 && rssRes.status < 300 && typeof rssRes.data === 'string') {
            const rssPosts = parseRecentPostsFromRssXml(rssRes.data, blogId, targetCount);
            if (rssPosts.length > 0) return rssPosts;
        }
    } catch (e) {
        Logger.warn(`⚠️ 최신 글 RSS 수집 실패: ${e.message}`);
    }

    const listUrl = `https://blog.naver.com/PostList.naver?blogId=${encodeURIComponent(blogId)}&from=postList&categoryNo=0&currentPage=1`;
    try {
        const listRes = await axios.get(listUrl, {
            timeout: 12000,
            maxRedirects: 3,
            headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html,application/xhtml+xml' },
            validateStatus: () => true
        });
        if (listRes.status >= 200 && listRes.status < 300 && typeof listRes.data === 'string') {
            return parseRecentPostsFromBlogHtml(listRes.data, blogId, targetCount);
        }
    } catch (e) {
        Logger.warn(`⚠️ 최신 글 HTML 수집 실패: ${e.message}`);
    }

    return [];
}

function hasAggressiveClickbait(title = '') {
    const clean = normalizeWhitespace(title).toLowerCase();
    if (!clean) return false;

    const hardBanned = [
        '절대 사지', '무조건 사', '역대급', '충격', '폭로', '망합니다', '사기', '최저가 보장',
        '인생템 확정', '오늘만', '지금 안 사면', '비밀 공개', '소름', '0원'
    ];
    return hardBanned.some(token => clean.includes(token));
}

function isWeakShoppingTitle(title, productTitle = '') {
    const clean = normalizeWhitespace(title);
    if (!clean) return true;

    const normalizedClean = clean.toLowerCase().replace(/\s+/g, '');
    const normalizedProduct = normalizeWhitespace(productTitle).toLowerCase().replace(/\s+/g, '');
    if (normalizedProduct && (normalizedClean === normalizedProduct || normalizedClean.includes(normalizedProduct))) return true;

    if (clean.length < 12 || clean.length > 35) return true;
    if ((clean.match(/[,/|]/g) || []).length >= 3) return true;
    if (hasAggressiveClickbait(clean)) return true;

    const hookPattern = /(써보|사용|후기|체감|고민|선택|이유|추천|정리|달라|만족|궁금|왜|느낀)/;
    if (!hookPattern.test(clean)) return true;

    const specsLikePattern = /(?:\b(?:wifi|gb|tb)\b|sm-[a-z0-9-]{3,}|amh-\d{3,}|wd\d{2,})/gi;
    const specHits = clean.match(specsLikePattern) || [];
    if (specHits.length >= 3) return true;

    return false;
}

function pickTitleHook(commerceData = {}) {
    const facts = buildCommerceFacts(commerceData);
    const text = facts.join(' ');
    if (/무이자|적립/.test(text)) return '지금 조건이 괜찮은 이유';
    if (/\d+%/.test(text) || /할인/.test(text)) return '지금 비교해볼 만한 이유';
    if (/무료배송|오늘출발|내일도착|배송/.test(text)) return '구매 전에 체크할 조건';
    return '구매 기준이 또렷해지는 이유';
}

function normalizeTitleForPublish(title = '') {
    let clean = normalizeWhitespace(String(title || ''));
    if (!clean) return '';

    clean = clean
        .replace(/^#+\s*/, '')
        .replace(/[()[\]{}]/g, '')
        .replace(/[!]{2,}/g, '!')
        .replace(/[?]{2,}/g, '?')
        .replace(/\s*[|/]\s*/g, ' ')
        .trim();

    // 네이버 노출 효율을 위해 최종 길이는 35자 이하로 강제한다.
    clean = truncateTitle(clean, 35);
    return clean;
}

function ensureTitleStartsWithKeyword(title, mainKeyword) {
    const cleanTitle = normalizeTitleForPublish(title);
    const keyword = normalizeWhitespace(mainKeyword);
    if (!keyword) return cleanTitle;

    if (cleanTitle.startsWith(keyword)) {
        return truncateTitle(cleanTitle, 35);
    }

    const stripped = cleanTitle.replace(/^[,:\-\s]+/, '');
    const candidate = normalizeTitleForPublish(`${keyword} ${stripped}`.trim());
    if (candidate.length >= 12) return truncateTitle(candidate, 35);
    return normalizeTitleForPublish(`${keyword} 써보니 달라진 점`);
}

function ensureParagraphContainsKeyword(paragraph, keyword, fallbackTail) {
    const clean = normalizeWhitespace(paragraph);
    const key = normalizeWhitespace(keyword);
    if (!key) return clean;
    if (clean && clean.includes(key)) return clean;
    if (!clean) return `${key} ${fallbackTail}`.trim();
    return `${clean} ${key} ${fallbackTail}`.trim();
}

function countSeoMentionsInAiData(aiData, seoPlan) {
    const keywords = [seoPlan.mainKeyword, ...(seoPlan.relatedKeywords || [])].filter(Boolean);
    const contentBlocks = Array.isArray(aiData?.blocks) ? aiData.blocks : [];
    const blocks = [
        aiData.intro || '',
        aiData.conclusion || '',
        ...contentBlocks.map((block) => `${block.heading || ''} ${block.body || ''} ${(block.bullets || []).join(' ')} ${block.quote || ''}`)
    ];
    return keywords.reduce((sum, keyword) => {
        return sum + blocks.reduce((acc, block) => acc + countKeywordOccurrences(block, keyword), 0);
    }, 0);
}

function reinforceSeoKeywordUsage(aiData, seoPlan) {
    if (!aiData || !seoPlan?.mainKeyword) return aiData;

    aiData.title = ensureTitleStartsWithKeyword(aiData.title, seoPlan.mainKeyword);
    aiData.intro = ensureParagraphContainsKeyword(
        aiData.intro,
        seoPlan.mainKeyword,
        '관점에서 핵심 포인트를 정리해봤습니다.'
    );
    aiData.conclusion = ensureParagraphContainsKeyword(
        aiData.conclusion,
        seoPlan.mainKeyword,
        '기준으로 최종 선택 포인트를 정리합니다.'
    );

    const MIN_MENTIONS = 3;
    const MAX_MENTIONS = 5;
    let mentionCount = countSeoMentionsInAiData(aiData, seoPlan);

    const targetBlocks = Array.isArray(aiData?.blocks) ? aiData.blocks : [];

    if (mentionCount < MIN_MENTIONS && targetBlocks.length > 0) {
        const keywordPool = [seoPlan.mainKeyword, ...(seoPlan.relatedKeywords || [])].filter(Boolean);
        let keywordCursor = 0;
        for (const section of targetBlocks) {
            if (mentionCount >= MIN_MENTIONS || mentionCount >= MAX_MENTIONS) break;
            if (['cta', 'quote'].includes(normalizeAiBlockType(section.type))) continue;
            const keyword = keywordPool[keywordCursor % keywordPool.length] || seoPlan.mainKeyword;
            keywordCursor++;
            section.body = ensureParagraphContainsKeyword(
                section.body,
                keyword,
                '기준에서 봤을 때 체감 포인트가 분명했습니다.'
            );
            mentionCount = countSeoMentionsInAiData(aiData, seoPlan);
        }
    }

    return aiData;
}

function buildEngagingShoppingTitle(aiTitle, productTitle, commerceData = {}, platform = 'naver') {
    const cleanAiTitle = normalizeTitleForPublish(String(aiTitle || '').replace(/["']/g, ''));

    // AI가 생성한 제목을 최대한 존중하되, 최소한의 유효성만 체크합니다.
    if (cleanAiTitle && cleanAiTitle.length >= 10) {
        return truncateTitle(cleanAiTitle, 35);
    }

    // AI 제목이 너무 짧거나 없는 경우에만 최소한의 폴백을 적용합니다.
    const keyword = extractCoreTitleKeyword(productTitle) || '이 제품';
    return truncateTitle(normalizeTitleForPublish(`${keyword} 고를 때 보게 되는 포인트`), 35);
}

function joinNaturalFacts(items = []) {
    const facts = uniqStrings((items || []).map(normalizeFactText).filter(Boolean));
    if (facts.length === 0) return '';
    if (facts.length === 1) return facts[0];
    if (facts.length === 2) return `${facts[0]}와 ${facts[1]}`;
    return `${facts.slice(0, -1).join(', ')}, ${facts[facts.length - 1]}`;
}

function buildShoppingFallbackIntro(productTitle, commerceData = {}) {
    const keyword = extractCoreTitleKeyword(productTitle) || '이 제품';
    const facts = buildCommerceFacts(commerceData).filter(f => /현재가|할인|적립|할부|무료배송|배송/.test(f)).slice(0, 3);
    const factText = joinNaturalFacts(facts);
    if (factText) {
        return `${keyword}를 볼 때 중요한 건 사양표보다 지금 바로 계산되는 구매 조건입니다. ${factText}처럼 실제 결제 체감에 영향을 주는 요소를 먼저 보면, 이 상품이 단순 신제품인지 지금 비교해볼 만한 선택인지 판단이 훨씬 쉬워집니다.`;
    }
    return `${keyword}를 고를 때는 제품 설명만 보는 것보다 실제 구매 조건과 사용 상황을 같이 보는 편이 좋습니다. 어떤 점이 지금 이 상품을 다시 보게 만드는지 핵심만 정리하겠습니다.`;
}

function buildShoppingFallbackConclusion(productTitle, commerceData = {}) {
    const keyword = extractCoreTitleKeyword(productTitle) || '이 제품';
    const facts = buildCommerceFacts(commerceData).filter(f => /적립|할부|무료배송|배송|할인/.test(f)).slice(0, 2);
    const factText = joinNaturalFacts(facts);
    if (factText) {
        return `${keyword}는 스펙만 보고 결정하기보다 구매 조건까지 같이 볼 때 만족도가 갈리는 유형입니다. ${factText}처럼 지금 바로 체감되는 조건이 살아 있을 때 비교를 끝내면, 결제 직전에 흔들릴 이유가 훨씬 줄어듭니다.`;
    }
    return `${keyword}는 내 사용 방식과 구매 조건이 맞는지만 분명하면 만족도가 갈리는 제품입니다. 지금 필요한 기준과 우선순위를 놓치지 말고 마지막 조건까지 확인해보세요.`;
}

function buildShoppingFallbackBlockCatalog(productTitle, commerceData = {}, reviewData = {}) {
    const keyword = extractCoreTitleKeyword(productTitle) || '이 제품';
    const commerceFacts = buildCommerceFacts(commerceData);
    const reviewFacts = buildReviewFacts(reviewData);
    const purchaseFacts = commerceFacts.filter(f => /현재가|할인|적립|할부|무료배송|배송/.test(f));
    const reviewSentence = reviewFacts.length > 0
        ? `${joinNaturalFacts(reviewFacts.slice(0, 2))}까지 같이 보면 단순 스펙보다 실제 판단 기준이 더 분명해집니다.`
        : '리뷰 데이터가 많지 않더라도 구매 조건과 사용 상황을 같이 보면 선택 기준은 충분히 세울 수 있습니다.';

    const decisionHeadings = [
        '계속 보게 되는 이유부터 분명합니다',
        '왜 지금 이 상품에 주목해야 할까요?',
        '결정적인 선택의 기준은 따로 있습니다',
        '다시 봐도 고를 수밖에 없는 이유'
    ];
    const decisionHeading = rotateBySeed(decisionHeadings, computeStringSeed(productTitle, 'decision'));

    return [
        normalizeAiBlock({
            type: 'decision',
            heading: decisionHeading,
            body: `${keyword}를 다시 보게 되는 건 단순히 신제품이어서가 아니라, ${joinNaturalFacts(purchaseFacts.slice(0, 2)) || '구매 조건'}처럼 바로 계산되는 기준이 있기 때문입니다. 예산과 결제 부담, 구매 타이밍을 함께 보는 사람일수록 이런 조건 차이가 실제 체감에서 더 크게 작동합니다.`
        }),
        normalizeAiBlock({
            type: 'proof',
            heading: '조건을 숫자로 보면 판단이 쉬워집니다',
            body: `${joinNaturalFacts(purchaseFacts.slice(0, 3)) || '구매 조건'}이 한 번에 들어오면 비교가 훨씬 단순해집니다. ${reviewSentence}`,
            bullets: purchaseFacts.slice(0, 3)
        }),
        normalizeAiBlock({
            type: 'comparison',
            heading: '비교할 때는 가격만 보면 아쉽습니다',
            body: `${keyword} 같은 제품은 표면적인 가격만 볼수록 판단이 흐려질 수 있습니다. 저장공간, 결제 혜택, 배송 조건, 예약 일정처럼 실제 사용 전부터 영향을 주는 항목까지 같이 봐야 내 상황에 맞는 선택인지 분명해집니다.`
        }),
        normalizeAiBlock({
            type: 'tip',
            heading: '구매 전에 놓치지 말아야 할 체크포인트',
            body: `예약 상품이나 혜택형 상품은 제품 스펙보다 적용 조건을 같이 보는 편이 안전합니다. ${keyword}도 적립 방식, 무이자 적용 범위, 배송 조건 같은 항목을 함께 확인해두면 결제 직전에 흔들릴 일이 줄어듭니다.`,
            bullets: uniqStrings([
                commerceData.installment ? `무이자 적용 범위: ${commerceData.installment}` : '',
                commerceData.freeShipping ? '배송비 추가 부담 여부 확인' : '',
                purchaseFacts.find(f => /적립/.test(f)) || ''
            ]).filter(Boolean).slice(0, 3)
        }),
        normalizeAiBlock({
            type: 'recommendation',
            heading: '이런 상황이라면 더 만족도가 높습니다',
            body: `${keyword}는 단순히 최신 제품이 필요한 사람보다, 결제 조건과 사용 균형을 함께 따지는 사람에게 더 잘 맞습니다. 오래 쓸 노트북을 한 번에 정리하고 싶거나, 지금 살아 있는 혜택까지 포함해 총구매 체감을 따져보고 싶은 경우 특히 후보로 남기기 좋습니다.`,
            bullets: [
                '지금 구매 조건과 실사용 균형을 함께 보고 싶은 경우',
                '무이자/적립까지 포함해 총구매 체감을 따져보는 경우',
                '예약 시점에 혜택과 발송 일정을 같이 확인하려는 경우'
            ]
        }),
        normalizeAiBlock({
            type: 'cta',
            heading: '지금 확인해볼 조건은 이 정도입니다',
            body: `${joinNaturalFacts(purchaseFacts.slice(0, 2)) || '구매 조건'}처럼 지금 바로 계산 가능한 이점부터 확인해보는 편이 좋습니다. 가격만 보고 넘기기보다 실제 결제 체감이 어떻게 달라지는지 함께 체크해보세요.`,
            bullets: purchaseFacts.slice(0, 2)
        })
    ].filter(block => block.heading || block.body || block.bullets.length > 0);
}

function enrichShoppingAiData(aiData, productTitle, commerceData = {}, reviewData = {}) {
    // 🚀 [Pure AI Strategy] 프로그램의 임의 개입을 싹 뺍니다. 
    // AI 프롬프트 엔지니어링에 전적으로 의존하며, 여기서는 구조적 정규화만 수행합니다.
    const normalizedBlocks = Array.isArray(aiData?.blocks)
        ? aiData.blocks.map(normalizeAiBlock).filter(block => block.heading || block.body || block.bullets.length > 0 || block.quote || block.ctaPhrase)
        : [];

    // 블록이 하나도 없는 극단적인 경우에만 최소한의 구조를 유지합니다.
    if (normalizedBlocks.length === 0) {
        normalizedBlocks.push({
            type: 'section',
            heading: '구매 가치와 실제 체감 포인트',
            body: '상품의 핵심 특징과 실제 구매 시 고려해야 할 요소들을 정리해 드립니다.',
            bullets: []
        });
    }

    aiData.blocks = normalizedBlocks.slice(0, 10);

    // intro/conclusion도 AI가 생성한 것을 그대로 사용합니다. (최소 유효성만 유지)
    aiData.intro = normalizeWhitespace(aiData.intro || '');
    aiData.conclusion = normalizeWhitespace(aiData.conclusion || '');

    // CTA 문구는 버튼 텍스트로 사용되므로 최소한의 시각적 형태를 보장합니다.
    if (!Array.isArray(aiData.ctaPhrases) || aiData.ctaPhrases.length === 0) {
        const seed = computeStringSeed(productTitle, JSON.stringify(commerceData || {}));
        aiData.ctaPhrases = getDefaultLinkPhrases(seed);
    }

    return aiData;
}

function buildAiPrompt(product, platform = 'naver') {
    const commerceFacts = (product.commerceData?.facts || []).map(item => `- ${item}`).join('\n') || '- 추출된 가격/혜택 정보 없음';
    const reviewFacts = (product.reviewData?.facts || []).map(item => `- ${item}`).join('\n') || '- 추출된 리뷰 요약 정보 없음';
    const reviewSamples = (product.reviewData?.reviewSamples || []).map((item, idx) => `${idx + 1}. ${item}`).join('\n') || '1. 대표 리뷰를 추출하지 못했습니다.';
    const seoKeywordHints = buildSeoKeywordHints(product.title || '');
    const commerceJson = JSON.stringify(product.commerceData || {}, null, 2);
    const reviewJson = JSON.stringify(product.reviewData || {}, null, 2);

    // 플랫폼별 특화 지시사항
    const platformLabel = platform === 'wordpress' ? '워드프레스(WordPress)' : '네이버 블로그(Naver Blog)';
    const platformStyle = platform === 'wordpress'
        ? '정보 중심의 깔끔하고 구조적인 문체와 객관적인 톤을 유지하세요.'
        : '이웃과 대화하듯 친근하고 개인적인 경험이 묻어나는 "블로그 나수" 스타일로 작성하세요.';

    const promptPath = CONFIG.SHOPPING_PROMPT_PATH || path.join(__dirname, 'config', 'shopping_prompt.md');
    if (!promptPath || !fs.existsSync(promptPath)) {
        throw new Error(`쇼핑 프롬프트 파일이 없습니다: ${promptPath}`);
    }

    const template = fs.readFileSync(promptPath, 'utf-8');
    if (!template || !template.trim()) {
        throw new Error(`쇼핑 프롬프트 파일이 비어 있습니다: ${promptPath}`);
    }

    return template
        .replace(/{{\s*PRODUCT_TITLE\s*}}/g, product.title || '상품명 미확인')
        .replace(/{{\s*PRODUCT_DESCRIPTION\s*}}/g, product.description || '요약 정보 없음')
        .replace(/{{\s*PRODUCT_BODY\s*}}/g, (product.body || '').substring(0, 5000))
        .replace(/{{\s*COMMERCE_FACTS\s*}}/g, commerceFacts)
        .replace(/{{\s*COMMERCE_JSON\s*}}/g, commerceJson)
        .replace(/{{\s*REVIEW_FACTS\s*}}/g, reviewFacts)
        .replace(/{{\s*REVIEW_JSON\s*}}/g, reviewJson)
        .replace(/{{\s*REVIEW_SAMPLES\s*}}/g, reviewSamples)
        .replace(/{{\s*SEO_KEYWORDS\s*}}/g, seoKeywordHints)
        .replace(/{{\s*PLATFORM_NAME\s*}}/g, platformLabel)
        .replace(/{{\s*PLATFORM_STYLE\s*}}/g, platformStyle)
        .trim();
}

function getHostLabel(url) {
    try {
        return new URL(url).hostname;
    } catch (e) {
        return '상품';
    }
}

function isGenericShoppingTitle(title) {
    const normalized = String(title || '').toLowerCase().replace(/\s+/g, '');
    return normalized === '네이버쇼핑' || normalized === 'navershopping' || normalized === '쇼핑';
}

function isErrorLikePageTitle(title) {
    const normalized = String(title || '').toLowerCase().replace(/\s+/g, '');
    if (!normalized) return false;
    return /에러페이지|시스템오류|오류페이지|서비스오류|errorpage|systemerror|serviceerror|internalservererror|forbidden|accessdenied/.test(normalized);
}

function extractChannelProductNo(url) {
    if (!url) return '';
    try {
        const parsed = new URL(url);
        const queryNo =
            parsed.searchParams.get('channelProductNo') ||
            parsed.searchParams.get('productNo') ||
            parsed.searchParams.get('nvMid') ||
            parsed.searchParams.get('query');
        if (queryNo && /^\d{6,}$/.test(String(queryNo))) {
            return String(queryNo);
        }

        const pathMatch = parsed.pathname.match(/\/(?:products|catalog)\/(\d{6,})/i);
        if (pathMatch?.[1]) return pathMatch[1];
        return '';
    } catch (e) {
        return '';
    }
}

async function resolveUrlAndHtml(shortUrl) {
    const response = await axios.get(shortUrl, {
        timeout: 20000,
        maxRedirects: 10,
        headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html,application/xhtml+xml' },
        validateStatus: () => true
    });

    const finalUrl = response?.request?.res?.responseUrl || shortUrl;
    const html = typeof response.data === 'string' ? response.data : '';

    return { finalUrl, html };
}

function mergeProductData(baseData, extraData) {
    const mergedImageMetaMap = new Map();
    const allMeta = [...(baseData.imageMeta || []), ...(extraData.imageMeta || [])];

    for (const item of allMeta) {
        if (!item?.url) continue;
        const current = mergedImageMetaMap.get(item.url);
        if (!current || (item.score || 0) > (current.score || 0)) {
            mergedImageMetaMap.set(item.url, item);
        }
    }

    // 최종 병합된 메타 데이터들을 점수 내림차순으로 정렬
    const sortedMeta = [...mergedImageMetaMap.values()]
        .sort((a, b) => (b.score || 0) - (a.score || 0));

    const mergedImages = sortedMeta.map(item => item.url);
    const mergedImageMeta = sortedMeta;

    return {
        title: extraData.title || baseData.title,
        description: extraData.description || baseData.description,
        body: (extraData.body && extraData.body.length > (baseData.body || '').length) ? extraData.body : baseData.body,
        imageUrls: mergedImages,
        imageMeta: mergedImageMeta,
        structuredProduct: extraData.structuredProduct || baseData.structuredProduct,

        commerceData: mergeCommerceData(baseData.commerceData, extraData.commerceData),
        reviewData: mergeReviewData(baseData.reviewData, extraData.reviewData)
    };
}

function extractProductData(finalUrl, html) {
    const $ = cheerio.load(html || '');
    const pageText = normalizeWhitespace($('body').text() || '');

    const structuredProducts = [];
    $('script[type="application/ld+json"]').each((_, el) => {
        const raw = ($(el).html() || '').trim();
        if (!raw) return;
        const parsed = safeParseJson(raw);
        if (parsed) {
            collectProductFromJson(parsed, structuredProducts);
        }
    });

    const structuredProduct = structuredProducts[0] || null;

    const structuredTitle = structuredProduct?.name || structuredProduct?.headline || '';
    const structuredDescription = structuredProduct?.description || '';
    const structuredImages = [];
    if (structuredProduct?.image) {
        if (Array.isArray(structuredProduct.image)) structuredImages.push(...structuredProduct.image);
        else structuredImages.push(structuredProduct.image);
    }

    const title = (
        structuredTitle ||
        $('meta[property="og:title"]').attr('content') ||
        $('meta[name="twitter:title"]').attr('content') ||
        $('h1').first().text() ||
        $('title').text() ||
        ''
    ).trim();

    const description = (
        structuredDescription ||
        $('meta[property="og:description"]').attr('content') ||
        $('meta[name="description"]').attr('content') ||
        ''
    ).trim();

    ['script', 'style', 'noscript', 'iframe', 'nav', 'footer', 'header'].forEach(sel => $(sel).remove());
    const bodyText = (
        $('article').text() ||
        $('main').text() ||
        $('body').text() ||
        ''
    ).replace(/\s+/g, ' ').trim().substring(0, 7000);

    const imageCandidates = [];
    imageCandidates.push(...structuredImages.map(url => ({ url, source: 'structured' })));
    const ogImage = $('meta[property="og:image"]').attr('content');
    if (ogImage) imageCandidates.push({ url: ogImage, source: 'og' });

    // 🌟 [우선] 네이버 스마트스토어/브랜드스토어 메인 상품 이미지 슬라이더 전용 셀렉터
    // 하단의 "다른 구성", "베스트 상품", "추천 상품" 영역을 제외하고 메인 갤러리만 추출합니다.
    // 실제 페이지 DOM 분석으로 확인된 클래스명:
    //   메인 갤러리 썸네일: a.MLx6OjiZJZ
    //   다른 구성 섹션:   a.XtWZmys5I5 (제외)
    //   베스트 상품 섹션: a.RtatPoQQiT (제외)
    const mainGallerySelectors = [
        // ✅ 실제 Naver Brand/SmartStore DOM에서 확인한 메인 갤러리 셀렉터 (최우선)
        'a.MLx6OjiZJZ img',
        // ✅ 범용 대체 셀렉터 (클래스명이 난독화되어 다를 경우 대비)
        '[class*="ProductImageView"] img',
        '[class*="productImage"] img',
        '[class*="product_image"] img',
        '[class*="MainImageWrap"] img',
        '[class*="mainImage"] img',
        '[class*="main_image"] img',
        '[class*="repImage"] img',
        '[class*="rep_image"] img',
        '[class*="ProductRepImage"] img',
        '[class*="SwipeableViews"] img',
        '[class*="swiper-slide"] img',
        '[class*="image-slider"] img',
        '[class*="ImageSlider"] img',
        '[class*="GalleryImage"] img'
    ];
    let mainGalleryImages = 0;
    for (const selector of mainGallerySelectors) {
        $(selector).each((_, el) => {
            const src =
                $(el).attr('src') ||
                $(el).attr('data-src') ||
                $(el).attr('data-original') ||
                $(el).attr('data-lazy-src') ||
                $(el).attr('data-img-src');
            if (src) {
                imageCandidates.push({ url: src, source: 'main_gallery' });
                mainGalleryImages++;
            }
        });
    }


    const detailImageSelectors = [
        '#INTRODUCE img',
        '#detail img',
        '#DETAIL img',
        '[id*="detail"] img',
        '[id*="DETAIL"] img',
        '[class*="detail"] img',
        '[class*="DETAIL"] img',
        '[class*="introduce"] img',
        '[class*="description"] img'
    ];
    for (const selector of detailImageSelectors) {
        $(selector).each((_, el) => {
            const src =
                $(el).attr('src') ||
                $(el).attr('data-src') ||
                $(el).attr('data-original') ||
                $(el).attr('data-lazy-src') ||
                $(el).attr('data-img-src');
            if (src) imageCandidates.push({ url: src, source: 'detail_dom' });
        });
    }

    // 🚫 하단 추천/관련 상품 섹션을 제외한 img 전체 스캔 (메인 갤러리 이미지가 부족한 경우에만)
    if (mainGalleryImages < 5) {
        // 추천/관련/베스트 상품 섹션 영역을 DOM에서 임시 제거 후 스캔
        const excludeSelectors = [
            // ✅ 실제 Naver Brand Store DOM 클래스 (브라우저 확인)
            'a.XtWZmys5I5',   // "다른 구성" 섹션
            'a.RtatPoQQiT',   // "베스트 상품" 섹션
            // 범용 제외 패턴
            '[class*="recommendation"]',
            '[class*="Recommendation"]',
            '[class*="related"]',
            '[class*="Related"]',
            '[class*="other_product"]',
            '[class*="OtherProduct"]',
            '[class*="bestSeller"]',
            '[class*="BestSeller"]',
            '[class*="best_product"]',
            '[class*="BestProduct"]',
            '[class*="similar"]',
            '[class*="Similar"]',
            '[class*="recently_viewed"]',
            '[class*="RecentlyViewed"]',
            '[class*="also_viewed"]',
            'section[data-shp-section*="recommend"]',
            'section[data-shp-section*="related"]'
        ];
        // 임시 복사 $clone에서 제외 섹션 제거 후 스캔
        const $clone = cheerio.load($.html());
        excludeSelectors.forEach(sel => { try { $clone(sel).remove(); } catch (e) { /* */ } });
        $clone('img').each((_, el) => {
            const src =
                $clone(el).attr('src') ||
                $clone(el).attr('data-src') ||
                $clone(el).attr('data-original') ||
                $clone(el).attr('data-lazy-src') ||
                $clone(el).attr('data-img-src');
            if (src) imageCandidates.push({ url: src, source: 'html_img' });
        });
    }



    // 동적 스크립트 내 상세 이미지 URL 후보도 수집한다.
    const rawHtml = String(html || '');
    const imageUrlRegex = /(https?:\/\/[^"'\\s>]+?\.(?:jpg|jpeg|png|webp)(?:\?[^"'\\s>]*)?)/gi;
    let match;
    let scriptCandidateCount = 0;
    while ((match = imageUrlRegex.exec(rawHtml)) !== null) {
        const candidateUrl = unescapeJsEscapes(match[1] || '');
        if (!candidateUrl) continue;
        const idx = match.index || 0;
        const context = rawHtml.slice(Math.max(0, idx - 140), Math.min(rawHtml.length, idx + 140)).toLowerCase();
        if (!/detail|introduce|description|smarteditor|상품상세|상세설명/.test(context)) continue;
        imageCandidates.push({ url: candidateUrl, source: 'detail_script' });
        scriptCandidateCount++;
        if (scriptCandidateCount >= 160) break;
    }

    const rankedImageMeta = refineImageCandidates(imageCandidates, finalUrl, { withMeta: true });
    const imageUrls = rankedImageMeta.map(item => item.url);
    const commerceData = extractCommerceData(pageText, html, structuredProduct);
    const reviewData = extractReviewData(pageText, html, structuredProduct);

    return {
        title,
        description,
        body: bodyText,
        imageUrls,
        imageMeta: rankedImageMeta,
        structuredProduct,
        commerceData,
        reviewData
    };
}

function isLikelyInvalidLanding(productData, finalUrl) {
    const title = (productData.title || '').toLowerCase();
    const rawTitle = productData.title || '';
    const bodyLen = (productData.body || '').length;
    const bodyHead = String(productData.body || '').slice(0, 700).toLowerCase().replace(/\s+/g, '');
    const imageCount = productData.imageUrls?.length || 0;
    const host = getHostLabel(finalUrl).toLowerCase();

    if (!title && bodyLen < 120 && imageCount === 0) return true;
    if (isErrorLikePageTitle(rawTitle)) return true;
    if (/에러페이지|시스템오류|오류가발생|잠시후다시|요청하신페이지를찾을수없/.test(bodyHead) && imageCount === 0) return true;
    if ((host.includes('brand.naver.com') || host.includes('brandconnect.naver.com')) && imageCount === 0 && bodyLen < 250) return true;
    if (title.includes('브랜드 커넥트') && imageCount === 0) return true;
    if (host.includes('search.shopping.naver.com') && imageCount === 0 && (isGenericShoppingTitle(rawTitle) || bodyLen < 800)) return true;
    if (isGenericShoppingTitle(rawTitle) && imageCount === 0) return true;
    return false;
}

/**
 * Naver 쇼핑 등 상세 페이지에서 '리뷰' 탭을 찾아 클릭하고 데이터 로딩을 대외합니다.
 * @param {import('playwright').Page} page 
 */
async function clickReviewTab(page) {
    try {
        const reviewTabSelectors = [
            // 1순위: 명시적인 탭 역할과 텍스트 (가장 정확)
            'ul[role="tablist"] li[role="tab"]:has-text("리뷰")',
            'a[role="tab"]:has-text("리뷰")',
            'button[role="tab"]:has-text("리뷰")',

            // 2순위: Naver 스마트스토어 전용 셀렉터 (data-clk 등)
            'li[data-clk*="rev"] a',
            'a[data-clk*="rev"]',
            'li._16i9p:has-text("리뷰") a', // 스마트스토어 신규 클래스
            '.U96_i:has-text("리뷰")',      // 스마트스토어 공통 클래스

            // 3순위: 일반적인 버튼/링크 (fallback)
            'button:has-text("리뷰")',
            'a:has-text("리뷰")',
            'li:has-text("리뷰")',
            '#_review_menu'
        ];

        const reviewContentSelectors = [
            '#REVIEW', '[class*="ReviewList"]', '[class*="ReviewArea"]',
            '._2Uo_P', '[class*="review_list"]', '[id*="review"]'
        ];

        let clicked = false;
        for (const selector of reviewTabSelectors) {
            const reviewTab = page.locator(selector).first();
            if (await reviewTab.count() === 0) continue;

            Logger.info(`🛍️ [Shopping] 리뷰 탭 클릭 시도 중: ${selector}`);
            try {
                await reviewTab.scrollIntoViewIfNeeded({ timeout: 1000 });
                // 살짝 위로 스크롤하여 플로팅 헤더에 가려지는 것 방지
                await page.mouse.wheel(0, -100);
            } catch (e) { }

            await reviewTab.click({ force: true, timeout: 3000 });
            await page.waitForTimeout(1500);

            // 클릭 성공 여부 확인 (리뷰 관련 콘텐츠가 보이는지)
            let isVisible = false;
            for (const contentSel of reviewContentSelectors) {
                if (await page.locator(contentSel).first().isVisible({ timeout: 1000 }).catch(() => false)) {
                    isVisible = true;
                    break;
                }
            }

            if (isVisible) {
                Logger.info(`✅ [Shopping] 리뷰 탭 활성화 확인됨 (셀렉터: ${selector})`);
                clicked = true;
                break;
            } else {
                Logger.info(`ℹ️ [Shopping] 리뷰 영역 미노출, 다음 셀렉터 시도...`);
            }
        }

        if (clicked) {
            // 지연 로딩 트리거를 위한 추가 스크롤
            Logger.info('🛍️ [Shopping] 리뷰 데이터 로딩을 위해 하단으로 스크롤합니다...');
            await page.mouse.wheel(0, 1000);
            await page.waitForTimeout(1000);
            await page.mouse.wheel(0, 2000);
            await page.waitForTimeout(1500);

            try { await page.waitForLoadState('networkidle', { timeout: 3000 }); } catch (e) { }
        } else {
            Logger.warn('⚠️ [Shopping] 리뷰 탭 활성화에 실패했습니다. 현재 페이지 HTML에서 추출을 시도합니다.');
            // 마지막 수단으로 상단 페이지만이라도 스크롤
            await page.mouse.wheel(0, 3000);
            await page.waitForTimeout(2000);
        }
    } catch (e) {
        Logger.warn(`⚠️ [Shopping] 리뷰 탭 클릭 프로세스 중 오류: ${e.message}`);
    }
}

async function resolveCandidateUrl(url) {
    try {
        const response = await axios.get(url, {
            timeout: 20000,
            maxRedirects: 10,
            headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html,application/xhtml+xml' },
            validateStatus: () => true
        });
        const finalUrl = response?.request?.res?.responseUrl || url;
        const html = typeof response.data === 'string' ? response.data : '';
        return { finalUrl, html };
    } catch (e) {
        return null;
    }
}

async function resolveCandidateUrlWithBrowser(url, headless = true) {
    let browser;
    try {
        browser = await BrowserLauncher.launchBrowser({ headless });

        const contextOptions = { userAgent: USER_AGENT };
        if (CONFIG.AUTH_FILE_PATH && fs.existsSync(CONFIG.AUTH_FILE_PATH)) {
            contextOptions.storageState = CONFIG.AUTH_FILE_PATH;
        }

        const context = await browser.newContext(contextOptions);
        const page = await context.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2500);

        const finalUrl = page.url() || url;
        const html = await page.content();

        // 🚀 [최적화] 같은 세션에서 리뷰 탭도 클릭해 추가 데이터 수집 (2번째 브라우저 방문 불필요)
        let reviewHtml = null;
        try {
            await clickReviewTab(page);
            reviewHtml = await page.content();
        } catch (ignore) { }

        await context.close();
        await browser.close();

        return { finalUrl, html, reviewHtml };
    } catch (e) {
        if (browser) {
            try { await browser.close(); } catch (ignore) { }
        }
        Logger.warn(`⚠️ 브라우저 fallback 실패 (${url}): ${e.message}`);
        return null;
    }
}

async function resolveFinalUrlWithBrowser(url, referer = '', headless = true) {
    let browser;
    try {
        browser = await BrowserLauncher.launchBrowser({ headless });

        const contextOptions = { userAgent: USER_AGENT };
        if (referer) contextOptions.extraHTTPHeaders = { Referer: referer };

        const context = await browser.newContext(contextOptions);
        const page = await context.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(600);

        const finalUrl = page.url() || url;
        await context.close();
        await browser.close();
        return finalUrl;
    } catch (e) {
        if (browser) {
            try { await browser.close(); } catch (ignore) { }
        }
        return null;
    }
}

async function resolveReviewRichHtmlWithBrowser(url, headless = true) {
    let browser;
    try {
        browser = await BrowserLauncher.launchBrowser({ headless });

        const contextOptions = { userAgent: USER_AGENT };
        if (CONFIG.AUTH_FILE_PATH && fs.existsSync(CONFIG.AUTH_FILE_PATH)) {
            contextOptions.storageState = CONFIG.AUTH_FILE_PATH;
        }

        const context = await browser.newContext(contextOptions);
        const page = await context.newPage();
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForTimeout(2500);

        // 리뷰 탭 진입 시도 (상단 탭 클릭 중심)
        // 리뷰 탭 진입 시도 (상단 탭 클릭 중심)
        await clickReviewTab(page);

        const finalUrl = page.url() || url;
        const html = await page.content();

        await context.close();
        await browser.close();

        return { finalUrl, html };
    } catch (e) {
        if (browser) {
            try { await browser.close(); } catch (ignore) { }
        }
        Logger.warn(`⚠️ 리뷰 보강용 브라우저 수집 실패 (${url}): ${e.message}`);
        return null;
    }
}

async function resolveViaShoppingSearchApi(channelProductNo) {
    await RuntimeConfig.ensureNaverSearchCredentials();
    if (!CONFIG.NAVER_CLIENT_ID || !CONFIG.NAVER_CLIENT_SECRET) return null;

    try {
        const apiUrl = 'https://openapi.naver.com/v1/search/shop.json';
        const res = await axios.get(apiUrl, {
            headers: {
                'X-Naver-Client-Id': CONFIG.NAVER_CLIENT_ID,
                'X-Naver-Client-Secret': CONFIG.NAVER_CLIENT_SECRET
            },
            params: { query: channelProductNo, display: 20, sort: 'sim' },
            timeout: 15000
        });

        const items = res.data?.items || [];
        if (!Array.isArray(items) || items.length === 0) return null;

        const matched = items.find(item =>
            String(item.productId || '') === String(channelProductNo) ||
            String(item.link || '').includes(String(channelProductNo))
        ) || items[0];

        if (!matched) return null;

        const link = decodeHtml(matched.link || '');
        const image = decodeHtml(matched.image || '');
        const title = stripTags(decodeHtml(matched.title || ''));
        const category = [matched.category1, matched.category2, matched.category3, matched.category4].filter(Boolean).join(' > ');
        const body = [
            title ? `상품명: ${title}` : '',
            matched.mallName ? `스토어: ${matched.mallName}` : '',
            category ? `카테고리: ${category}` : '',
            matched.lprice ? `최저가: ${matched.lprice}` : '',
            matched.hprice ? `최고가: ${matched.hprice}` : ''
        ].filter(Boolean).join('\n');

        const commerceData = {
            salePrice: parseKrwNumber(matched.lprice),
            originalPrice: parseKrwNumber(matched.hprice),
            discountRate: null,
            freeShipping: false,
            deliveryMethods: [],
            installment: '',
            benefitHighlights: []
        };
        commerceData.facts = buildCommerceFacts(commerceData);

        return {
            title,
            description: '',
            body,
            imageUrls: image ? [image] : [],
            commerceData,
            reviewData: { reviewCount: null, averageRating: null, aiSummaryPoints: [], reviewSamples: [], reviewHighlights: [], facts: [] },
            productLink: link
        };
    } catch (e) {
        Logger.warn(`⚠️ 쇼핑 검색 API fallback 실패: ${e.message}`);
        return null;
    }
}

function extractDeepProductLinksFromHtml(html, channelProductNo) {
    if (!html) return [];

    const links = new Set();
    const variants = [
        String(html || ''),
        decodeHtml(unescapeJsEscapes(html)),
        decodeRepeatedly(decodeHtml(unescapeJsEscapes(html)))
    ];

    const directUrlRegex = /https?:\/\/(?:m\.)?smartstore\.naver\.com\/[^"'`\s<>]+\/products\/\d+(?:\?[^"'`\s<>]*)?/gi;
    const encodedUrlRegex = /https?:%2F%2F(?:m\.)?smartstore\.naver\.com%2F[^"'`\s<>]+/gi;

    for (const text of variants) {
        if (!text) continue;

        const directMatches = text.match(directUrlRegex) || [];
        for (const rawLink of directMatches) {
            const link = rawLink.trim();
            if (!channelProductNo || String(link).includes(String(channelProductNo))) {
                links.add(link);
            }
        }

        const encodedMatches = text.match(encodedUrlRegex) || [];
        for (const encodedLink of encodedMatches) {
            const decodedLink = decodeRepeatedly(encodedLink);
            const rematched = decodedLink.match(directUrlRegex) || [];
            for (const link of rematched) {
                if (!channelProductNo || String(link).includes(String(channelProductNo))) {
                    links.add(link);
                }
            }
        }
    }

    return Array.from(links);
}

function extractStoreAliasesFromHtml(html) {
    if (!html) return [];

    const aliases = new Set();
    const reserved = new Set(['main', 'm', 'i', 'api', 'products', 'product', 'search', 'category', 'event', 'notice']);

    const variants = [
        String(html || ''),
        decodeHtml(unescapeJsEscapes(html)),
        decodeRepeatedly(decodeHtml(unescapeJsEscapes(html)))
    ];

    const aliasRegex = /(?:https?:\/\/)?(?:m\.)?smartstore\.naver\.com\/([a-zA-Z0-9_-]{2,})/gi;
    const encodedAliasRegex = /smartstore\.naver\.com%2F([a-zA-Z0-9_-]{2,})/gi;

    for (const text of variants) {
        if (!text) continue;

        let matched;
        while ((matched = aliasRegex.exec(text)) !== null) {
            const alias = (matched[1] || '').trim();
            if (alias && !reserved.has(alias.toLowerCase())) aliases.add(alias);
        }

        let encodedMatched;
        while ((encodedMatched = encodedAliasRegex.exec(text)) !== null) {
            const alias = decodeRepeatedly(encodedMatched[1] || '').trim();
            if (alias && !reserved.has(alias.toLowerCase())) aliases.add(alias);
        }
    }

    return Array.from(aliases);
}

async function resolveProductDataFromChannelNo(channelProductNo, baseData, sourceHtml = '', options = {}) {
    const allowBrowserFallback = options.allowBrowserFallback !== false;
    const deepLinks = extractDeepProductLinksFromHtml(sourceHtml, channelProductNo);
    const storeAliases = extractStoreAliasesFromHtml(sourceHtml);
    const aliasLinks = storeAliases.flatMap(alias => ([
        `https://smartstore.naver.com/${alias}/products/${channelProductNo}`,
        `https://m.smartstore.naver.com/${alias}/products/${channelProductNo}`
    ]));

    const deepLinkSet = new Set(deepLinks);
    const aliasLinkSet = new Set(aliasLinks);
    const candidateUrls = [
        ...deepLinks,
        ...aliasLinks,
        `https://smartstore.naver.com/main/products/${channelProductNo}`,
        `https://m.smartstore.naver.com/main/products/${channelProductNo}`,
        `https://search.shopping.naver.com/catalog/${channelProductNo}`,
        `https://msearch.shopping.naver.com/catalog/${channelProductNo}`,
        `https://search.shopping.naver.com/search/all?query=${channelProductNo}`
    ];
    const uniqueCandidates = [...new Set(candidateUrls)];

    for (const url of uniqueCandidates) {
        const resolved = await resolveCandidateUrl(url);
        if (!resolved) continue;

        const candidateData = extractProductData(resolved.finalUrl, resolved.html);
        const merged = mergeProductData(baseData, candidateData);
        if (!isLikelyInvalidLanding(merged, resolved.finalUrl)) {
            Logger.info(`✅ [Shopping] 채널번호 fallback 성공: ${resolved.finalUrl}`);
            return {
                productData: merged,
                finalUrl: resolved.finalUrl,
                source: deepLinkSet.has(url) ? 'deep_link_from_brandconnect'
                    : aliasLinkSet.has(url) ? 'store_alias_fallback'
                        : 'catalog_fallback'
            };
        }
    }

    if (allowBrowserFallback) {
        const browserCandidates = uniqueCandidates.slice(0, 5);
        for (const url of browserCandidates) {
            const resolved = await resolveCandidateUrlWithBrowser(url);
            if (!resolved) continue;

            const candidateData = extractProductData(resolved.finalUrl, resolved.html);
            const merged = mergeProductData(baseData, candidateData);
            if (!isLikelyInvalidLanding(merged, resolved.finalUrl)) {
                Logger.info(`✅ [Shopping] 브라우저 fallback 성공: ${resolved.finalUrl}`);
                return {
                    productData: merged,
                    finalUrl: resolved.finalUrl,
                    source: deepLinkSet.has(url) ? 'deep_link_from_brandconnect_browser'
                        : aliasLinkSet.has(url) ? 'store_alias_fallback_browser'
                            : 'catalog_fallback_browser'
                };
            }
        }
    }

    const searchFallback = await resolveViaShoppingSearchApi(channelProductNo);
    if (searchFallback) {
        const merged = mergeProductData(baseData, {
            title: searchFallback.title,
            description: searchFallback.description,
            body: searchFallback.body,
            imageUrls: searchFallback.imageUrls,
            structuredProduct: null,
            commerceData: searchFallback.commerceData,
            reviewData: searchFallback.reviewData
        });
        const finalUrl = searchFallback.productLink || `channelProductNo:${channelProductNo}`;
        Logger.info(`✅ [Shopping] 검색API fallback 적용: ${finalUrl}`);
        return { productData: merged, finalUrl, source: 'shop_search_api' };
    }

    return null;
}

function resolveLocalImagePath(source) {
    const raw = String(source || '').trim();
    if (!raw) return '';
    if (/^https?:\/\//i.test(raw)) return '';

    if (typeof CONFIG.resolveRuntimePath === 'function') {
        const resolved = CONFIG.resolveRuntimePath(raw, { mustExist: true });
        if (resolved) {
            try {
                if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return resolved;
            } catch (e) { }
        }
    }

    const execDir = path.dirname(process.execPath || process.cwd());
    const appRoot = CONFIG.APP_ROOT_DIR || process.cwd();
    const configDir = CONFIG.CONFIG_DIR
        || (CONFIG.CONFIG_SOURCE_PATH ? path.dirname(CONFIG.CONFIG_SOURCE_PATH) : path.join(appRoot, 'config'));
    const candidates = [];

    if (/^file:\/\//i.test(raw)) {
        try {
            const parsed = new URL(raw);
            if (parsed.protocol === 'file:') {
                const host = decodeURIComponent(parsed.hostname || '');
                let localPath = decodeURIComponent(parsed.pathname || '');
                if (host === '.') {
                    localPath = `.${localPath}`;
                } else if (host && host !== 'localhost') {
                    localPath = `//${host}${localPath}`;
                }
                if (process.platform === 'win32' && /^[\/\\][A-Za-z]:/.test(localPath)) {
                    localPath = localPath.slice(1);
                }
                if (localPath) candidates.push(localPath);
            }
        } catch (e) {
            const afterScheme = raw.replace(/^file:\/\//i, '');
            if (afterScheme) candidates.push(afterScheme);
        }
    } else {
        candidates.push(raw);
    }

    const expanded = [];
    for (const candidate of candidates) {
        const normalized = String(candidate || '').trim();
        if (!normalized) continue;
        if (path.isAbsolute(normalized)) {
            expanded.push(normalized);
        } else {
            expanded.push(path.resolve(appRoot, normalized));
            expanded.push(path.resolve(configDir, normalized));
            expanded.push(path.resolve(execDir, normalized));
        }
    }

    for (const candidate of expanded) {
        try {
            if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
                return candidate;
            }
        } catch (e) { }
    }

    return '';
}

async function downloadImage(url, saveDir, index, label, referer = '', options = {}) {
    const rawSource = String(url || '').trim();
    const localSourcePath = resolveLocalImagePath(url);

    // 원본 파일명 추출 (URL의 마지막 세그먼트에서 쿼리 제외)
    let originalName = 'image';
    try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname;
        const lastPart = pathname.split('/').pop() || '';
        if (lastPart) {
            originalName = lastPart.split('.')[0] || 'image';
        }
    } catch (e) {
        // ignore
    }

    const prefix = String(index).padStart(2, '0');
    const safeLabel = Utils.sanitizeFileName(label || 'image').toLowerCase();
    const safeOriginal = Utils.sanitizeFileName(originalName).slice(0, 30);

    if (/^file:\/\//i.test(rawSource) && !localSourcePath) {
        throw new Error(`로컬 이미지 파일을 찾을 수 없습니다: ${rawSource}`);
    }

    if (localSourcePath) {
        const ext = guessExtension(localSourcePath, '');
        const dataBuffer = fs.readFileSync(localSourcePath);
        const skipSizeCheck = options.skipSizeCheck === true;
        if (!skipSizeCheck && dataBuffer.length < 10 * 1024) {
            const reason = `용량 부족 (${dataBuffer.length} bytes)`;
            Logger.info(`[Skip] ${url} (이유: ${reason})`);
            throw new Error(`이미지 용량이 너무 작아 스킵합니다 (${dataBuffer.length} bytes)`);
        }
        const skipQualityCheck = options.skipQualityCheck === true;
        if (!skipQualityCheck) {
            const dimensions = getImageDimensions(dataBuffer, ext);
            if (!isLikelyUsableProductImage(dimensions)) {
                const reason = `부적합 해상도/비율 (${dimensions.width}x${dimensions.height})`;
                Logger.info(`[Skip] ${url} (이유: ${reason})`);
                throw new Error(`이미지 해상도/비율이 본문용으로 부적합하여 스킵합니다 (${dimensions.width}x${dimensions.height})`);
            }
        }

        const filename = `${prefix}_${safeLabel}_${safeOriginal}.${ext}`;
        const filePath = path.join(saveDir, filename);
        fs.writeFileSync(filePath, dataBuffer);
        const sourceLabel = options.source ? ` (${options.source})` : '';
        Logger.info(`[Download] ${url} -> ${filename}${sourceLabel} (Local)`);
        return filePath;
    }

    const requestImage = async (targetUrl) => axios.get(targetUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
        maxRedirects: 10,
        validateStatus: () => true,
        headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
            'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
            'Referer': referer || undefined
        }
    });

    let response = await requestImage(url);
    let resolvedUrl = response?.request?.res?.responseUrl || url;
    const firstContentType = String(response?.headers?.['content-type'] || '').toLowerCase();
    const firstFailed = response.status >= 400 || firstContentType.includes('text/html');

    if (firstFailed) {
        Logger.info(`ℹ️ 단축/중계 이미지 URL 재해석 시도: ${url} (status=${response.status || 'N/A'})`);
        const browserResolved = await resolveFinalUrlWithBrowser(url, referer);
        if (browserResolved && browserResolved !== url) {
            Logger.info(`ℹ️ 브라우저 최종 URL 해석 성공: ${browserResolved}`);
            response = await requestImage(browserResolved);
            resolvedUrl = response?.request?.res?.responseUrl || browserResolved;
        }
    }

    if (response.status >= 400) {
        throw new Error(`Request failed with status code ${response.status}`);
    }

    const contentType = String(response?.headers?.['content-type'] || '').toLowerCase();
    if (contentType.includes('text/html')) {
        throw new Error('이미지 URL이 HTML 문서로 응답했습니다.');
    }

    const ext = guessExtension(resolvedUrl, response.headers?.['content-type']);
    const dataBuffer = Buffer.from(response.data);
    const skipSizeCheck = options.skipSizeCheck === true;
    if (!skipSizeCheck && dataBuffer.length < 10 * 1024) {
        const reason = `용량 부족 (${dataBuffer.length} bytes)`;
        // 🚀 [개선] main_gallery 가 아닌 일반 이미지의 용량 부족은 경고 로그를 남기지 않고 조용히 스킵합니다.
        if (options.source === 'main_gallery') {
            Logger.info(`[Skip] ${url} (이유: ${reason})`);
            throw new Error(`이미지 용량이 너무 작아 스킵합니다 (${dataBuffer.length} bytes)`);
        } else {
            throw new Error(`이미지 용량이 너무 작아 스킵합니다 (${dataBuffer.length} bytes)`);
        }
    }
    const skipQualityCheck = options.skipQualityCheck === true;
    if (!skipQualityCheck) {
        const dimensions = getImageDimensions(dataBuffer, ext);
        if (!isLikelyUsableProductImage(dimensions)) {
            const reason = `부적합 해상도/비율 (${dimensions.width}x${dimensions.height})`;
            Logger.info(`[Skip] ${url} (이유: ${reason})`);
            throw new Error(`이미지 해상도/비율이 본문용으로 부적합하여 스킵합니다 (${dimensions.width}x${dimensions.height})`);
        }
    }

    const filename = `${prefix}_${safeLabel}_${safeOriginal}.${ext}`;
    const filePath = path.join(saveDir, filename);

    fs.writeFileSync(filePath, dataBuffer);
    const sourceLabel = options.source ? ` (${options.source})` : '';
    Logger.info(`[Download] ${url} -> ${filename}${sourceLabel}`);
    return filePath;
}


async function transformShoppingImage(localPath) {
    // TODO: v2에서 이미지 변형(텍스트 오버레이/누끼 등) 적용 예정
    return localPath;
}

function normalizeAiBlockType(type = '') {
    const raw = normalizeWhitespace(type).toLowerCase().replace(/[\s_-]+/g, '');
    if (!raw) return 'section';

    const aliases = {
        scene: 'scene',
        opening: 'scene',
        story: 'scene',
        problem: 'problem',
        pain: 'problem',
        decision: 'decision',
        reason: 'decision',
        proof: 'proof',
        evidence: 'proof',
        comparison: 'comparison',
        compare: 'comparison',
        review: 'review',
        usage: 'review',
        tip: 'tip',
        tips: 'tip',
        recommendation: 'recommendation',
        recommend: 'recommendation',
        faq: 'faq',
        cta: 'cta',
        quote: 'quote',
        section: 'section'
    };

    return aliases[raw] || 'section';
}

function normalizeAiBlock(rawBlock = {}) {
    const bullets = Array.isArray(rawBlock.bullets)
        ? rawBlock.bullets.map(v => normalizeFactText(v)).filter(Boolean).slice(0, 5)
        : [];

    return {
        type: normalizeAiBlockType(rawBlock.type),
        heading: normalizeWhitespace(rawBlock.heading || ''),
        body: normalizeWhitespace(rawBlock.body || ''),
        bullets,
        quote: normalizeWhitespace(rawBlock.quote || ''),
        ctaPhrase: normalizeWhitespace(rawBlock.cta_phrase || rawBlock.ctaPhrase || '')
    };
}

function isNarrativeBlockType(type = '') {
    return !['quote', 'cta'].includes(normalizeAiBlockType(type));
}

function parseAiJson(rawText, fallbackTitle) {
    try {
        const parsed = JSON.parse(stripCodeFence(rawText));
        const blocks = Array.isArray(parsed.blocks)
            ? parsed.blocks.map(normalizeAiBlock).filter(block => (
                block.heading || block.body || block.bullets.length > 0 || block.quote || block.ctaPhrase
            ))
            : [];

        return {
            title: parsed.title || fallbackTitle,
            intro: parsed.intro || '',
            blocks,
            conclusion: parsed.conclusion || '',
            ctaPhrases: Array.isArray(parsed.cta_phrases) ? parsed.cta_phrases.map(v => normalizeWhitespace(v)).filter(Boolean) : [],
            hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : []
        };
    } catch (e) {
        Logger.warn(`⚠️ 쇼핑 콘텐츠 JSON 파싱 실패: ${e.message}`);
        return {
            title: fallbackTitle,
            intro: '',
            blocks: [],
            conclusion: '',
            ctaPhrases: [],
            hashtags: []
        };
    }
}

function composeMarkdown({
    aiData,
    shortUrl,
    ftcImage,
    productImages,
    ctaImages = [],
    linkInsertCount,
    relatedPosts = [],
    relatedHeading = '함께 보면 좋은 글',
    enableRelatedPostsAutoLink = true,
    platform = 'naver'
}) {
    const lines = [];
    const renderBlocks = Array.isArray(aiData?.blocks) ? aiData.blocks.filter(Boolean) : [];
    if (renderBlocks.length === 0) {
        renderBlocks.push({
            type: 'section',
            heading: '이 제품을 보기 시작한 이유',
            body: '상품의 핵심 특징과 구매 포인트를 실제 사용 관점에서 정리해보겠습니다.',
            bullets: [],
            quote: '',
            ctaPhrase: ''
        });
    }

    const seed = computeStringSeed(
        aiData.title,
        shortUrl,
        aiData.intro,
        renderBlocks.map((block) => `${block.type}:${block.heading}:${block.body}`).join('|')
    );
    const fallbackCtaHeadings = getDefaultCtaHeadings(seed);
    const ctaPhrases = aiData.ctaPhrases.length > 0
        ? uniqStrings(aiData.ctaPhrases.map(normalizeFactText)).slice(0, 5)
        : getDefaultLinkPhrases(seed);
    const closingCtaPhrases = getDefaultClosingCtaPhrases(seed);
    const explicitCtaBlocks = renderBlocks.filter((block) => normalizeAiBlockType(block.type) === 'cta').length;
    const requestedLinkCount = clampInt(linkInsertCount, 1, 10, DEFAULT_LINK_INSERT_COUNT);
    const targetLinkCount = explicitCtaBlocks > 0
        ? Math.min(requestedLinkCount, 1)
        : Math.min(requestedLinkCount, 2);
    const ctaImageInsertCount = Array.isArray(ctaImages) ? ctaImages.length : 0;
    const genericContentBlocks = renderBlocks.filter((block) => !['quote', 'cta'].includes(block.type));
    const genericCtaEvery = Math.max(2, Math.ceil(genericContentBlocks.length / Math.max(1, targetLinkCount)));

    lines.push(`# ${aiData.title}`);
    lines.push('');

    if (ftcImage) {
        lines.push(buildImageBlock(ftcImage.index, '공정위 안내 이미지', ftcImage.prompt));
        lines.push('');
    }

    if (!ftcImage) {
        lines.push('※ 이 포스팅에는 제휴 링크가 포함되어 있으며, 일정 수수료를 받을 수 있습니다.');
        lines.push('');
    }

    if (aiData.intro) {
        lines.push(aiData.intro);
        lines.push('');
    }

    let imageCursor = 0;
    let narrativeBlocksSeen = 0;
    let ctaOpportunitiesSeen = 0;
    let linksInserted = 0;
    let ctaImageCursor = 0;

    const insertNextProductImage = () => {
        if (imageCursor >= productImages.length) return false;
        const image = productImages[imageCursor];
        const imageBlock = buildImageBlock(image.index, image.title, image.prompt);

        if (platform === 'wordpress' && shortUrl) {
            // 워드프레스: 상품 이미지에 상품 URL 링크 적용 (CTR 향상)
            lines.push(`[${imageBlock}](${shortUrl})`);
        } else {
            lines.push(imageBlock);
        }
        lines.push('');
        imageCursor++;
        return true;
    };

    // 도입 직후 첫 제품 이미지를 우선 배치해 시각 몰입을 높인다.
    insertNextProductImage();

    const insertCtaImageBlock = () => {
        if (!Array.isArray(ctaImages) || ctaImageCursor >= ctaImages.length) return;
        const ctaImage = ctaImages[ctaImageCursor];
        const imageBlock = buildImageBlock(ctaImage.index, ctaImage.title, ctaImage.prompt);

        if (platform === 'wordpress' && shortUrl) {
            lines.push(`[${imageBlock}](${shortUrl})`);
        } else {
            lines.push(imageBlock);
        }
        lines.push('');
        ctaImageCursor++;
    };

    const insertLinkLine = (options = {}) => {
        if (!options.force && linksInserted >= targetLinkCount) return false;
        if (!shortUrl) return false;

        if (ctaImageCursor < ctaImageInsertCount) {
            insertCtaImageBlock();
        }

        const heading = normalizeWhitespace(options.heading || '');
        const body = normalizeWhitespace(options.body || '');
        const bullets = Array.isArray(options.bullets)
            ? options.bullets.map(normalizeFactText).filter(Boolean).slice(0, 3)
            : [];
        const phrasePool = linksInserted >= targetLinkCount
            ? closingCtaPhrases
            : ctaPhrases;
        const phrase = normalizeFactText(options.phrase || phrasePool[linksInserted % phrasePool.length] || '지금 구매 포인트 확인하기');

        if (heading) {
            lines.push(`## ${heading}`);
            lines.push('');
        }
        if (body) {
            lines.push(body);
            lines.push('');
        }
        if (bullets.length > 0) {
            bullets.forEach((item) => lines.push(`- ${item}`));
            lines.push('');
        }

        if (platform === 'wordpress' && shortUrl) {
            lines.push(`🛒 [${phrase}](${shortUrl})`);
        } else {
            lines.push(`🛒 ${phrase}`);
            lines.push(shortUrl);
        }
        lines.push('');
        linksInserted++;
        return true;
    };

    const renderBlock = (block) => {
        const heading = normalizeWhitespace(block.heading || '');
        const body = normalizeWhitespace(block.body || '');
        const bullets = Array.isArray(block.bullets) ? block.bullets.map(normalizeFactText).filter(Boolean) : [];
        const quote = normalizeWhitespace(block.quote || '');
        const type = normalizeAiBlockType(block.type);

        if (type === 'quote') {
            if (quote) {
                lines.push(`> ${normalizeFactText(quote)}`);
                lines.push('');
            }
            return;
        }

        if (type === 'cta') {
            insertLinkLine({
                heading: heading || fallbackCtaHeadings[linksInserted % fallbackCtaHeadings.length],
                body,
                bullets,
                phrase: block.ctaPhrase || ''
            });
            if (quote) {
                lines.push(`> ${normalizeFactText(quote)}`);
                lines.push('');
            }
            return;
        }

        if (heading) lines.push(`## ${heading}`);
        if (body) lines.push(body);
        if (body || heading) lines.push('');
        if (bullets.length > 0) {
            bullets.forEach((item) => lines.push(`- ${item}`));
            lines.push('');
            lines.push(''); // 🚀 [개선] 리스트 뒤 가독성을 위한 추가 개행
        }
        if (quote) {
            lines.push(`> ${normalizeFactText(quote)}`);
            lines.push('');
        }
    };

    for (const block of renderBlocks) {
        renderBlock(block);

        if (isNarrativeBlockType(block.type)) {
            narrativeBlocksSeen++;
            // 🚀 [개선] 이미지 밀도 강화: 모든 서사 블록마다 이미지 삽입 시도
            if (imageCursor < productImages.length) {
                insertNextProductImage();
            }
        }

        if (!['quote', 'cta'].includes(block.type)) {
            ctaOpportunitiesSeen++;
            if (explicitCtaBlocks === 0 && linksInserted < targetLinkCount && ctaOpportunitiesSeen % genericCtaEvery === 0) {
                insertLinkLine();
            }
        }
    }

    if (aiData.conclusion) {
        lines.push('## 마무리');
        lines.push(aiData.conclusion);
        lines.push('');
    }

    while (shortUrl && linksInserted < targetLinkCount) {
        const inserted = insertLinkLine({
            heading: linksInserted === 0 ? fallbackCtaHeadings[linksInserted % fallbackCtaHeadings.length] : '',
            force: true
        });
        if (!inserted) break;
    }

    if (linksInserted === 0 && shortUrl) {
        insertLinkLine({
            heading: fallbackCtaHeadings[0],
            phrase: closingCtaPhrases[0] || '지금 구매 포인트 확인하기',
            force: true
        });
    }

    if (enableRelatedPostsAutoLink) {
        if (platform === 'wordpress') {
            // 워드프레스: 제목에 URL 링크 적용 (generateRelatedPostsMarkdown 형식과 동일)
            lines.push(`## ${relatedHeading}`);
            lines.push('');
            if (Array.isArray(relatedPosts) && relatedPosts.length > 0) {
                relatedPosts.slice(0, 3).forEach(post => {
                    const relatedUrl = normalizeWhitespace(post.url || '');
                    const relatedTitle = normalizeWhitespace(post.title || '');
                    if (!/^https?:\/\//i.test(relatedUrl)) return;
                    if (relatedTitle) {
                        lines.push(`* [${relatedTitle}](${relatedUrl})`);
                    } else {
                        lines.push(`* ${relatedUrl}`);
                    }
                });
            } else {
                lines.push('* 관련 글 링크를 여기에 추가하세요');
            }
        } else {
            // 네이버: URL 단독 라인 -> 에디터 링크카드 자동 변환 대상
            lines.push(`## ${relatedHeading}`);
            if (Array.isArray(relatedPosts) && relatedPosts.length > 0) {
                relatedPosts.slice(0, 3).forEach(post => {
                    const relatedUrl = normalizeWhitespace(post.url || '');
                    if (!/^https?:\/\//i.test(relatedUrl)) return;
                    lines.push(relatedUrl);
                });
            } else {
                lines.push('https://blog.naver.com/여기에_링크_추가_1');
                lines.push('https://blog.naver.com/여기에_링크_추가_2');
                lines.push('https://blog.naver.com/여기에_링크_추가_3');
            }
        }
        lines.push('');
        lines.push('');
    }

    const normalizedHashtags = normalizeHashtagTokens(aiData.hashtags || [], 20);
    if (normalizedHashtags.length > 0) {
        lines.push(normalizedHashtags.map(tag => `#${tag}`).join(' '));
    }

    return lines.join('\n').trim() + '\n';
}

const ShoppingManager = {
    previewFromShortUrl: async function (shortUrl) {
        if (!shortUrl) throw new Error('쇼핑 URL이 비어 있습니다.');

        Logger.info(`🛍️ [Shopping] 미리보기 URL 분석 시작: ${shortUrl}`);
        const initial = await resolveUrlAndHtml(shortUrl);
        let sourceHtml = initial.html;
        let finalUrl = initial.finalUrl;
        let productData = extractProductData(finalUrl, initial.html);
        let resolvedSource = 'short_url';
        let channelProductNo = extractChannelProductNo(finalUrl);

        // 미리보기는 UI 응답성과 안정성을 위해 "브라우저 fallback 없이" 가볍게 처리한다.
        if (isLikelyInvalidLanding(productData, finalUrl)) {
            const deepLinks = extractDeepProductLinksFromHtml(sourceHtml, channelProductNo).slice(0, 2);
            for (const link of deepLinks) {
                const resolved = await resolveCandidateUrl(link);
                if (!resolved) continue;
                const candidateData = extractProductData(resolved.finalUrl, resolved.html);
                const merged = mergeProductData(productData, candidateData);
                if (!isLikelyInvalidLanding(merged, resolved.finalUrl)) {
                    finalUrl = resolved.finalUrl;
                    productData = merged;
                    resolvedSource = 'short_url_deeplink';
                    break;
                }
            }
        }

        if (isLikelyInvalidLanding(productData, finalUrl) && channelProductNo) {
            const fallback = await resolveProductDataFromChannelNo(channelProductNo, productData, sourceHtml, { allowBrowserFallback: false });
            if (fallback) {
                finalUrl = fallback.finalUrl;
                productData = fallback.productData;
                resolvedSource = fallback.source || resolvedSource;
            }
        }

        if (isLikelyInvalidLanding(productData, finalUrl) && channelProductNo) {
            const searchFallback = await resolveViaShoppingSearchApi(channelProductNo);
            if (searchFallback) {
                const fallbackData = {
                    title: searchFallback.title,
                    description: searchFallback.description,
                    body: searchFallback.body,
                    imageUrls: searchFallback.imageUrls,
                    commerceData: searchFallback.commerceData,
                    reviewData: searchFallback.reviewData
                };
                productData = mergeProductData(productData, fallbackData);
                finalUrl = searchFallback.productLink || finalUrl;
                resolvedSource = 'shop_search_api';
            }
        }

        if (isLikelyInvalidLanding(productData, finalUrl)) {
            throw new Error(`상품 정보를 추출하지 못했습니다. 단축 URL이 상품 페이지를 가리키는지 확인해주세요. (resolved: ${finalUrl})`);
        }

        const titleBase = productData.title || `쇼핑 리뷰 (${getHostLabel(finalUrl)})`;
        const thumbnailUrl = Array.isArray(productData.imageUrls) && productData.imageUrls.length > 0
            ? String(productData.imageUrls[0] || '').trim()
            : '';
        const salePrice = productData.commerceData?.salePrice || null;
        const originalPrice = productData.commerceData?.originalPrice || null;
        const discountRate = productData.commerceData?.discountRate || null;

        return {
            shortUrl,
            finalUrl,
            title: titleBase,
            productNameSuggestion: titleBase,
            thumbnailUrl,
            resolvedSource,
            imageCount: Array.isArray(productData.imageUrls) ? productData.imageUrls.length : 0,
            commerce: {
                salePrice,
                originalPrice,
                discountRate,
                salePriceText: salePrice ? formatKrw(salePrice) : '',
                originalPriceText: originalPrice ? formatKrw(originalPrice) : ''
            }
        };
    },

    scrapeShoppingProduct: async function (shortUrl, runtimeOptions = {}) {
        if (!shortUrl) throw new Error('쇼핑 URL이 비어 있습니다.');
        const scrapingHeadless = typeof runtimeOptions.headless === 'boolean' ? runtimeOptions.headless : true;

        Logger.info(`🛍️ [Shopping] URL 분석 시작: ${shortUrl}`);
        const initial = await resolveUrlAndHtml(shortUrl);
        let sourceHtml = initial.html;
        let finalUrl = initial.finalUrl;
        let productData = extractProductData(finalUrl, initial.html);
        let resolvedSource = 'short_url';
        let channelProductNo = extractChannelProductNo(finalUrl);
        let reviewEnrichedWithBrowser = false;
        let browserResolvedReviewHtml = null;

        if (isLikelyInvalidLanding(productData, finalUrl)) {
            const browserResolved = await resolveCandidateUrlWithBrowser(shortUrl, scrapingHeadless);
            if (browserResolved) {
                const browserData = extractProductData(browserResolved.finalUrl, browserResolved.html);
                sourceHtml = browserResolved.html || sourceHtml;
                if (!isLikelyInvalidLanding(browserData, browserResolved.finalUrl)) {
                    finalUrl = browserResolved.finalUrl;
                    productData = mergeProductData(productData, browserData);
                    resolvedSource = 'short_url_browser';
                }
                if (!channelProductNo) {
                    channelProductNo = extractChannelProductNo(browserResolved.finalUrl);
                }
                if (browserResolved.reviewHtml) {
                    browserResolvedReviewHtml = browserResolved.reviewHtml;
                }
            }
        }

        if (isLikelyInvalidLanding(productData, finalUrl)) {
            if (channelProductNo) {
                const fallback = await resolveProductDataFromChannelNo(channelProductNo, productData, sourceHtml);
                if (fallback) {
                    finalUrl = fallback.finalUrl;
                    productData = fallback.productData;
                    resolvedSource = fallback.source || resolvedSource;
                }
            }
        }

        if (isLikelyInvalidLanding(productData, finalUrl)) {
            throw new Error(`상품 정보를 추출하지 못했습니다. 단축 URL이 상품 페이지를 가리키는지 확인해주세요. (resolved: ${finalUrl})`);
        }

        // 🚀 [개선] 리뷰 개수에 상관없이 리뷰 탭은 무조건 방문하여 AI 요약 및 상세 정보를 수집합니다.
        const needsReviewEnrichment = true;

        if (needsReviewEnrichment) {
            Logger.info('🛍️ [Shopping] 리뷰 데이터 보강 수집 시작');
            const reviewTargetUrl = String(finalUrl || '').replace(/#.*$/, '');
            let reviewResolved;
            if (browserResolvedReviewHtml) {
                Logger.info('♻️ [Shopping] 1차 브라우저 패스 리뷰 HTML 재사용 (추가 브라우저 방문 생략)');
                reviewResolved = { finalUrl: reviewTargetUrl, html: browserResolvedReviewHtml };
            } else {
                reviewResolved = await resolveReviewRichHtmlWithBrowser(reviewTargetUrl, scrapingHeadless);
            }

            if (reviewResolved?.html) {
                const reviewCandidate = extractProductData(reviewResolved.finalUrl || reviewTargetUrl || finalUrl, reviewResolved.html);
                const mergedReviewData = mergeProductData(productData, reviewCandidate);
                const beforeSamples = (productData.reviewData?.reviewSamples || []).length;
                const afterSamples = (mergedReviewData.reviewData?.reviewSamples || []).length;
                const beforeFacts = (productData.reviewData?.facts || []).length;
                const afterFacts = (mergedReviewData.reviewData?.facts || []).length;

                Logger.info(`🛍️ [Shopping] 리뷰 데이터 추출 완료 (샘플: ${afterSamples}건, 요약: ${afterFacts}건)`);

                productData = mergedReviewData;
                if (reviewResolved.finalUrl) finalUrl = reviewResolved.finalUrl;
                reviewEnrichedWithBrowser = afterSamples > beforeSamples || afterFacts > beforeFacts;
            }
        }

        return { productData, finalUrl, resolvedSource, channelProductNo, reviewEnrichedWithBrowser };
    },

    buildPostFromShortUrl: async function (shortUrl, runtimeOptions = {}) {
        if (!shortUrl) throw new Error('쇼핑 URL이 비어 있습니다.');

        const linkInsertCount = clampInt(CONFIG.SHOPPING_LINK_INSERT_COUNT, 1, 10, DEFAULT_LINK_INSERT_COUNT);
        const imageLimit = typeof runtimeOptions.imageLimit === 'number'
            ? runtimeOptions.imageLimit
            : clampInt(CONFIG.SHOPPING_IMAGE_MAX_COUNT, 1, 20, DEFAULT_IMAGE_MAX_COUNT);
        const ctaImageInsertCount = clampInt(CONFIG.SHOPPING_CTA_IMAGE_INSERT_COUNT, 0, 10, DEFAULT_CTA_IMAGE_INSERT_COUNT);
        const ftcImageUrl = (CONFIG.FTC_DISCLOSURE_IMAGE_URL || '').trim();
        const ctaImageUrls = getConfiguredCtaImageUrls();

        Logger.info(`🛍️ [Shopping] CTA 이미지 설정: 삽입 ${ctaImageInsertCount}회, 소스 ${ctaImageUrls.length}개`);

        let productData, finalUrl, resolvedSource, channelProductNo, reviewEnrichedWithBrowser;
        if (runtimeOptions.preScrapedData) {
            Logger.info('♻️ [Shopping] 기수집된 쇼핑 데이터를 재사용합니다.');
            productData = runtimeOptions.preScrapedData.productData;
            finalUrl = runtimeOptions.preScrapedData.finalUrl;
            resolvedSource = runtimeOptions.preScrapedData.resolvedSource || 'pre_scraped';
            channelProductNo = runtimeOptions.preScrapedData.channelProductNo;
            reviewEnrichedWithBrowser = runtimeOptions.preScrapedData.reviewEnrichedWithBrowser || false;
        } else {
            const scraped = await this.scrapeShoppingProduct(shortUrl, runtimeOptions);
            productData = scraped.productData;
            finalUrl = scraped.finalUrl;
            resolvedSource = scraped.resolvedSource;
            channelProductNo = scraped.channelProductNo;
            reviewEnrichedWithBrowser = scraped.reviewEnrichedWithBrowser;
        }

        const titleBase = productData.title || `쇼핑 리뷰 (${getHostLabel(finalUrl)})`;

        const wsDir = Utils.resolvePlatformWorkspaceDir(runtimeOptions.platform);
        const timestamp = moment().tz('Asia/Seoul').format('YYYYMMDD_HHmmss');
        const safeTitle = Utils.sanitizeFileName(titleBase);
        const targetDir = path.join(wsDir, `${timestamp}_${safeTitle}`);
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

        const productImages = [];
        let nextImageIndex = 0;

        // 🚀 [Feature] 이미지 큐 구성 최적화 (main_gallery 우선순위 강화)
        // 🌟 [개선] main_gallery 이미지가 있다면 그것들만 우선적으로 사용하도록 필터링합니다.
        let mainGalleryUrls = (productData.imageMeta || [])
            .filter(m => m.source === 'main_gallery')
            .map(m => m.url);

        let otherUrls = (productData.imageUrls || []).filter(url => !mainGalleryUrls.includes(url));

        // 셔플 함수 (Fisher-Yates)
        const shuffleArray = (array) => {
            const arr = [...array];
            for (let i = arr.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [arr[i], arr[j]] = [arr[j], arr[i]];
            }
            return arr;
        };

        let finalImageUrls = [];
        if (mainGalleryUrls.length > 0) {
            // main_gallery가 있으면 첫 번째는 무조건 gallery의 첫 번째로 고정
            const firstMain = mainGalleryUrls[0];
            // 나머지 gallery 이미지들만 먼저 섞음
            const restMain = shuffleArray(mainGalleryUrls.slice(1));
            // 기타 이미지들은 그 뒤에 붙임
            const shuffledOthers = shuffleArray(otherUrls);
            finalImageUrls = [firstMain, ...restMain, ...shuffledOthers];
            Logger.info(`📸 [Shopping] 이미지 큐 구성: 메인 갤러리(${mainGalleryUrls.length}) + 기타(${otherUrls.length})`);
        } else {
            // main_gallery가 없는 경우 전체 셔플 (첫 번째는 고정)
            let allUrls = [...(productData.imageUrls || [])];
            if (allUrls.length > 1) {
                const first = allUrls[0];
                const rest = shuffleArray(allUrls.slice(1));
                finalImageUrls = [first, ...rest];
            } else {
                finalImageUrls = allUrls;
            }
            Logger.info(`📸 [Shopping] 이미지 큐 구성: 전체(${finalImageUrls.length}) - 메인 갤러리 없음`);
        }


        let ftcImage = null;
        if (ftcImageUrl) {
            try {
                const ftcIndex = nextImageIndex++;
                const ftcPath = await downloadImage(ftcImageUrl, targetDir, ftcIndex, 'ftc_disclosure', finalUrl, { skipQualityCheck: true });
                const transformedFtcPath = await transformShoppingImage(ftcPath);
                ftcImage = { index: ftcIndex, path: transformedFtcPath, prompt: ftcImageUrl };
            } catch (e) {
                throw new Error(`공정위 이미지 다운로드 실패: ${e.message}`);
            }
        } else {
            throw new Error('FTC_DISCLOSURE_IMAGE_URL 설정이 없어 쇼핑 포스팅을 진행할 수 없습니다.');
        }

        const ctaImages = [];
        if (ctaImageUrls.length > 0 && ctaImageInsertCount > 0) {
            const randomStart = Math.floor(Math.random() * ctaImageUrls.length);
            for (let i = 0; i < ctaImageInsertCount; i++) {
                const ctaImageUrl = ctaImageUrls[(randomStart + i) % ctaImageUrls.length];
                try {
                    const ctaPath = await downloadImage(ctaImageUrl, targetDir, nextImageIndex, 'cta_image', finalUrl, {
                        skipQualityCheck: true,
                        skipSizeCheck: true
                    });
                    const transformedCtaPath = await transformShoppingImage(ctaPath);
                    ctaImages.push({
                        index: nextImageIndex,
                        path: transformedCtaPath,
                        title: '혜택 안내 이미지',
                        prompt: ctaImageUrl
                    });
                    nextImageIndex++;
                } catch (e) {
                    Logger.warn(`⚠️ CTA 이미지 다운로드 실패: ${e.message}`);
                }
            }
        }

        for (const url of finalImageUrls) {
            if (nextImageIndex >= imageLimit) break;
            try {
                // 해당 URL의 메타데이터를 찾아 출처(source) 파악
                const meta = (productData.imageMeta || []).find(m => m.url === url);
                const source = meta ? meta.source : 'DOM';

                const filePath = await downloadImage(url, targetDir, nextImageIndex + 3, 'product', finalUrl, {
                    source
                });
                productImages.push({
                    index: nextImageIndex + 3,
                    path: filePath,
                    url: url,
                    title: `상품 이미지 ${productImages.length + 1}`,
                    prompt: url
                });
                nextImageIndex++;
            } catch (err) {
                // downloadImage 내부에서 처리됨
            }
        }

        const platform = runtimeOptions.platform || 'naver';
        const aiPrompt = buildAiPrompt({
            title: titleBase,
            description: productData.description,
            body: productData.body,
            commerceData: productData.commerceData,
            reviewData: productData.reviewData
        }, platform);
        Logger.info(`📝 [Shopping/${platform}] AI에게 글 작성을 요청합니다...`);
        const aiRaw = await Utils.callWritingText(aiPrompt, 3, {
            usageLabel: `Shopping/${platform}`
        });
        const aiData = parseAiJson(aiRaw, titleBase);
        const blockCountBefore = Array.isArray(aiData.blocks) ? aiData.blocks.length : 0;
        enrichShoppingAiData(aiData, titleBase, productData.commerceData, productData.reviewData);
        const blockCountAfter = Array.isArray(aiData.blocks) ? aiData.blocks.length : 0;
        const seoPlan = deriveSeoKeywordPlan(titleBase);
        const seoMentionsBefore = countSeoMentionsInAiData(aiData, seoPlan);
        reinforceSeoKeywordUsage(aiData, seoPlan);
        const seoMentionsAfter = countSeoMentionsInAiData(aiData, seoPlan);

        const originalAiTitle = aiData.title;
        aiData.title = buildEngagingShoppingTitle(aiData.title, titleBase, productData.commerceData, platform);
        aiData.title = ensureTitleStartsWithKeyword(aiData.title, seoPlan.mainKeyword);
        if (aiData.title !== originalAiTitle) {
            Logger.info(`📝 [Shopping/${platform}] 제목 보정 적용: "${originalAiTitle}" -> "${aiData.title}"`);
        }
        if (blockCountAfter !== blockCountBefore) {
            Logger.info(`🧱 [Shopping] 본문 블록 보강 적용 (${blockCountBefore}→${blockCountAfter})`);
        }
        if (seoMentionsAfter !== seoMentionsBefore) {
            Logger.info(`🔎 [Shopping] SEO 키워드 보강 적용 (${seoMentionsBefore}→${seoMentionsAfter})`);
        }
        const enableRelatedPostsAutoLink = runtimeOptions.enableRelatedPostsAutoLink !== false;
        const shoppingPlatform = String(runtimeOptions.platform || 'naver').toLowerCase();
        let relatedPosts = [];
        let relatedHeading = Utils.pickRelatedPostsHeading();
        if (enableRelatedPostsAutoLink) {
            if (shoppingPlatform === 'wordpress') {
                Logger.info('🔎 [Shopping/WordPress] 하이브리드 관련 글 수집 중...');
                try {
                    const wpPosts = await Utils.fetchWordPressRandomPosts(CONFIG.WORDPRESS_URL, 2);
                    const naverPosts = await Utils.fetchOwnBlogRandomPosts(2);
                    relatedPosts = Utils._shuffleArray([...wpPosts, ...naverPosts]).slice(0, 3);
                    if (relatedPosts.length > 0) {
                        Logger.info(`🔗 [Shopping/WordPress] 관련 글 ${relatedPosts.length}개 수집 완료`);
                    } else {
                        Logger.info('ℹ️ [Shopping/WordPress] 관련 글 수집 결과 없음');
                    }
                } catch (e) {
                    Logger.warn(`⚠️ [Shopping/WordPress] 관련 글 수집 중 오류: ${e.message}`);
                }
            } else {
                Logger.info('🔎 [Shopping] 네이버 관련 글 자동 수집 중...');
                relatedPosts = await Utils.fetchOwnBlogRandomPosts(3);
                if (relatedPosts.length > 0) {
                    Logger.info(`🔗 [Shopping] 관련 글 자동 수집 완료 (${relatedPosts.length}건)`);
                } else {
                    Logger.info('ℹ️ [Shopping] 관련 글 자동 수집 실패/없음: placeholder 유지');
                }
            }
        } else {
            Logger.info('ℹ️ [Shopping] 관련 글 자동 링크 기능 비활성화 (플랜 정책)');
        }

        const markdown = composeMarkdown({
            aiData,
            shortUrl,
            ftcImage,
            productImages,
            ctaImages,
            linkInsertCount,
            relatedPosts,
            relatedHeading,
            enableRelatedPostsAutoLink,
            platform: runtimeOptions.platform
        });

        fs.writeFileSync(path.join(targetDir, 'contents.md'), markdown, 'utf-8');
        fs.writeFileSync(path.join(targetDir, 'scrape_debug.json'), JSON.stringify({
            shortUrl,
            finalUrl,
            resolvedSource,
            channelProductNo,
            extractedTitle: productData.title,
            descriptionLength: (productData.description || '').length,
            bodyLength: (productData.body || '').length,
            imageCount: productData.imageUrls.length,
            sampleImages: productData.imageUrls.slice(0, 5),
            sampleImageMeta: (productData.imageMeta || []).slice(0, 10),
            structuredProductFound: !!productData.structuredProduct,
            commerceData: productData.commerceData,
            reviewData: productData.reviewData,
            reviewEnrichedWithBrowser,
            ctaImageConfigured: ctaImageUrls.length > 0,
            ctaImageConfiguredCount: ctaImageUrls.length,
            ctaImageInsertedCount: ctaImages.length,
            relatedPosts
        }, null, 2), 'utf-8');
        Logger.info(`✅ [Shopping] 콘텐츠 준비 완료: ${targetDir}`);

        return { targetDir, title: aiData.title, finalUrl };
    }
};

module.exports = ShoppingManager;
