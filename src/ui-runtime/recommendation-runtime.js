const { ConfirmationStore } = require('../adapters/storage/confirmations/confirmation-store');
const { createMemoryRetrievalService } = require('../services/memory/retrieval-service');
const { createRecommendationMaterializer } = require('../services/recommendations/adapters/recommendation-materializer');
const { createRecommendationDeliveryScheduler } = require('../services/recommendations/delivery/scheduler');
const { createRecommendationHandoffService } = require('../services/recommendations/handoff/service');
const { createPolicyContextCollector } = require('../services/recommendations/policy/context');
const { createRecommendationPolicyEvaluator } = require('../services/recommendations/policy/evaluator');
const { createCommerceOpportunityProducer } = require('../services/recommendations/producers/commerce-opportunity');
const { createContentKnowledgeCollector } = require('../services/recommendations/producers/content-knowledge-collector');
const { createContentOpportunityProducer } = require('../services/recommendations/producers/content-opportunity');
const { createJobRecoveryProducer } = require('../services/recommendations/producers/job-recovery');
const { createOperationalStateCollector } = require('../services/recommendations/producers/operational-state-collector');
const { createPendingWorkflowProducer } = require('../services/recommendations/producers/pending-workflow');
const { createRecommendationProducerRunner } = require('../services/recommendations/producers/runtime');
const { createSetupGuidanceProducer } = require('../services/recommendations/producers/setup-guidance');
const { createRecommendationRefreshService } = require('../ui-api/services/recommendation-refresh.service');

function createUiRecommendationRuntime(options = {}) {
    const { CONFIG, License, Logger, eventStore, capabilityRegistry, fs, path } = options;
    const confirmationStore = options.confirmationStore || new ConfirmationStore({
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
