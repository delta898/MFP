const { buildCapabilityId } = require('../../agent/action-schema');
const { RECOMMENDATION_PRESENTATION_SURFACES, RECOMMENDATION_STATES } = require('../core/contract');
const { IDENTIFIER_PATTERN } = require('../core/validators');
const { validateLicenseFeaturePolicy } = require('../../license-feature-policy');

const POLICY_CONTEXT_SCHEMA_VERSION = 1;
const MAX_HISTORY = 200;
const MAX_DIAGNOSTICS = 20;
const SETTING_READINESS_KEYS = Object.freeze([
    'config_ready',
    'essential_configured',
    'google_sheets_configured',
    'naver_blog_configured',
    'wordpress_configured',
    'shopping_configured'
]);

function compact(value, maxLength = 240) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function validTimestamp(value) {
    return Number.isFinite(Date.parse(String(value || '')));
}

function resolveOwner(input = {}, context = {}, recommendationStore = null) {
    const localOwner = typeof recommendationStore?.getLocalOwnerIdentity === 'function'
        ? recommendationStore.getLocalOwnerIdentity()
        : null;
    const values = [
        input.owner_user_id,
        context.owner_user_id,
        context?.memory?.owner_memory?.owner_user_id,
        localOwner?.owner_user_id
    ].map((value) => compact(value, 240)).filter(Boolean);
    const distinct = [...new Set(values)];
    if (distinct.length !== 1 || !IDENTIFIER_PATTERN.test(distinct[0])) return '';
    return distinct[0];
}

function sanitizeCapabilityIds(capabilityRegistry) {
    if (!capabilityRegistry || typeof capabilityRegistry.list !== 'function') {
        return { known: false, ids: [] };
    }
    const ids = capabilityRegistry.list().map((capability) => compact(
        capability?.id || buildCapabilityId(capability?.domain, capability?.name),
        160
    )).filter((id) => IDENTIFIER_PATTERN.test(id));
    return { known: true, ids: [...new Set(ids)].sort() };
}

function sanitizeLicenseFeatures(raw) {
    const validation = validateLicenseFeaturePolicy(raw);
    return validation.success
        ? { known: true, features: validation.features }
        : { known: false, features: {} };
}

function sanitizeSettingReadiness(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { known: false, values: {} };
    return {
        known: true,
        values: Object.fromEntries(SETTING_READINESS_KEYS.map((key) => [key, raw[key] === true]))
    };
}

function sanitizeQuotaState(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return { publishing: { known: false, unlimited: false, remaining: 0 } };
    }
    const source = raw.publishing && typeof raw.publishing === 'object' ? raw.publishing : raw;
    const unlimited = source.unlimited === true;
    const remaining = Number(source.remaining);
    const known = source.known !== false && (unlimited || Number.isFinite(remaining));
    return {
        publishing: {
            known,
            unlimited: known && unlimited,
            remaining: known && !unlimited ? Math.max(0, Math.floor(remaining)) : 0
        }
    };
}

function sanitizeRecommendationHistory(items, ownerUserId) {
    return (Array.isArray(items) ? items : []).map((item) => {
        const candidate = item?.candidate && typeof item.candidate === 'object' ? item.candidate : {};
        const recommendationId = compact(item?.recommendation_id, 240);
        const itemOwnerId = compact(item?.owner_user_id, 240);
        const kind = compact(candidate.kind, 60).toLowerCase();
        const dedupeKey = compact(candidate.dedupe_key, 300);
        const status = compact(item?.status, 60).toLowerCase();
        const availableAt = compact(item?.available_at, 80);
        const expiresAt = compact(item?.expires_at, 80);
        const lastEventAt = compact(item?.last_event_at, 80);
        if (itemOwnerId !== ownerUserId
            || !IDENTIFIER_PATTERN.test(recommendationId)
            || !dedupeKey
            || !RECOMMENDATION_STATES.includes(status)
            || !validTimestamp(availableAt)
            || !validTimestamp(expiresAt)
            || !validTimestamp(lastEventAt)) return null;
        return {
            recommendation_id: recommendationId,
            kind,
            dedupe_key: dedupeKey,
            status,
            available_at: new Date(availableAt).toISOString(),
            expires_at: new Date(expiresAt).toISOString(),
            last_event_at: new Date(lastEventAt).toISOString()
        };
    }).filter(Boolean).sort((left, right) =>
        right.last_event_at.localeCompare(left.last_event_at)
        || left.recommendation_id.localeCompare(right.recommendation_id)
    ).slice(0, MAX_HISTORY);
}

