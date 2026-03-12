const { validateActionEnvelope } = require('./action-schema');
const { buildSingleActionPlan } = require('./planner-contract');

function createPlanner(options = {}) {
    const capabilityRegistry = options.capabilityRegistry;

    if (!capabilityRegistry) {
        throw new Error('capabilityRegistry is required');
    }

    return {
        async buildPlan(envelope = {}) {
            const validation = validateActionEnvelope(envelope, capabilityRegistry);
            if (!validation.ok) {
                return {
                    ok: false,
                    errors: validation.errors,
                    envelope: validation.envelope
                };
            }

            return {
                ok: true,
                envelope: validation.envelope,
                plan: buildSingleActionPlan(validation.envelope)
            };
        }
    };
}

module.exports = {
    createPlanner
};
