const { loadSharp } = require('../../../sharp-loader');
const crypto = require('node:crypto');

const DEFAULT_SIGNATURE = 'BlogGenius.kr';
const MAX_SIGNATURE_LENGTH = 48;
const PREVIEW_POLICY_TTL_MS = 10 * 60 * 1000;
const MAX_PREVIEW_POLICIES = 128;

function normalizeSignature(value = '') {
    return String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, MAX_SIGNATURE_LENGTH);
}

function getImageMimeType(format = '') {
    const normalized = String(format || '').toLowerCase();
    if (normalized === 'jpeg' || normalized === 'jpg') return 'image/jpeg';
    if (normalized === 'png') return 'image/png';
    if (normalized === 'webp') return 'image/webp';
    if (normalized === 'avif') return 'image/avif';
    return '';
}

function escapeXml(value = '') {
    return String(value).replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&apos;'
    })[character]);
}

function estimateSignatureTextWidthEm(value = '') {
    return Array.from(String(value)).reduce((width, character) => {
        if (/^[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af\u2e80-\u9fff\uf900-\ufaff]$/u.test(character)) return width + 1.08;
        if (/^\s$/u.test(character)) return width + 0.34;
        if (/^[ilI|.,'`:;!]$/u.test(character)) return width + 0.34;
        if (/^[mwMW@%&]$/u.test(character)) return width + 0.9;
        if (/^[A-Z]$/u.test(character)) return width + 0.68;
        if (/^[0-9]$/u.test(character)) return width + 0.59;
        if (/^[a-z]$/u.test(character)) return width + 0.56;
        return width + 0.72;
    }, 0);
}

function createWatermarkSvg(width, height, signature = DEFAULT_SIGNATURE) {
    const text = normalizeSignature(signature);
    const preferredFontSize = Math.max(15, Math.min(34, Math.round(width * 0.025)));
    const textWidthEm = Math.max(1, estimateSignatureTextWidthEm(text));
    const fitFontSize = Math.floor(width * 0.68 / (textWidthEm + 1.5));
    const fontSize = Math.max(9, Math.min(preferredFontSize, fitFontSize));
    const horizontalPadding = Math.round(fontSize * 0.65);
    const verticalPadding = Math.round(fontSize * 0.45);
    const pillWidth = Math.min(width, Math.ceil(textWidthEm * fontSize + horizontalPadding * 2));
    const pillHeight = fontSize + verticalPadding * 2;
    const radius = Math.round(pillHeight / 2);
    const textX = Math.round(pillWidth / 2);
    const textY = Math.round(pillHeight / 2);
    const svg = `<svg width="${pillWidth}" height="${pillHeight}" xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="${pillWidth}" height="${pillHeight}" rx="${radius}" fill="#101915" fill-opacity="0.58"/><text x="${textX}" y="${textY}" text-anchor="middle" dominant-baseline="central" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="600" letter-spacing="0.2" fill="#ffffff" fill-opacity="0.92">${escapeXml(text)}</text></svg>`;
    return { input: Buffer.from(svg), width: pillWidth, height: pillHeight };
}

function createCardNewsOutgoingImageService(options = {}) {
    const { License, fileSystem, logger } = options;
    const previewPolicies = new Map();

    async function resolvePlanStatus(force = false) {
        if (typeof License?.checkLicenseStatus !== 'function') return { verified: false, planCode: '' };
        try {
            const status = await License.checkLicenseStatus({ quiet: true, force });
            const planCode = String(status?.planCode || '').trim().toLowerCase();
            return { verified: status?.success === true && Boolean(planCode), planCode };
        } catch (error) {
            logger?.warn?.(`⚠️ [CardNews] 플랜 확인 실패, Free 서명을 사용합니다: ${error.message}`);
            return { verified: false, planCode: '' };
        }
    }

    async function resolveEffectivePolicy(signature = '', force = false) {
        const plan = await resolvePlanStatus(force);
        const editable = plan.verified && plan.planCode !== 'free';
        return {
            verified: plan.verified,
            editable,
            planCode: plan.verified ? plan.planCode : 'free',
            effectiveSignature: editable ? normalizeSignature(signature) : DEFAULT_SIGNATURE
        };
    }

    async function getSignaturePolicy(signature = '', options = {}) {
        const policy = await resolveEffectivePolicy(signature, options.force === true);
        const now = Date.now();
        for (const [token, snapshot] of previewPolicies) {
            if (snapshot.expiresAt <= now) previewPolicies.delete(token);
        }
        while (previewPolicies.size >= MAX_PREVIEW_POLICIES) {
            previewPolicies.delete(previewPolicies.keys().next().value);
        }
        const previewToken = crypto.randomBytes(32).toString('base64url');
        previewPolicies.set(previewToken, {
            policy,
            expiresAt: now + PREVIEW_POLICY_TTL_MS
        });
        return {
            editable: policy.editable,
            plan_verified: policy.verified,
            plan_code: policy.planCode,
            default_signature: policy.editable ? '' : DEFAULT_SIGNATURE,
            effective_signature: policy.effectiveSignature,
            preview_token: previewToken
        };
    }

    function resolvePreviewPolicy(previewToken, signature, expectedSignature) {
        const snapshot = previewPolicies.get(String(previewToken || ''));
        if (!snapshot || snapshot.expiresAt <= Date.now()) {
            previewPolicies.delete(String(previewToken || ''));
            logger?.warn?.(`[CardNews] signature preview rejected (snapshot=${snapshot ? 'expired' : 'missing'})`);
            const error = new Error('미리보기 확인 정보가 만료되었습니다. 미리보기를 새로고침한 뒤 다시 진행해 주세요.');
            error.status = 409;
            error.apiCode = 'CARD_NEWS_SIGNATURE_PREVIEW_STALE';
            throw error;
        }
        if (expectedSignature !== undefined && expectedSignature !== null
            && String(expectedSignature) !== snapshot.policy.effectiveSignature) {
            logger?.warn?.('[CardNews] signature preview rejected (expected signature does not match snapshot)');
            const error = new Error('미리보기와 발행 서명 기준이 다릅니다. 미리보기를 새로고침한 뒤 다시 진행해 주세요.');
            error.status = 409;
            error.apiCode = 'CARD_NEWS_SIGNATURE_PREVIEW_STALE';
            throw error;
        }
        const requestedSignature = snapshot.policy.editable ? normalizeSignature(signature) : DEFAULT_SIGNATURE;
        if (requestedSignature !== snapshot.policy.effectiveSignature) {
            logger?.warn?.('[CardNews] signature preview rejected (request signature does not match snapshot)');
            const error = new Error('미리보기와 발행 서명 기준이 다릅니다. 미리보기를 새로고침한 뒤 다시 진행해 주세요.');
            error.status = 409;
            error.apiCode = 'CARD_NEWS_SIGNATURE_PREVIEW_STALE';
            throw error;
        }
        return snapshot.policy;
    }

    function assertSignatureSnapshot(policy, expectedSignature) {
        if (expectedSignature === undefined || expectedSignature === null) return;
        if (String(expectedSignature) === policy.effectiveSignature) return;
        const error = new Error('플랜 또는 서명이 바뀌어 미리보기와 결과가 달라질 수 있습니다. 미리보기를 확인한 뒤 다시 진행해 주세요.');
        error.status = 409;
        error.apiCode = 'CARD_NEWS_SIGNATURE_PREVIEW_STALE';
        throw error;
    }

    async function watermarkBuffer(buffer, mimeType, signature = DEFAULT_SIGNATURE) {
        const sharp = loadSharp().sharp;
        const source = sharp(buffer, { failOn: 'none' });
        const metadata = await source.metadata();
        if (!metadata.width || !metadata.height) throw new Error('카드 이미지 크기를 확인하지 못했습니다.');
        const overlay = createWatermarkSvg(metadata.width, metadata.height, signature);
        let pipeline = sharp(buffer, { failOn: 'none' }).composite([{
            input: overlay.input,
            left: Math.max(0, metadata.width - overlay.width - Math.round(metadata.width * 0.025)),
            top: Math.max(0, metadata.height - overlay.height - Math.round(metadata.height * 0.025))
        }]);
        if (mimeType === 'image/jpeg') pipeline = pipeline.jpeg();
        else if (mimeType === 'image/webp') pipeline = pipeline.webp();
        else if (mimeType === 'image/avif') pipeline = pipeline.avif();
        else pipeline = pipeline.png();
        const result = await pipeline.toBuffer({ resolveWithObject: true });
        return {
            buffer: result.data,
            mime_type: getImageMimeType(result.info?.format) || mimeType
        };
    }

    async function prepareAsset(asset, signature = '', expectedSignature, options = {}) {
        if (!asset?.path || !fileSystem?.readFileSync) throw new Error('카드 이미지 파일을 읽지 못했습니다.');
        const buffer = fileSystem.readFileSync(asset.path);
        const policy = options.previewToken
            ? resolvePreviewPolicy(options.previewToken, signature, expectedSignature)
            : await resolveEffectivePolicy(signature, options.force === true);
        assertSignatureSnapshot(policy, expectedSignature);
        const effectiveSignature = policy.effectiveSignature;
        if (!effectiveSignature) return { ...asset, buffer };
        const rendered = await watermarkBuffer(buffer, asset.mime_type, effectiveSignature);
        return { ...asset, ...rendered };
    }

    async function prepareAssets(assets = [], signature = '', expectedSignature, options = {}) {
        const policy = options.previewToken
            ? resolvePreviewPolicy(options.previewToken, signature, expectedSignature)
            : await resolveEffectivePolicy(signature, options.force === true);
        assertSignatureSnapshot(policy, expectedSignature);
        const effectiveSignature = policy.effectiveSignature;
        if (!effectiveSignature) {
            return assets.map((asset) => ({ ...asset, buffer: fileSystem.readFileSync(asset.path) }));
        }
        return Promise.all(assets.map(async (asset) => ({
            ...asset,
            ...(await watermarkBuffer(fileSystem.readFileSync(asset.path), asset.mime_type, effectiveSignature))
        })));
    }

    return { getSignaturePolicy, prepareAsset, prepareAssets, watermarkBuffer };
}

module.exports = {
    DEFAULT_SIGNATURE,
    MAX_SIGNATURE_LENGTH,
    normalizeSignature,
    getImageMimeType,
    escapeXml,
    estimateSignatureTextWidthEm,
    createWatermarkSvg,
    createCardNewsOutgoingImageService
};
