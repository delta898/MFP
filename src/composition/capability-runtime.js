const { createCapabilityRegistry } = require('../host/agent/capability-registry/registry');
const { createConfigStateManager } = require('../host/configuration/structured-config-state');
const { createRecommendationRequestService } = require('../services/recommendations/request-service');
const { createMemoryContextRecommendationProducer } = require('../services/recommendations/producers/memory-context');
const { createRecommendationMaterializer } = require('../services/recommendations/adapters/recommendation-materializer');
const { createBlogTopicRecommendationsApplication } = require('../applications/blog/topic-recommendations/application');
const { createBlogQueueManagementApplication } = require('../applications/blog/queue-management/application');
const { createAiMemoryContentIdeaProvider } = require('../applications/blog/topic-recommendations/ai-memory-provider');
const { createContentIdeaCapabilities } = require('../applications/blog/agent-actions/ideas');
const { createRegisterTopicCapabilities } = require('../applications/blog/agent-actions/register-topic');
const { createPublishCapabilities } = require('../applications/blog/agent-actions/publish');
const { createKeywordResearchCapabilities } = require('../applications/blog/agent-actions/keyword-research');
const { createBlogQueueManagementCapabilities } = require('../applications/blog/agent-actions/queue-management');
const { createChatModelCapabilities } = require('../applications/settings/agent-actions/chat-model');
const { createBlogKeywordResearchRuntime } = require('./blog-keyword-research');

function createCapabilityRuntime(deps = {}) {
    const topicRecommendationsApplication = deps.topicRecommendationsApplication
        || createBlogTopicRecommendationsApplication({
            knowledgeRegistry: deps.knowledgeRegistry,
            Logger: deps.Logger,
            providers: [
                createAiMemoryContentIdeaProvider({
                    Logger: deps.Logger,
                    generateText: typeof deps.blogWritingApplication?.generateChatText === 'function'
                        ? (prompt, modelOptions = {}) => deps.blogWritingApplication.generateChatText(prompt, {
                            generationOptions: {
                                ...(typeof modelOptions.temperature === 'number' ? { temperature: modelOptions.temperature } : {}),
                                ...(typeof modelOptions.maxTokens === 'number' ? { maxOutputTokens: modelOptions.maxTokens } : {}),
                                responseFormat: 'json'
                            }
                        })
                        : undefined
                })
            ]
        });

    const keywordResearchApplication = deps.keywordResearchApplication
        || createBlogKeywordResearchRuntime(deps);

    let blogQueueManagementApplication = deps.blogQueueManagementApplication || null;
    if (!blogQueueManagementApplication && typeof deps.GoogleSheets?.appendGoogleSheetTopics === 'function') {
        const topicStore = {
            async append(rows, options) {
                await deps.ensureSheetsReadyForUi?.();
                const result = await deps.GoogleSheets.appendGoogleSheetTopics(rows, options);
                if (result?.success) deps.GoogleSheets.clearSheetCache?.('topics');
                return result;
            }
        };
        const canReadTopics = typeof deps.GoogleSheets.readGoogleSheetTopicsAll === 'function';
        const canUpdateTopicStatus = typeof deps.GoogleSheets.updateGoogleSheetStatus === 'function';
        const canUpdateTopicFields = typeof deps.GoogleSheets.updateGoogleSheetTopicEditableFields === 'function';
        if (canReadTopics) {
            topicStore.readAll = async (options) => {
                await deps.ensureSheetsReadyForUi?.();
                return deps.GoogleSheets.readGoogleSheetTopicsAll({ ...options, throwOnError: true });
            };
            topicStore.readByStatus = async (status, options = {}) => {
                await deps.ensureSheetsReadyForUi?.();
                return deps.GoogleSheets.readGoogleSheetTopicsAll({ ...options, status, throwOnError: true });
            };
        }
        if (canUpdateTopicStatus) {
            topicStore.updateStatus = async (rowIndex, status, reason) => {
                await deps.ensureSheetsReadyForUi?.();
                await deps.GoogleSheets.updateGoogleSheetStatus(rowIndex, status, reason, { throwOnError: true });
                deps.GoogleSheets.clearSheetCache?.('topics');
            };
        }
        if (canUpdateTopicFields) {
            topicStore.updateEditableFields = async (rowIndex, fields) => {
                await deps.ensureSheetsReadyForUi?.();
                const result = await deps.GoogleSheets.updateGoogleSheetTopicEditableFields(rowIndex, fields);
                deps.GoogleSheets.clearSheetCache?.('topics');
                return result;
            };
        }
        blogQueueManagementApplication = createBlogQueueManagementApplication({
            topicStore,
            isBusy: () => deps.blogNextExecutionCoordinator?.getStatus?.().busy === true
        });
        blogQueueManagementApplication.supportsQueueListing = canReadTopics;
        blogQueueManagementApplication.supportsTopicMoving = canReadTopics && canUpdateTopicStatus;
        blogQueueManagementApplication.supportsTopicUpdating = canReadTopics && canUpdateTopicFields;
    }

    const configState = deps.configState || createConfigStateManager(deps);
    const recommendationMaterializer = deps.recommendationMaterializer || createRecommendationMaterializer({
        eventStore: deps.eventStore,
        Logger: deps.Logger
    });
    const recommendationRequestService = deps.recommendationRequestService || createRecommendationRequestService({
        knowledgeRegistry: deps.knowledgeRegistry,
        recommendationMaterializer,
        Logger: deps.Logger,
        providers: [createMemoryContextRecommendationProducer()]
    });

    return createCapabilityRegistry({
        ...deps,
        configState,
        recommendationMaterializer,
        recommendationRequestService,
        topicRecommendationsApplication,
        keywordResearchApplication,
        blogQueueManagementApplication,
        agentActionProviders: [
            ...(Array.isArray(deps.agentActionProviders) ? deps.agentActionProviders : []),
            (actionDeps) => createRegisterTopicCapabilities(actionDeps),
            (actionDeps) => createBlogQueueManagementCapabilities(actionDeps),
            (actionDeps) => createPublishCapabilities(actionDeps),
            (actionDeps) => createContentIdeaCapabilities(actionDeps),
            (actionDeps) => createKeywordResearchCapabilities(actionDeps),
            (actionDeps) => createChatModelCapabilities(actionDeps)
        ]
    });
}

module.exports = { createCapabilityRuntime };
