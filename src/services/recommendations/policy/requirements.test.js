const test = require('node:test');
const assert = require('node:assert/strict');
const { createRequirementRegistry } = require('./requirements');

test('default registry requires shopping entitlement only for commerce opportunities', () => {
    const registry = createRequirementRegistry();
    assert.deepEqual(registry.resolve({ kind: 'commerce_opportunity', producer_id: 'commerce-opportunity-v1' }), {
        license_features: ['cmd_shopping'], capability_ids: [], setting_keys: [], quota_classes: [],
        presentation_surfaces: []
    });
    assert.deepEqual(registry.resolve({ kind: 'content_opportunity', producer_id: 'content-opportunity-v1' }).license_features, []);
});

test('handoff readiness is intrinsic while client-like metadata cannot declare policy requirements', () => {
    const registry = createRequirementRegistry();
    const presentation = registry.resolve({
        kind: 'setup_guidance', producer_id: 'setup-guidance-v1',
        handoff: { type: 'presentation', target: { surface: 'settings.general' } },
        metadata: { license_features: [], quota_class: '' }
    });
    const capability = registry.resolve({
        kind: 'workflow_hint', producer_id: 'workflow-v1',
        handoff: { type: 'capability', capability_id: 'content.topic.register' },
        metadata: { capability_ids: [] }
    });
    assert.deepEqual(presentation.presentation_surfaces, ['settings.general']);
    assert.deepEqual(capability.capability_ids, ['content.topic.register']);
});

test('producer rule adds to its broader kind rule without weakening it', () => {
    const registry = createRequirementRegistry({ rules: [
        { kind: 'content_opportunity', setting_keys: ['google_sheets_configured'] },
        { producer_id: 'special-content-v1', capability_ids: ['content.topic.register'], quota_class: 'publishing' }
    ] });
    const result = registry.resolve({ kind: 'content_opportunity', producer_id: 'special-content-v1' });
    assert.deepEqual(result.setting_keys, ['google_sheets_configured']);
    assert.deepEqual(result.capability_ids, ['content.topic.register']);
    assert.deepEqual(result.quota_classes, ['publishing']);
});

test('invalid requirement rules fail during registry construction', () => {
    assert.throws(() => createRequirementRegistry({ rules: [{}] }), /kind 또는 producer_id/);
    assert.throws(() => createRequirementRegistry({ rules: [{ kind: 'content_opportunity', quota_class: 'credits' }] }), /quota class/);
});
