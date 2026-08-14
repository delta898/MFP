const { validateActionEnvelope } = require('./action-schema');
const { buildPlanFromActions } = require('./planner-rules');

function createPlanner(options = {}) {
    const capabilityRegistry = options.capabilityRegistry;
    const config = options.CONFIG || null;

    if (!capabilityRegistry) {
        throw new Error('capabilityRegistry is required');
    }

    return {
        async buildPlan(envelope = {}, context = {}) {
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
                plan: buildPlanFromActions({
                    ...validation.envelope,
                    routing: capabilityRegistry.knowledgeRouting
                        || config?.knowledge?.routing
                        || config?.KNOWLEDGE_ROUTING
                        || {},
                    pending_confirmations: Array.isArray(context?.memory?.pending_confirmations)
                        ? context.memory.pending_confirmations
                        : []
                })
            };
        }
    };
}

module.exports = {
    createPlanner
};
