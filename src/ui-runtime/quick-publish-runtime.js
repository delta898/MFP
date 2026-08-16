const crypto = require('crypto');

function createQuickPublishRuntime(options = {}) {
    const dedupeTtlMs = Number.isFinite(Number(options.dedupeTtlMs))
        ? Math.max(1000, parseInt(options.dedupeTtlMs, 10))
        : 90 * 1000;
    const previewTtlMs = Number.isFinite(Number(options.previewTtlMs))
        ? Math.max(1000, parseInt(options.previewTtlMs, 10))
        : 6 * 60 * 60 * 1000;

    const recentMap = new Map();
    const previewMap = new Map();

    function buildPreviewImageUrl(previewId, target, index) {
        return `/api/v1/blog/quick-preview/image?previewId=${encodeURIComponent(String(previewId || ''))}&target=${encodeURIComponent(String(target || ''))}&index=${encodeURIComponent(String(index))}`;
    }

    function buildQuickPublishDedupeKey({ subject, title, keywords, instruction, referenceUrl, imageGeneration, externalReference, writingStrategy, source, trendDate }) {
        const normalizedSubject = String(subject || '').trim().toLowerCase();
        const normalizedTitle = String(title || '').trim().toLowerCase();
        const normalizedKeywords = Array.isArray(keywords)
            ? keywords.map(v => String(v || '').trim().toLowerCase()).filter(Boolean).join(',')
            : '';
        const normalizedInstruction = String(instruction || '').trim().toLowerCase();
        const normalizedReferenceUrl = String(referenceUrl || '').trim().toLowerCase();
        const normalizedImageGeneration = imageGeneration ? '1' : '0';
        const normalizedExternalReference = externalReference ? '1' : '0';
        const normalizedWritingStrategy = String(writingStrategy || '').trim().toLowerCase();
        const normalizedSource = String(source || 'manual').trim().toLowerCase();
        const normalizedTrendDate = String(trendDate || '').trim();
        return [
            normalizedSubject,
            normalizedTitle,
            normalizedKeywords,
            normalizedInstruction,
            normalizedReferenceUrl,
            normalizedImageGeneration,
            normalizedExternalReference,
            normalizedWritingStrategy,
            normalizedSource,
            normalizedTrendDate
        ].join('|');
    }

    function cleanupRecentEntries(nowMs = Date.now()) {
        for (const [key, entry] of recentMap.entries()) {
            if (!entry || !Number.isFinite(entry.updatedAtMs) || (nowMs - entry.updatedAtMs) > dedupeTtlMs) {
                recentMap.delete(key);
            }
        }
    }

    function cleanupPreviewSessions(nowMs = Date.now()) {
        for (const [previewId, entry] of previewMap.entries()) {
            if (!entry || !Number.isFinite(entry.expiresAtMs) || entry.expiresAtMs <= nowMs) {
                previewMap.delete(previewId);
            }
        }
    }

    function getRecentEntry(key) {
        return recentMap.get(String(key || '').trim()) || null;
    }

    function hasRecentEntry(key) {
        return recentMap.has(String(key || '').trim());
    }

    function setRecentEntry(key, entry = {}) {
        const normalizedKey = String(key || '').trim();
        if (!normalizedKey) return null;
        recentMap.set(normalizedKey, entry);
        return entry;
    }

    function getPreviewSession(previewId) {
        cleanupPreviewSessions();
        const normalizedId = String(previewId || '').trim();
        if (!normalizedId) return null;
        return previewMap.get(normalizedId) || null;
    }

    function deletePreviewSession(previewId) {
        return previewMap.delete(String(previewId || '').trim());
    }

    function buildPreviewResponse(session = {}) {
        const previewsByTarget = session.previewsByTarget || {};
        return {
            previewId: session.previewId,
            rowIndex: session.rowIndex,
            rowNumber: session.rowNumber,
            primaryTarget: session.primaryTarget,
            targets: Array.isArray(session.targets) ? session.targets.slice() : [],
            expiresAt: session.expiresAtMs ? new Date(session.expiresAtMs).toISOString() : '',
            previews: Object.fromEntries(
                Object.entries(previewsByTarget).map(([target, previewData]) => [
                    target,
                    {
                        ...previewData,
                        source: {
                            ...(previewData?.source || {}),
                            type: 'generated_quick_post'
                        },
                        images: Array.isArray(previewData?.images)
                            ? previewData.images.map((image) => ({
                                ...image,
                                imagePath: '',
                                previewUrl: image.exists
                                    ? buildPreviewImageUrl(session.previewId, String(target || ''), image.index)
                                    : ''
                            }))
                            : []
                    }
                ])
            )
        };
    }

    function registerPreviewSession({
        previewId,
        rowIndex,
        rowNumber,
        dedupeKey,
        imageGenerationRequested,
        targets,
        primaryTarget,
        targetDirs,
        previewsByTarget,
        subject,
        recommendation
    } = {}) {
        cleanupPreviewSessions();
        const normalizedPreviewId = String(previewId || '').trim() || crypto.randomUUID();
        const expiresAtMs = Date.now() + previewTtlMs;
        const session = {
            previewId: normalizedPreviewId,
            rowIndex,
            rowNumber,
            dedupeKey: String(dedupeKey || '').trim(),
            imageGenerationRequested: imageGenerationRequested === true,
            targets: Array.isArray(targets) ? targets.slice() : [],
            primaryTarget: String(primaryTarget || '').trim(),
            targetDirs: targetDirs || {},
            previewsByTarget: previewsByTarget || {},
            subject: String(subject || '').trim(),
            recommendation: recommendation && typeof recommendation === 'object' ? recommendation : null,
            expiresAtMs
        };
        previewMap.set(normalizedPreviewId, session);
        return buildPreviewResponse(session);
    }

    function selectPreviewTarget(targets = [], targetDirs = {}) {
        const normalizedTargets = Array.isArray(targets) ? targets : [];
        if (normalizedTargets.includes('naver') && targetDirs?.naver) return 'naver';
        if (normalizedTargets.includes('wordpress') && targetDirs?.wordpress) return 'wordpress';
        if (targetDirs?.naver) return 'naver';
        if (targetDirs?.wordpress) return 'wordpress';
        return '';
    }

    return {
        buildQuickPublishDedupeKey,
        cleanupRecentEntries,
        getRecentEntry,
        hasRecentEntry,
        setRecentEntry,
        getPreviewSession,
        deletePreviewSession,
        registerPreviewSession,
        selectPreviewTarget
    };
}

module.exports = {
    createQuickPublishRuntime
};
