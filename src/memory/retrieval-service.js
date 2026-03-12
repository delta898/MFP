function createMemoryRetrievalService(options = {}) {
    const eventStore = options.eventStore || null;
    const confirmationStore = options.confirmationStore || null;

    return {
        async buildContextPacket(input = {}) {
            const conversationId = String(input.conversationId || '').trim();
            const userId = String(input.userId || '').trim();
            const limit = Number.isFinite(Number(input.limit)) ? Math.max(1, Math.min(20, Number(input.limit))) : 8;

            let recentEvents = [];
            let recentMessages = [];
            let recentActions = [];
            let recentSettingChanges = [];
            let recentJobRuns = [];
            let recentArtifacts = [];
            let preferences = [];

            if (eventStore && conversationId) {
                try {
                    if (typeof eventStore.listConversationEvents === 'function') {
                        recentEvents = await eventStore.listConversationEvents(conversationId, limit);
                    }
                    if (typeof eventStore.listRecentMessages === 'function') {
                        recentMessages = await eventStore.listRecentMessages(conversationId, Math.min(6, limit));
                    }
                    if (typeof eventStore.listRecentActions === 'function') {
                        recentActions = await eventStore.listRecentActions(conversationId, Math.min(6, limit));
                    }
                    if (typeof eventStore.listRecentSettingChanges === 'function') {
                        recentSettingChanges = await eventStore.listRecentSettingChanges(conversationId, Math.min(6, limit));
                    }
                    if (typeof eventStore.listRecentJobRuns === 'function') {
                        recentJobRuns = await eventStore.listRecentJobRuns(conversationId, Math.min(6, limit));
                    }
                    if (typeof eventStore.listRecentArtifacts === 'function') {
                        recentArtifacts = await eventStore.listRecentArtifacts(conversationId, 'content_idea', Math.min(8, limit));
                    }
                    if (typeof eventStore.listUserPreferences === 'function' && userId) {
                        preferences = await eventStore.listUserPreferences(userId, Math.min(10, limit));
                    }
                } catch (_ignore) { }
            }

            let pendingConfirmations = [];
            if (confirmationStore && typeof confirmationStore.getPendingByUser === 'function' && userId) {
                try {
                    pendingConfirmations = confirmationStore.getPendingByUser(userId);
                } catch (_ignore) { }
            }

            return {
                recent_events: Array.isArray(recentEvents) ? recentEvents : [],
                recent_messages: Array.isArray(recentMessages) ? recentMessages : [],
                recent_actions: Array.isArray(recentActions) ? recentActions : [],
                recent_setting_changes: Array.isArray(recentSettingChanges) ? recentSettingChanges : [],
                recent_job_runs: Array.isArray(recentJobRuns) ? recentJobRuns : [],
                recent_artifacts: Array.isArray(recentArtifacts) ? recentArtifacts : [],
                preferences: Array.isArray(preferences) ? preferences : [],
                pending_confirmations: Array.isArray(pendingConfirmations) ? pendingConfirmations.map((item) => ({
                    id: item.id,
                    status: item.status,
                    createdAt: item.createdAt,
                    previews: item.previews || [],
                    plan: item.plan && typeof item.plan === 'object' ? item.plan : null
                })) : []
            };
        }
    };
}

module.exports = {
    createMemoryRetrievalService
};
