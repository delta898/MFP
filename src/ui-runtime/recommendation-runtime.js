const { ConfirmationStore } = require('../agent/confirmation-store');
const { createMemoryRetrievalService } = require('../memory/retrieval-service');
const { createRecommendationMaterializer } = require('../recommendations/adapters/recommendation-materializer');
const { createRecommendationDeliveryScheduler } = require('../recommendations/delivery/scheduler');
const { createRecommendationHandoffService } = require('../recommendations/handoff/service');
const { createPolicyContextCollector } = require('../recommendations/policy/context');
const { createRecommendationPolicyEvaluator } = require('../recommendations/policy/evaluator');
const { createCommerceOpportunityProducer } = require('../recommendations/producers/commerce-opportunity');
const { createContentKnowledgeCollector } = require('../recommendations/producers/content-knowledge-collector');
const { createContentOpportunityProducer } = require('../recommendations/producers/content-opportunity');
const { createJobRecoveryProducer } = require('../recommendations/producers/job-recovery');
const { createOperationalStateCollector } = require('../recommendations/producers/operational-state-collector');
const { createPendingWorkflowProducer } = require('../recommendations/producers/pending-workflow');
const { createRecommendationProducerRunner } = require('../recommendations/producers/runtime');
const { createSetupGuidanceProducer } = require('../recommendations/producers/setup-guidance');
const { createRecommendationRefreshService } = require('../ui-api/services/recommendation-refresh.service');

function createUiRecommendationRuntime(options = {}) {
    const { CONFIG, License, Logger, eventStore, capabilityRegistry, fs, path } = options;
    const confirmationStore = new ConfirmationStore({
        persistPath: path.join(CONFIG.ROOT_DIR || process.cwd(), 'data', 'recommendation-confirmations.json')
    });
    const handoffService = createRecommendationHandoffService({
        recommendationStore: eventStore,
        capabilityRegistry,
        confirmationStore
    });
    const retrievalService = createMemoryRetrievalService({ eventStore, confirmationStore });
    const operationalStateCollector = createOperationalStateCollector({ config: CONFIG, eventStore });
    const contentKnowledgeCollector = createContentKnowledgeCollector({
        knowledgeRegistry: capabilityRegistry.knowledgeRegistry
    });
    const producerRunner = createRecommendationProducerRunner({
        producers: [
            createContentOpportunityProducer(),
            createSetupGuidanceProducer(),
            createJobRecoveryProducer(),
            createPendingWorkflowProducer(),
            createCommerceOpportunityProducer()
        ]
    });
    const policyContextCollector = createPolicyContextCollector({
        capabilityRegistry,
        recommendationStore: eventStore,
        licenseFeatureReader: (_input, context) => context.license_features,
        settingReadinessReader: (_input, context) => context.operational_state?.readiness,
        quotaReader: (_input, context) => context.quota
    });
    const policyEvaluator = createRecommendationPolicyEvaluator({
        contextCollector: policyContextCollector,
        materializer: createRecommendationMaterializer({ eventStore, Logger }),
        rankingOptions: { perKindLimit: 3 }
    });
    const refreshService = createRecommendationRefreshService({
        eventStore,
        memoryRetrievalService: retrievalService,
        operationalStateCollector,
        contentKnowledgeCollector,
        producerRunner,
        policyEvaluator,
        licenseStatusReader: () => License.checkLicenseStatus({ quiet: true }),
        logger: Logger
    });
    const deliveryScheduler = createRecommendationDeliveryScheduler({
        refreshService,
        fs,
        path,
        persistPath: path.join(CONFIG.ROOT_DIR || process.cwd(), 'data', 'recommendation-delivery-state.json'),
        enabled: CONFIG.RECOMMENDATION_DELIVERY_ENABLED !== false,
        intervalMinutes: CONFIG.RECOMMENDATION_REFRESH_INTERVAL_MIN,
        startupDelayMs: CONFIG.RECOMMENDATION_STARTUP_DELAY_MS,
        logger: Logger
    });

    return {
        confirmationStore,
        handoffService,
        retrievalService,
        refreshService,
        deliveryScheduler
    };
}

module.exports = { createUiRecommendationRuntime };
