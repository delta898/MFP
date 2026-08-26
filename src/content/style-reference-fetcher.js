const dns = require('node:dns');
const net = require('node:net');

const MAX_STYLE_REFERENCE_BYTES = 1024 * 1024;
const MAX_STYLE_REFERENCE_TEXT = 20000;
const MAX_STYLE_REFERENCE_REDIRECTS = 3;

function createReferenceError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}

function isPrivateIpv4(address) {
    const parts = address.split('.').map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
    return parts[0] === 0 || parts[0] === 10 || parts[0] === 127
        || (parts[0] === 169 && parts[1] === 254)
        || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
        || (parts[0] === 192 && parts[1] === 0 && (parts[2] === 0 || parts[2] === 2))
        || (parts[0] === 192 && parts[1] === 168)
        || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
        || (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19 || (parts[1] === 51 && parts[2] === 100)))
        || (parts[0] === 203 && parts[1] === 0 && parts[2] === 113)
        || parts[0] >= 224;
}

function isPrivateIp(address) {
    const normalized = String(address || '').trim().toLowerCase().split('%')[0];
    const version = net.isIP(normalized);
    if (version === 4) return isPrivateIpv4(normalized);
    if (version !== 6) return true;
    if (normalized === '::' || normalized === '::1') return true;
    if (normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('ff') || /^fe[89ab]/.test(normalized)) return true;
    if (normalized.startsWith('2001:db8:') || normalized.startsWith('::ffff:')) return true;
    const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? isPrivateIpv4(mapped[1]) : false;
}

function parsePublicHttpsUrl(rawUrl) {
    let parsed;
    try {
        parsed = new URL(String(rawUrl || '').trim());
    } catch (_error) {
        throw createReferenceError('STYLE_REFERENCE_URL_INVALID', '올바른 HTTPS 블로그 URL을 입력해 주세요.');
    }
    if (parsed.protocol !== 'https:') {
        throw createReferenceError('STYLE_REFERENCE_URL_HTTPS_REQUIRED', '문체 참고 URL은 공개 HTTPS 주소만 사용할 수 있습니다.');
    }
    if (parsed.username || parsed.password) {
        throw createReferenceError('STYLE_REFERENCE_URL_CREDENTIALS_FORBIDDEN', '사용자 정보가 포함된 URL은 사용할 수 없습니다.');
    }
    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
    if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
        throw createReferenceError('STYLE_REFERENCE_URL_PRIVATE', '로컬 또는 비공개 주소는 사용할 수 없습니다.');
    }
    if (net.isIP(hostname) && isPrivateIp(hostname)) {
        throw createReferenceError('STYLE_REFERENCE_URL_PRIVATE', '로컬 또는 비공개 주소는 사용할 수 없습니다.');
    }
    parsed.hash = '';
    return parsed;
}

async function resolvePublicAddresses(hostname, lookup = dns.promises.lookup) {
    const results = await lookup(hostname, { all: true, verbatim: true });
    const entries = Array.isArray(results) ? results : [results];
    if (!entries.length || entries.some((entry) => isPrivateIp(entry?.address))) {
        throw createReferenceError('STYLE_REFERENCE_URL_PRIVATE', '공개 인터넷 주소로 확인되지 않아 사용할 수 없습니다.');
    }
    return entries.map((entry) => ({ address: entry.address, family: entry.family || net.isIP(entry.address) }));
}

function extractReadableHtml(html, cheerio) {
    const $ = cheerio.load(String(html || ''));
    $('script,style,noscript,template,form,iframe,svg,canvas,nav,footer,header,aside').remove();
    const title = $('title').first().text().replace(/\s+/g, ' ').trim().slice(0, 200);
    const root = $('article').first().length ? $('article').first() : ($('main').first().length ? $('main').first() : $('body'));
    const text = root.text().replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    return { title, text: text.slice(0, MAX_STYLE_REFERENCE_TEXT) };
}

