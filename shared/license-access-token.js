const crypto = require('crypto');

function fromBase64Url(value) {
    const normalized = String(value || '').trim();
    if (!/^[A-Za-z0-9_-]+$/.test(normalized)) return null;
    try {
        return Buffer.from(normalized.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    } catch (_error) {
        return null;
    }
}

function safeEquals(actual, expected) {
    return Buffer.isBuffer(actual)
        && Buffer.isBuffer(expected)
        && actual.length === expected.length
        && crypto.timingSafeEqual(actual, expected);
}

function verifyLicenseAccessToken(token, options = {}, nowSeconds = Math.floor(Date.now() / 1000)) {
    const secret = String(options.secret || '').trim();
    if (!secret) return null;
    const parts = String(token || '').split('.');
    if (parts.length !== 3 || parts.some((part) => !part)) return null;

    const [headerPart, payloadPart, signaturePart] = parts;
    const headerBuffer = fromBase64Url(headerPart);
    const payloadBuffer = fromBase64Url(payloadPart);
    const providedSignature = fromBase64Url(signaturePart);
    if (!headerBuffer || !payloadBuffer || !providedSignature) return null;

    let header;
    let claims;
    try {
        header = JSON.parse(headerBuffer.toString('utf8'));
        claims = JSON.parse(payloadBuffer.toString('utf8'));
    } catch (_error) {
        return null;
    }
    if (header?.alg !== 'HS256' || !claims || typeof claims !== 'object' || Array.isArray(claims)) return null;

    const expectedSignature = crypto.createHmac('sha256', secret)
        .update(`${headerPart}.${payloadPart}`)
        .digest();
    if (!safeEquals(providedSignature, expectedSignature)) return null;

    const expiresAt = Number(claims.exp);
    if (!Number.isFinite(expiresAt) || expiresAt <= nowSeconds) return null;
    if (Number.isFinite(Number(claims.nbf)) && Number(claims.nbf) > nowSeconds) return null;
    if (String(claims.iss || '') !== String(options.issuer || 'bloggenius-license')) return null;

    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.some((value) => String(value || '') === String(options.audience || ''))) return null;
    const scopes = Array.isArray(claims.scope) ? claims.scope : String(claims.scope || '').split(/\s+/);
    if (!scopes.some((value) => String(value || '') === String(options.scope || ''))) return null;
    if (!String(claims.sub || '').trim()) return null;
    return claims;
}

module.exports = { verifyLicenseAccessToken };