function createPolicyContextCollector(options = {}) {
    const capabilityRegistry = options.capabilityRegistry || null;
    const recommendationStore = options.recommendationStore || options.eventStore || null;
    const licenseFeatureReader = options.licenseFeatureReader;
    const settingReadinessReader = options.settingReadinessReader;
    const quotaReader = options.quotaReader;
    const now = typeof options.now === 'function' ? options.now : () => new Date();
    const presentationSurfaces = [...new Set(
        (Array.isArray(options.presentationSurfaces)
            ? options.presentationSurfaces
            : RECOMMENDATION_PRESENTATION_SURFACES)
            .map((value) => compact(value, 80).toLowerCase())
            .filter(Boolean)
    )].sort();

    return {
        async collect(input = {}, context = {}) {
            const ownerUserId = resolveOwner(input, context, recommendationStore);
            const diagnostics = [];
            const appendDiagnostic = (source, code) => {
                if (diagnostics.length < MAX_DIAGNOSTICS) diagnostics.push({ source, code });
            };
            let capabilities;
            try {
                capabilities = sanitizeCapabilityIds(capabilityRegistry);
            } catch (_error) {
                capabilities = { known: false, ids: [] };
                appendDiagnostic('capabilities', 'CAPABILITY_READ_FAILED');
            }

            async function read(reader, source) {
                if (typeof reader !== 'function') {
                    appendDiagnostic(source, 'SOURCE_UNAVAILABLE');
                    return undefined;
                }
                try {
                    return await reader({ owner_user_id: ownerUserId }, context);
                } catch (_error) {
                    appendDiagnostic(source, 'SOURCE_READ_FAILED');
                    return undefined;
                }
            }

            const [rawFeatures, rawSettings, rawQuota] = await Promise.all([
                read(licenseFeatureReader, 'license'),
                read(settingReadinessReader, 'settings'),
                read(quotaReader, 'quota')
            ]);
            const license = sanitizeLicenseFeatures(rawFeatures);
            const settings = sanitizeSettingReadiness(rawSettings);
            const quota = sanitizeQuotaState(rawQuota);
            let history = { known: false, items: [] };
            if (ownerUserId && typeof recommendationStore?.listRecommendations === 'function') {
                try {
                    history = {
                        known: true,
                        items: sanitizeRecommendationHistory(
                            await recommendationStore.listRecommendations(ownerUserId, { limit: MAX_HISTORY }),
                            ownerUserId
                        )
                    };
                } catch (_error) {
                    appendDiagnostic('recommendation_history', 'HISTORY_READ_FAILED');
                }
            } else {
                appendDiagnostic('recommendation_history', 'SOURCE_UNAVAILABLE');
            }

            return {
                schema_version: POLICY_CONTEXT_SCHEMA_VERSION,
                owner_user_id: ownerUserId,
                observed_at: new Date(now()).toISOString(),
                capabilities,
                presentation: { known: true, surfaces: presentationSurfaces },
                license,
                settings,
                quota,
                history,
                diagnostics
            };
        }
    };
}

module.exports = {
    MAX_DIAGNOSTICS,
    MAX_HISTORY,
    POLICY_CONTEXT_SCHEMA_VERSION,
    SETTING_READINESS_KEYS,
    createPolicyContextCollector,
    resolveOwner,
    sanitizeCapabilityIds,
    sanitizeLicenseFeatures,
    sanitizeQuotaState,
    sanitizeRecommendationHistory,
    sanitizeSettingReadiness
};