function createStyleReferenceFetcher(options = {}) {
    const { axios, cheerio, lookup = dns.promises.lookup } = options;
    if (!axios || !cheerio) throw new Error('style reference fetcher dependencies are required.');

    return async function fetchStyleReference(rawUrl) {
        let current = parsePublicHttpsUrl(rawUrl);
        for (let redirectCount = 0; redirectCount <= MAX_STYLE_REFERENCE_REDIRECTS; redirectCount += 1) {
            const hostname = current.hostname.replace(/^\[|\]$/g, '');
            const approvedAddresses = await resolvePublicAddresses(hostname, lookup);
            let lookupIndex = 0;
            let response;
            try {
                response = await axios.get(current.toString(), {
                    responseType: 'arraybuffer',
                    timeout: 10000,
                    maxRedirects: 0,
                    maxContentLength: MAX_STYLE_REFERENCE_BYTES,
                    maxBodyLength: MAX_STYLE_REFERENCE_BYTES,
                    lookup: (_hostname, lookupOptions, callback) => {
                        if (lookupOptions?.all) {
                            callback(null, approvedAddresses.map((entry) => ({ ...entry })));
                            return;
                        }
                        const entry = approvedAddresses[lookupIndex % approvedAddresses.length];
                        lookupIndex += 1;
                        callback(null, entry.address, entry.family);
                    },
                    validateStatus: (status) => (status >= 200 && status < 300) || (status >= 300 && status < 400),
                    headers: { 'User-Agent': 'BlogGenius Style Reference Analyzer/1.0', Accept: 'text/html,application/xhtml+xml' }
                });
            } catch (error) {
                if (error?.code === 'ERR_FR_MAX_BODY_LENGTH_EXCEEDED' || error?.code === 'ERR_BAD_RESPONSE') {
                    throw createReferenceError('STYLE_REFERENCE_TOO_LARGE', '참고 페이지가 허용 크기를 초과했습니다.');
                }
                throw createReferenceError('STYLE_REFERENCE_FETCH_FAILED', '참고 페이지를 불러오지 못했습니다.');
            }
            if (response.status >= 300 && response.status < 400) {
                if (redirectCount >= MAX_STYLE_REFERENCE_REDIRECTS) {
                    throw createReferenceError('STYLE_REFERENCE_TOO_MANY_REDIRECTS', '참고 URL의 이동 횟수가 너무 많습니다.');
                }
                const location = response.headers?.location;
                if (!location) throw createReferenceError('STYLE_REFERENCE_FETCH_FAILED', '참고 URL의 이동 주소가 올바르지 않습니다.');
                current = parsePublicHttpsUrl(new URL(location, current).toString());
                continue;
            }
            const contentType = String(response.headers?.['content-type'] || '').toLowerCase();
            if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
                throw createReferenceError('STYLE_REFERENCE_HTML_REQUIRED', 'HTML 형식의 공개 블로그 페이지만 사용할 수 있습니다.');
            }
            const declaredLength = Number(response.headers?.['content-length']);
            if (Number.isFinite(declaredLength) && declaredLength > MAX_STYLE_REFERENCE_BYTES) {
                throw createReferenceError('STYLE_REFERENCE_TOO_LARGE', '참고 페이지가 허용 크기를 초과했습니다.');
            }
            const bytes = Buffer.isBuffer(response.data) ? response.data : Buffer.from(response.data || '');
            if (bytes.length > MAX_STYLE_REFERENCE_BYTES) throw createReferenceError('STYLE_REFERENCE_TOO_LARGE', '참고 페이지가 허용 크기를 초과했습니다.');
            const extracted = extractReadableHtml(bytes.toString('utf8'), cheerio);
            if (!extracted.text) throw createReferenceError('STYLE_REFERENCE_EMPTY', '참고 페이지에서 분석할 본문을 찾지 못했습니다.');
            return { url: current.toString(), ...extracted };
        }
        throw createReferenceError('STYLE_REFERENCE_FETCH_FAILED', '참고 페이지를 불러오지 못했습니다.');
    };
}

module.exports = {
    MAX_STYLE_REFERENCE_BYTES,
    MAX_STYLE_REFERENCE_TEXT,
    parsePublicHttpsUrl,
    isPrivateIp,
    resolvePublicAddresses,
    extractReadableHtml,
    createStyleReferenceFetcher
};
