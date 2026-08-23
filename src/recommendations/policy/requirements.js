const { IDENTIFIER_PATTERN } = require('../core/validators');

const DEFAULT_REQUIREMENT_RULES = Object.freeze([
    Object.freeze({ kind: 'commerce_opportunity', license_features: Object.freeze(['cmd_shopping']) })
]);

const ALLOWED_QUOTA_CLASSES = new Set(['publishing']);

function compact(value, maxLength = 160) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeList(value, maxLength = 160) {
    return [...new Set((Array.isArray(value) ? value : [])
        .map((item) => compact(item, maxLength).toLowerCase())
        .filter((item) => IDENTIFIER_PATTERN.test(item)))].sort();
}

function normalizeRule(rule = {}) {
    const kind = compact(rule.kind, 60).toLowerCase();
    const producerId = compact(rule.producer_id || rule.producerId, 160);
    if (!kind && !producerId) throw new Error('requirement rule에는 kind 또는 producer_id가 필요합니다.');
    const quotaClass = compact(rule.quota_class || rule.quotaClass, 60).toLowerCase();
    if (quotaClass && !ALLOWED_QUOTA_CLASSES.has(quotaClass)) throw new Error('quota class가 지원되지 않습니다.');
    return {
        kind,
        producer_id: producerId,
        license_features: normalizeList(rule.license_features || rule.licenseFeatures, 80),
        capability_ids: normalizeList(rule.capability_ids || rule.capabilityIds, 160),
        setting_keys: normalizeList(rule.setting_keys || rule.settingKeys, 80),
        quota_class: quotaClass
    };
}

function createRequirementRegistry(options = {}) {
    const configured = Array.isArray(options.rules) ? options.rules : DEFAULT_REQUIREMENT_RULES;
    const rules = configured.map(normalizeRule);
    return {
        list() {
            return rules.map((rule) => ({ ...rule,
                license_features: [...rule.license_features],
                capability_ids: [...rule.capability_ids],
                setting_keys: [...rule.setting_keys]
            }));
        },
        resolve(candidate = {}) {
            const kind = compact(candidate.kind, 60).toLowerCase();
            const producerId = compact(candidate.producer_id, 160);
            const matched = rules.filter((rule) =>
                (rule.producer_id && rule.producer_id === producerId)
                || (!rule.producer_id && rule.kind === kind)
            );
            const handoff = candidate?.handoff && typeof candidate.handoff === 'object' ? candidate.handoff : null;
            return {
                license_features: [...new Set(matched.flatMap((rule) => rule.license_features))].sort(),
                capability_ids: [...new Set([
                    ...matched.flatMap((rule) => rule.capability_ids),
                    ...(handoff?.type === 'capability' && handoff.capability_id ? [compact(handoff.capability_id, 160)] : [])
                ])].sort(),
                setting_keys: [...new Set(matched.flatMap((rule) => rule.setting_keys))].sort(),
                quota_classes: [...new Set(matched.map((rule) => rule.quota_class).filter(Boolean))].sort(),
                presentation_surfaces: handoff?.type === 'presentation' && handoff?.target?.surface
                    ? [compact(handoff.target.surface, 80).toLowerCase()]
                    : []
            };
        }
    };
}

module.exports = {
    ALLOWED_QUOTA_CLASSES,
    DEFAULT_REQUIREMENT_RULES,
    createRequirementRegistry,
    normalizeRule
};
