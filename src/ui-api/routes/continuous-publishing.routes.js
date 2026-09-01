function createContinuousPublishingRouteHandler(deps = {}) {
    const { controller } = deps;

    return async function tryHandleContinuousPublishingRoute(ctx = {}) {
        if (ctx.pathname === '/api/v1/continuous-publishing/automation/settings') return controller.automationSettings(ctx);
        if (ctx.pathname === '/api/v1/continuous-publishing/automation/test') return controller.automationTest(ctx);
        if (ctx.pathname === '/api/v1/continuous-publishing/topics') return controller.topics(ctx);
        if (ctx.pathname === '/api/v1/continuous-publishing/topics/update') return controller.updateTopic(ctx);
        if (ctx.pathname === '/api/v1/continuous-publishing/topics/delete') return controller.deleteSavedTopic(ctx);
        if (ctx.pathname === '/api/v1/continuous-publishing/queue') return controller.queue(ctx);
        if (ctx.pathname === '/api/v1/continuous-publishing/queue/remove') return controller.removeFromQueue(ctx);
        if (ctx.pathname === '/api/v1/continuous-publishing/queue/reorder') return controller.reorderQueue(ctx);
        if (ctx.pathname === '/api/v1/continuous-publishing/runner/start') return controller.startRunner(ctx);
        if (ctx.pathname === '/api/v1/continuous-publishing/runner/status') return controller.runnerStatus(ctx);
        if (ctx.pathname === '/api/v1/continuous-publishing/status-summary') return controller.statusSummary(ctx);
        return false;
    };
}

module.exports = {
    createContinuousPublishingRouteHandler
};
