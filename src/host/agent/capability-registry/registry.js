const { buildCapabilityId } = require('../../../services/agent-actions/capability-id');
const Ajv2020 = require('ajv/dist/2020');
const { createAgentPendingCapabilities } = require('./actions/pending');
const { createAgentMetaCapabilities } = require('./actions/meta');
const { createAgentPreferenceCapabilities } = require('./actions/preferences');
const { createAgentActionPreferenceCapabilities } = require('./actions/action-preferences');
const { createAgentUserRuleCapabilities } = require('./actions/user-rules');
const { createAgentRecommendationCapabilities } = require('./actions/recommendations');
const { getPersonalizableParameter } = require('../../../services/memory/user-action-preferences');

const agentActionAjv = new Ajv2020({
    allErrors: true,
    strict: true,
    strictRequired: false,
    allowUnionTypes: true,
    validateFormats: false
});

function resolveCapabilityId(capability) {
    const explicitId = String(capability?.id || '').trim();
    const domain = String(capability?.domain || '').trim();
    const explicitName = String(capability?.name || '').trim();
    const name = explicitName || (explicitId && domain && explicitId.startsWith(`${domain}.`)
        ? explicitId.slice(domain.length + 1)
        : '');
    const id = explicitId || (domain && name ? buildCapabilityId(domain, name) : '');
    if (!id) throw new Error('Capability must provide an id or domain/name.');
    if (!domain || !name || id !== buildCapabilityId(domain, name)) {
        throw new Error(`Capability ${id} must have one consistent canonical id, domain, and name.`);
    }
    return id;
}

function normalizeCapability(capability) {
    const id = resolveCapabilityId(capability);
    const domain = String(capability.domain).trim();
    return {
        ...capability,
        id,
        domain,
        name: String(capability.name || id.slice(domain.length + 1)).trim()
    };
}

function validateAgentActionDescriptor(capability) {
    const exposure = capability?.agentExposure;
    if (!exposure) return;
    if (!String(exposure.title || '').trim() || !String(exposure.description || '').trim()) {
        throw new TypeError(`Agent action ${capability.id} must provide a title and description.`);
    }
    if (!exposure.inputSchema || typeof exposure.inputSchema !== 'object' || Array.isArray(exposure.inputSchema)) {
        throw new TypeError(`Agent action ${capability.id} must provide an inputSchema object.`);
    }
    if (exposure.parameterSemantics !== undefined) {
        const properties = exposure.inputSchema.properties || {};
        const roles = new Set(['explicit_constraint', 'requested_option', 'personalization_context', 'quantity', 'selection']);
        if (!exposure.parameterSemantics || typeof exposure.parameterSemantics !== 'object' || Array.isArray(exposure.parameterSemantics)) {
            throw new TypeError(`Agent action ${capability.id} parameterSemantics must be an object.`);
        }
        for (const [parameter, semantics] of Object.entries(exposure.parameterSemantics)) {
            if (!Object.prototype.hasOwnProperty.call(properties, parameter)) {
                throw new TypeError(`Agent action ${capability.id} declares semantics for unknown input ${parameter}.`);
            }
            if (!semantics || typeof semantics !== 'object' || !roles.has(String(semantics.role || ''))) {
                throw new TypeError(`Agent action ${capability.id} input ${parameter} must declare a supported semantic role.`);
            }
        }
    }
    if (exposure.personalizableParameters !== undefined) {
        if (!exposure.personalizableParameters || typeof exposure.personalizableParameters !== 'object' || Array.isArray(exposure.personalizableParameters)) {
            throw new TypeError(`Agent action ${capability.id} personalizableParameters must be an object.`);
        }
        for (const [parameterPath, declaration] of Object.entries(exposure.personalizableParameters)) {
            if (!declaration || declaration.allowUserDefault !== true || !getPersonalizableParameter(capability, parameterPath)) {
                throw new TypeError(`Agent action ${capability.id} personalizable parameter ${parameterPath} must be optional and type-safe.`);
            }
        }
    }
    if (!String(exposure.outputDescription || '').trim()) {
        throw new TypeError(`Agent action ${capability.id} must describe its result.`);
    }
    if (!String(exposure.useWhen || '').trim() || !String(exposure.avoidWhen || '').trim()) {
        throw new TypeError(`Agent action ${capability.id} must describe when to use and avoid it.`);
    }
    const validEffects = new Set(['read_only', 'generated_output', 'local_change', 'external_side_effect', 'persistent_automation']);
    if (!validEffects.has(capability.effect)) {
        throw new TypeError(`Agent action ${capability.id} must declare a valid effect.`);
    }
    if (!['never', 'required'].includes(capability.confirmPolicy)) {
        throw new TypeError(`Agent action ${capability.id} must declare a valid confirmation policy.`);
    }
    if (['external_side_effect', 'persistent_automation'].includes(capability.effect) && capability.confirmPolicy !== 'required') {
        throw new TypeError(`Agent action ${capability.id} must require confirmation for ${capability.effect}.`);
    }
    try {
        agentActionAjv.compile({
            $schema: 'https://json-schema.org/draft/2020-12/schema',
            ...exposure.inputSchema
        });
    } catch (cause) {
        throw new TypeError(`Agent action ${capability.id} has an invalid inputSchema.`, { cause });
    }
}

