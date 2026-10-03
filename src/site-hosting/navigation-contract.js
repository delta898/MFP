'use strict';

const BASE_URL = 'https://bloggenius.invalid/';
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

function normalizeMenuDestination(value) {
    if (typeof value !== 'string') throw invalidPath();
    const destination = value.trim();
    if (!destination || /[\s\u0000-\u001f\u007f\p{Zl}\p{Zp}]/u.test(destination)
        || /%(?![\da-f]{2})/iu.test(destination)) throw invalidPath();
    let parsed;
    try { parsed = new URL(destination, BASE_URL); }
    catch (_error) { throw invalidPath(); }
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) throw invalidPath();
    return destination;
}

function normalizeMenuLabel(value) {
    if (typeof value !== 'string') throw invalidNavigation();
    const label = value.trim();
    if (!label || label.length > 30 || /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(label)) throw invalidNavigation();
    return label;
}

function normalizeNavigationItems(value, options = {}) {
    if (!Array.isArray(value) || value.length < (options.minItems ?? 1)
        || value.length > (options.maxItems ?? 32)) throw invalidNavigation();
    return value.map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)
            || Object.keys(item).some((key) => key !== 'label' && key !== 'href')) throw invalidNavigation();
        return { label: normalizeMenuLabel(item.label), href: normalizeMenuDestination(item.href) };
    });
}

// Placeholder pages are a convenience for simple internal routes. Other valid
// destinations remain user-owned and are left for the chosen site builder.
function internalPathSegment(value) {
    if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[?#]/u.test(value)) return null;
    const match = value.match(/^\/([^/]+)\/$/u);
    if (!match) return null;
    let segment;
    try { segment = decodeURIComponent(match[1]); }
    catch (_error) { return null; }
    if (!segment || segment === '.' || segment === '..' || segment.normalize('NFKC') !== segment
        || !/^[\p{L}\p{N}_-]{1,48}$/u.test(segment)) return null;
    return segment;
}

function invalidPath() {
    const error = new Error('메뉴 주소 형식을 확인해 주세요. http(s) URL 또는 올바른 상대 경로를 입력할 수 있습니다.');
    error.code = 'SITE_HOSTING_MENU_PATH_INVALID';
    return error;
}

function invalidNavigation() {
    const error = new Error('메뉴는 이름과 주소만 포함해야 합니다.');
    error.code = 'SITE_HOSTING_NAVIGATION_INVALID';
    return error;
}

module.exports = { normalizeMenuDestination, normalizeMenuLabel, normalizeNavigationItems, internalPathSegment };