function createCapabilityRegistry(deps = {}) {
    const configState = deps.configState || null;
    const routing = deps.knowledgeRouting || {};
    const knowledgeRegistry = deps.knowledgeRegistry || null;
    const recommendationMaterializer = deps.recommendationMaterializer || null;
    const recommendationRequestService = deps.recommendationRequestService || null;
    const capabilityDeps = { ...deps, configState, knowledgeRegistry, recommendationRequestService, recommendationMaterializer };

    const allCapabilities = [];
    const registryCapabilityDeps = {
        ...capabilityDeps,
        listAgentCapabilities: () => allCapabilities.filter((capability) => (
            capability.agentExposure && capability.agentExposure.discoverable !== false
        )).map(normalizeCapability)
    };
    allCapabilities.push(
        ...createAgentMetaCapabilities(registryCapabilityDeps),
        ...createAgentPendingCapabilities(capabilityDeps),
        ...createAgentPreferenceCapabilities(capabilityDeps),
        ...createAgentRecommendationCapabilities(capabilityDeps),
    );

    allCapabilities.push(...createAgentUserRuleCapabilities(registryCapabilityDeps));
    allCapabilities.push(...createAgentActionPreferenceCapabilities(registryCapabilityDeps));

    for (const [index, provider] of (Array.isArray(deps.agentActionProviders) ? deps.agentActionProviders : []).entries()) {
        const createActions = typeof provider === 'function'
            ? provider
            : provider?.createAgentActions;
        if (typeof createActions !== 'function') {
            throw new TypeError(`Agent action provider at index ${index} must be a function or expose createAgentActions().`);
        }
        const actions = createActions(capabilityDeps);
        if (!Array.isArray(actions)) {
            throw new TypeError(`Agent action provider at index ${index} must return an array.`);
        }
        allCapabilities.push(...actions);
    }

    const capabilitiesById = new Map();
    allCapabilities.forEach((rawCapability) => {
        const capability = normalizeCapability(rawCapability);
        const id = capability.id;
        if (capabilitiesById.has(id)) throw new Error(`Duplicate capability ${id}.`);
        validateAgentActionDescriptor({ ...capability, id });
        capabilitiesById.set(id, capability);
    });

    return {
        configState,
        knowledgeRegistry,
        knowledgeRouting: routing,
        list() {
            return [...capabilitiesById.values()];
        },
        listAgentActions() {
            return [...capabilitiesById.values()].filter((capability) => (
                capability.agentExposure && capability.agentExposure.discoverable !== false
            ));
        },
        getAgentAction(actionId) {
            const capability = capabilitiesById.get(String(actionId || '').trim());
            return capability?.agentExposure ? capability : null;
        },
        get(id) {
            return capabilitiesById.get(String(id || '').trim()) || null;
        },
        has(id) {
            return capabilitiesById.has(String(id || '').trim());
        },
        async validateAction(action, context = {}) {
            const capability = action.action_id
                ? this.getAgentAction(action.action_id)
                : this.get(buildCapabilityId(action.domain, action.name));
            if (!capability) return { ok: false, errors: ['등록되지 않은 capability입니다.'], normalizedParams: null };
            return capability.validate(action.params || {}, context);
        },
        async previewAction(action, context = {}) {
            const capability = action.action_id
                ? this.getAgentAction(action.action_id)
                : this.get(buildCapabilityId(action.domain, action.name));
            if (!capability) throw new Error('등록되지 않은 capability입니다.');
            return capability.preview(action.params || {}, context);
        },
        async executeAction(action, context = {}) {
            const capability = action.action_id
                ? this.getAgentAction(action.action_id)
                : this.get(buildCapabilityId(action.domain, action.name));
            if (!capability) throw new Error('등록되지 않은 capability입니다.');
            const validation = await capability.validate(action.params || {}, context);
            if (!validation.ok) {
                throw new Error(validation.errors.join(' '));
            }
            const normalizedAction = { ...action, params: validation.normalizedParams };
            return capability.execute(normalizedAction.params || {}, context);
        }
    };
}

module.exports = {
    createCapabilityRegistry
};
